"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { forEachConcurrent } from "@/lib/forEachConcurrent";
import { mergeReceipts } from "@/lib/mergeReceipts";
import { SubmissionInfoModal, type SubmissionInfo } from "./SubmissionInfoModal";
import { UPLOAD_INTRO_SEEN_KEY, UploadIntro } from "./UploadIntro";

type ReceiptItem = {
  id: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  blobUrl: string;
  /** Set by the page for receipts that were already analysed before this visit. */
  analyzed?: boolean;
  /** Extra images of the same receipt, after its own file. */
  parts?: Array<{ id: string; mimeType: string; originalFileName: string }>;
};

type AnalysisState = "pending" | "done" | "error";

const UPLOAD_CONCURRENCY = 3;
/** Background analyses per browser; each is its own server request. */
const BACKGROUND_ANALYSIS_CONCURRENCY = 3;

function isPdf(mime: string): boolean {
  return mime.toLowerCase().includes("pdf");
}

export function UploadStep({
  token,
  receipts: initialReceipts,
  initialInfo,
}: {
  token: string;
  receipts: ReceiptItem[];
  initialInfo: Omit<SubmissionInfo, "workDate"> & { workDate: string | null };
}) {
  const router = useRouter();
  const [receipts, setReceipts] = useState<ReceiptItem[]>(initialReceipts);
  const [uploadingFiles, setUploadingFiles] = useState<Array<{ id: string; fileName: string }>>([]);
  const [analysis, setAnalysis] = useState<Record<string, AnalysisState>>(() =>
    Object.fromEntries(initialReceipts.filter((r) => r.analyzed).map((r) => [r.id, "done"]))
  );
  const [error, setError] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [continueError, setContinueError] = useState<string | null>(null);
  const [info, setInfo] = useState<SubmissionInfo>(() => ({
    ...initialInfo,
    workDate: initialInfo.workDate ?? new Date().toISOString().slice(0, 10),
  }));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const deletedIdsRef = useRef<Set<string>>(new Set());
  const uploadsRef = useRef<Set<Promise<void>>>(new Set());
  const analysesRef = useRef<Map<string, Promise<void>>>(new Map());
  const activeAnalysesRef = useRef(0);
  const waitingAnalysesRef = useRef<Array<() => void>>([]);
  /** Bumped when a receipt is analysed again, so an older run cannot overwrite the newer state. */
  const analysisGenRef = useRef<Map<string, number>>(new Map());
  const partInputRef = useRef<HTMLInputElement>(null);
  const partTargetRef = useRef<string | null>(null);
  /** Receipts ticked for merging, in the order the user ticked them. */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busyIds, setBusyIds] = useState<Map<string, string>>(new Map());
  const [showIntro, setShowIntro] = useState(false);

  useEffect(() => {
    // Shown once per device, before the first upload; «Slik fungerer det» opens it again.
    let unseen = false;
    try {
      unseen = initialReceipts.length === 0 && !localStorage.getItem(UPLOAD_INTRO_SEEN_KEY);
    } catch {
      // Storage blocked: skip the intro rather than show it on every visit.
    }
    if (!unseen) return;
    const timer = setTimeout(() => setShowIntro(true), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeIntro = useCallback(() => {
    setShowIntro(false);
    try {
      localStorage.setItem(UPLOAD_INTRO_SEEN_KEY, "1");
    } catch {
      // ignore
    }
  }, []);

  /**
   * Analyses one receipt in the background as soon as it is uploaded, so most of
   * the work is done by the time the user has filled in the info dialog.
   */
  const startAnalysis = useCallback(
    (id: string, again = false) => {
      if (analysesRef.current.has(id) && !again) return;
      const gen = (analysisGenRef.current.get(id) ?? 0) + 1;
      analysisGenRef.current.set(id, gen);
      const current = () => analysisGenRef.current.get(id) === gen;
      setAnalysis((prev) => ({ ...prev, [id]: "pending" }));
      const run = async () => {
        if (activeAnalysesRef.current >= BACKGROUND_ANALYSIS_CONCURRENCY) {
          await new Promise<void>((resolve) => waitingAnalysesRef.current.push(resolve));
        }
        activeAnalysesRef.current++;
        try {
          if (deletedIdsRef.current.has(id)) return;
          const res = await fetch(
            `/api/submissions/${encodeURIComponent(token)}/receipts/${encodeURIComponent(id)}/analyze`,
            { method: "POST" }
          );
          // 404: deleted meanwhile. Failures are retried by /analyze when the user continues.
          if (!res.ok && res.status !== 404) throw new Error("Analyse feilet");
        } finally {
          activeAnalysesRef.current--;
          waitingAnalysesRef.current.shift()?.();
        }
      };
      const promise = run().then(
        () => current() && setAnalysis((prev) => ({ ...prev, [id]: "done" })),
        () => current() && setAnalysis((prev) => ({ ...prev, [id]: "error" }))
      ).then(() => undefined);
      analysesRef.current.set(id, promise);
    },
    [token]
  );

  useEffect(() => {
    // Resume receipts uploaded on an earlier visit that were never analysed.
    initialReceipts.filter((r) => !r.analyzed).forEach((r) => startAnalysis(r.id));
    // Runs once on mount; startAnalysis ignores receipts it has already started.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (fileList == null || fileList.length === 0) return;
      const allowed = ["image/", "application/pdf"];
      const files = Array.from(fileList).filter((file) =>
        allowed.some((p) => file.type.toLowerCase().startsWith(p))
      );
      const batchId = Date.now();
      setUploadingFiles((prev) => [
        ...prev,
        ...files.map((file, i) => ({ id: `upload-${batchId}-${i}`, fileName: file.name })),
      ]);
      // iPhone photos are 2–3 MB each; uploading a few at a time instead of one by one
      // shortens the wait without saturating a mobile connection.
      const batch = forEachConcurrent(files.map((file, i) => ({ file, i })), UPLOAD_CONCURRENCY, async ({ file, i }) => {
        const tempId = `upload-${batchId}-${i}`;
        try {
          const clientPayload = JSON.stringify({
            token,
            originalFileName: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
          });
          const blob = await upload(file.name, file, {
            access: "private",
            handleUploadUrl: "/api/blob",
            clientPayload,
          });
          const res = await fetch("/api/receipts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token,
              originalFileName: file.name,
              mimeType: file.type,
              sizeBytes: file.size,
              blobUrl: blob.url,
              blobPath: (blob as { pathname?: string }).pathname ?? blob.url,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Kunne ikke lagre kvittering");
          // Parallel responses can arrive out of order, so merge instead of replacing.
          setReceipts((prev) => mergeReceipts(prev, data.receipts, deletedIdsRef.current));
          const created = (data.receipts as ReceiptItem[]).find((r) => r.blobUrl === blob.url);
          if (created) startAnalysis(created.id);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setUploadingFiles((prev) => prev.filter((f) => f.id !== tempId));
        }
      });
      uploadsRef.current.add(batch);
      try {
        await batch;
      } finally {
        uploadsRef.current.delete(batch);
      }
    },
    [token, startAnalysis]
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const setBusy = (id: string, label: string | null) =>
    setBusyIds((prev) => {
      const next = new Map(prev);
      if (label) next.set(id, label);
      else next.delete(id);
      return next;
    });

  /** Runs a change to the receipt list (add image, merge, split) and tracks it like an upload. */
  const trackChange = (work: Promise<void>) => {
    uploadsRef.current.add(work);
    work.finally(() => uploadsRef.current.delete(work));
    return work;
  };

  /** Adds the chosen files, in order, as further images of the receipt the user picked. */
  const handleAddParts = (fileList: FileList | null) => {
    const receiptId = partTargetRef.current;
    partTargetRef.current = null;
    if (!receiptId || !fileList?.length) return;
    const files = Array.from(fileList).filter((f) => /^(image\/|application\/pdf)/i.test(f.type));
    if (files.length === 0) return;
    setError(null);
    setBusy(receiptId, "Laster opp bilde…");
    return trackChange(
      (async () => {
        try {
          for (const file of files) {
            const blob = await upload(file.name, file, {
              access: "private",
              handleUploadUrl: "/api/blob",
              clientPayload: JSON.stringify({ token, originalFileName: file.name, mimeType: file.type, sizeBytes: file.size }),
            });
            const res = await fetch(
              `/api/submissions/${encodeURIComponent(token)}/receipts/${encodeURIComponent(receiptId)}/parts`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  originalFileName: file.name,
                  mimeType: file.type,
                  sizeBytes: file.size,
                  blobUrl: blob.url,
                  blobPath: (blob as { pathname?: string }).pathname ?? blob.url,
                }),
              }
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error ?? "Kunne ikke legge til bildet");
            setReceipts((prev) => mergeReceipts(prev, data.receipts, deletedIdsRef.current));
          }
          startAnalysis(receiptId, true);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(receiptId, null);
        }
      })()
    );
  };

  /** Merges the selected receipts into the first one ticked, in the order they were ticked. */
  const handleMergeSelected = () => {
    const ordered = selectedIds.filter((id) => receipts.some((r) => r.id === id));
    if (ordered.length < 2) return;
    const [targetId, ...sourceIds] = ordered;
    setError(null);
    setBusy(targetId, "Slår sammen…");
    return trackChange(
      (async () => {
        try {
          const res = await fetch(`/api/submissions/${encodeURIComponent(token)}/receipts/merge`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetId, sourceIds }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error ?? "Kunne ikke slå sammen kvitteringene");
          sourceIds.forEach((id) => deletedIdsRef.current.add(id));
          setReceipts((prev) => mergeReceipts(prev, data.receipts, deletedIdsRef.current));
          setSelectedIds([]);
          startAnalysis(targetId, true);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(targetId, null);
        }
      })()
    );
  };

  /** Turns the extra images of a receipt back into receipts of their own. */
  const handleSplit = (id: string) => {
    setError(null);
    setBusy(id, "Deler opp…");
    return trackChange(
      (async () => {
        try {
          const res = await fetch(
            `/api/submissions/${encodeURIComponent(token)}/receipts/${encodeURIComponent(id)}/split`,
            { method: "POST" }
          );
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error ?? "Kunne ikke dele opp kvitteringen");
          const list = data.receipts as ReceiptItem[];
          setReceipts((prev) => mergeReceipts(prev, list, deletedIdsRef.current));
          startAnalysis(id, true);
          list.filter((r) => !r.analyzed && r.id !== id).forEach((r) => startAnalysis(r.id));
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(id, null);
        }
      })()
    );
  };

  const toggleSelected = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleOpenInfo = () => {
    if (receipts.length === 0 && uploadingFiles.length === 0) {
      setError("Last opp minst én kvittering først.");
      return;
    }
    setError(null);
    setContinueError(null);
    setShowInfoModal(true);
  };

  /** Saves the info, waits for uploads and background analyses, then lets /analyze finish the rest. */
  const handleContinue = async (values: SubmissionInfo) => {
    setInfo(values);
    setContinueError(null);
    setContinuing(true);
    try {
      const cash = values.productionCash.trim() === "" ? null : Math.round(Number(values.productionCash));
      const saveRes = await fetch("/api/submission", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          name: values.name.trim() || null,
          projectNumber: values.projectNumber.trim() || null,
          project: values.project.trim() || null,
          workDate: values.workDate || null,
          accountNumber: values.accountNumber.trim() || null,
          productionCash: cash != null && Number.isFinite(cash) ? cash : null,
        }),
      });
      if (!saveRes.ok) {
        const data = await saveRes.json().catch(() => ({}));
        throw new Error(data.error ?? "Kunne ikke lagre person- og prosjektinfo");
      }
      await Promise.allSettled([...uploadsRef.current]);
      await Promise.allSettled([...analysesRef.current.values()]);
      const res = await fetch(`/api/submissions/${encodeURIComponent(token)}/analyze`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Analyse feilet");
      }
      router.push(`/s/${token}/review`);
    } catch (e) {
      setContinueError((e as Error).message);
      setContinuing(false);
    }
  };

  const handleDeleteReceipt = async (id: string) => {
    try {
      const res = await fetch(
        `/api/receipts/${id}?token=${encodeURIComponent(token)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Kunne ikke slette");
      deletedIdsRef.current.add(id);
      setReceipts((prev) => prev.filter((r) => r.id !== id));
      setSelectedIds((prev) => prev.filter((x) => x !== id));
    } catch (_e) {
      setError("Kunne ikke slette kvittering");
    }
  };

  const progress = {
    total: receipts.length,
    done: receipts.filter((r) => analysis[r.id] === "done").length,
    failed: receipts.filter((r) => analysis[r.id] === "error").length,
    uploading: uploadingFiles.length,
  };

  const fileType = (r: ReceiptItem) =>
    isPdf(r.mimeType) ? "PDF" : /heic|heif/i.test(r.mimeType) || /\.hei[cf]$/i.test(r.originalFileName) ? "HEIC" : "BILDE";

  return (
    <div className="w-full min-w-0 space-y-3">
      <div className="-mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => setShowIntro(true)}
          className="text-[13px] text-muted underline decoration-control underline-offset-[3px] hover:text-ink hover:decoration-current"
        >
          Slik fungerer det
        </button>
      </div>
      <section className="rounded-lg border border-line bg-surface" aria-label="Kvitteringer">
        <div className="px-5 pt-5">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            className={`grid justify-items-center gap-2.5 rounded-lg border border-dashed px-5 py-7 text-center text-muted transition-colors ${
              isDraggingOver
                ? "border-solid border-data"
                : "border-control bg-comment hover:border-control-hover"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
              <path d="M9.25 13.25a.75.75 0 0 0 1.5 0V4.636l2.955 3.129a.75.75 0 0 0 1.09-1.03l-4.25-4.5a.75.75 0 0 0-1.09 0l-4.25 4.5a.75.75 0 1 0 1.09 1.03L9.25 4.636v8.614Z" />
              <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
            </svg>
            <p className="text-sm">Dra filer hit eller</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,image/heic,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={partInputRef}
              type="file"
              accept="image/*,image/heic,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                handleAddParts(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-9 rounded-md bg-secondary px-4 text-sm font-medium text-ink hover:bg-secondary-hover"
            >
              Velg filer
            </button>
            <p className="text-[12.5px]">Bilder og PDF</p>
            <p className="max-w-sm text-[12.5px]">
              Lang kvittering? Ta flere bilder, kryss dem av og velg «Slå sammen til én kvittering».
            </p>
          </div>

          {receipts.length === 0 && uploadingFiles.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">
              Ingen kvitteringer lagt til ennå.
            </p>
          ) : (
            <>
            {selectedIds.length > 0 && (
              <div
                className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-raised px-3 py-2 text-[13px]"
                role="status"
              >
                <span className="text-ink">
                  {selectedIds.length < 2
                    ? "Velg én til for å slå sammen bildene til én kvittering"
                    : `${selectedIds.length} valgt. Bildene blir én kvittering, i den rekkefølgen du valgte dem.`}
                </span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedIds([])}
                    className="h-8 rounded-md px-3 text-muted hover:text-ink"
                  >
                    Avbryt
                  </button>
                  <button
                    type="button"
                    onClick={handleMergeSelected}
                    disabled={selectedIds.length < 2}
                    className="h-8 rounded-md bg-primary px-3 font-medium text-primary-fg hover:bg-primary-hover disabled:opacity-45"
                  >
                    Slå sammen til én kvittering
                  </button>
                </span>
              </div>
            )}
            <ul className="mt-3">
              {receipts.map((r) => {
                const partCount = r.parts?.length ?? 0;
                const busy = busyIds.get(r.id);
                return (
                  <li
                    key={r.id}
                    className="grid grid-cols-[20px_36px_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 border-t border-rule py-2.5 sm:grid-cols-[20px_36px_minmax(0,1fr)_auto]"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(r.id)}
                      onChange={() => toggleSelected(r.id)}
                      disabled={!!busy}
                      aria-label={`Velg ${r.originalFileName} for å slå sammen`}
                      className="h-4 w-4 accent-primary"
                    />
                    <span
                      className="grid h-9 w-9 place-items-center rounded-md bg-raised text-[11px] font-semibold tracking-wide text-muted"
                      aria-hidden
                    >
                      {fileType(r)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink" title={r.originalFileName}>
                        {selectedIds.length > 1 && selectedIds.includes(r.id) && (
                          <span className="mr-1.5 rounded bg-primary px-1.5 py-px text-[11px] font-semibold text-primary-fg">
                            {selectedIds.indexOf(r.id) + 1}
                          </span>
                        )}
                        {r.originalFileName}
                        {partCount > 0 && (
                          <span className="font-normal text-muted">
                            {" "}+ {partCount} {partCount === 1 ? "bilde" : "bilder"}
                          </span>
                        )}
                      </p>
                      {busy ? (
                        <p className="text-[12.5px] text-muted">{busy}</p>
                      ) : (
                        <>
                          {analysis[r.id] === "pending" && (
                            <p className="text-[12.5px] text-muted">Leser kvitteringen…</p>
                          )}
                          {analysis[r.id] === "done" && (
                            <p className="text-[12.5px] text-muted">Lest</p>
                          )}
                          {analysis[r.id] === "error" && (
                            <p className="text-[12.5px] text-warn-ink">Leses på nytt når du går videre</p>
                          )}
                        </>
                      )}
                    </div>
                    <div className="col-start-3 flex flex-wrap items-center gap-1 sm:col-start-auto sm:justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          partTargetRef.current = r.id;
                          partInputRef.current?.click();
                        }}
                        disabled={!!busy}
                        className="inline-flex h-[30px] items-center rounded-md px-2.5 text-[13px] text-muted hover:bg-raised hover:text-ink disabled:opacity-50"
                      >
                        Legg til bilde
                      </button>
                      {partCount > 0 && (
                        <button
                          type="button"
                          onClick={() => handleSplit(r.id)}
                          disabled={!!busy}
                          className="inline-flex h-[30px] items-center rounded-md px-2.5 text-[13px] text-muted hover:bg-raised hover:text-ink disabled:opacity-50"
                        >
                          Del opp
                        </button>
                      )}
                      <a
                        href={`/api/submissions/${encodeURIComponent(token)}/receipts/${encodeURIComponent(r.id)}/blob`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-[30px] items-center rounded-md px-2.5 text-[13px] text-muted hover:bg-raised hover:text-ink"
                      >
                        Åpne
                      </a>
                      <button
                        type="button"
                        onClick={() => handleDeleteReceipt(r.id)}
                        disabled={!!busy}
                        className="inline-flex h-[30px] items-center rounded-md px-2.5 text-[13px] text-muted hover:bg-neg-soft hover:text-neg disabled:opacity-50"
                      >
                        Slett
                      </button>
                    </div>
                  </li>
                );
              })}
              {uploadingFiles.map(({ id, fileName }) => (
                <li
                  key={id}
                  className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-t border-rule py-2.5"
                  role="status"
                  aria-label={`Laster opp ${fileName}`}
                >
                  <span className="grid h-9 w-9 place-items-center rounded-md bg-raised text-muted" aria-hidden>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                      <path d="M9.25 13.25a.75.75 0 0 0 1.5 0V4.636l2.955 3.129a.75.75 0 0 0 1.09-1.03l-4.25-4.5a.75.75 0 0 0-1.09 0l-4.25 4.5a.75.75 0 1 0 1.09 1.03L9.25 4.636v8.614Z" />
                    </svg>
                  </span>
                  <p className="min-w-0 truncate text-sm font-medium text-ink" title={fileName}>
                    {fileName}
                  </p>
                  <span className="text-[12.5px] text-muted">Laster opp…</span>
                  <div className="col-start-2 col-end-4 h-1 overflow-hidden rounded bg-raised">
                    <div className="h-full w-[34%] rounded bg-load animate-analyze-progress" aria-hidden />
                  </div>
                </li>
              ))}
            </ul>
            </>
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center justify-between gap-3 border-t border-rule px-5 py-3.5">
          <span className="text-[13px] text-muted">
            {receipts.length > 0
              ? `${receipts.length} ${receipts.length === 1 ? "kvittering" : "kvitteringer"}`
              : "Legg til minst én kvittering"}
          </span>
          <button
            type="button"
            onClick={handleOpenInfo}
            disabled={receipts.length === 0 && uploadingFiles.length === 0}
            className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-45"
          >
            Gå videre
          </button>
        </div>
      </section>

      {error && <p className="text-sm text-neg">{error}</p>}

      {showIntro && <UploadIntro onClose={closeIntro} />}

      {showInfoModal && (
        <SubmissionInfoModal
          initialInfo={info}
          progress={progress}
          continuing={continuing}
          error={continueError}
          onContinue={handleContinue}
          onClose={() => setShowInfoModal(false)}
        />
      )}
    </div>
  );
}
