"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { forEachConcurrent } from "@/lib/forEachConcurrent";
import { mergeReceipts } from "@/lib/mergeReceipts";
import { SubmissionInfoModal, type SubmissionInfo } from "./SubmissionInfoModal";

type ReceiptItem = {
  id: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  blobUrl: string;
  /** Set by the page for receipts that were already analysed before this visit. */
  analyzed?: boolean;
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

  /**
   * Analyses one receipt in the background as soon as it is uploaded, so most of
   * the work is done by the time the user has filled in the info dialog.
   */
  const startAnalysis = useCallback(
    (id: string) => {
      if (analysesRef.current.has(id)) return;
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
        () => setAnalysis((prev) => ({ ...prev, [id]: "done" })),
        () => setAnalysis((prev) => ({ ...prev, [id]: "error" }))
      );
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
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-9 rounded-md bg-secondary px-4 text-sm font-medium text-ink hover:bg-secondary-hover"
            >
              Velg filer
            </button>
            <p className="text-[12.5px]">Bilder og PDF</p>
          </div>

          {receipts.length === 0 && uploadingFiles.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">
              Ingen kvitteringer lagt til ennå.
            </p>
          ) : (
            <ul className="mt-3">
              {receipts.map((r) => (
                <li
                  key={r.id}
                  className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 border-t border-rule py-2.5"
                >
                  <span
                    className="grid h-9 w-9 place-items-center rounded-md bg-raised text-[11px] font-semibold tracking-wide text-muted"
                    aria-hidden
                  >
                    {fileType(r)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink" title={r.originalFileName}>
                      {r.originalFileName}
                    </p>
                    {analysis[r.id] === "pending" && (
                      <p className="text-[12.5px] text-muted">Leser kvitteringen…</p>
                    )}
                    {analysis[r.id] === "done" && (
                      <p className="text-[12.5px] text-muted">Lest</p>
                    )}
                    {analysis[r.id] === "error" && (
                      <p className="text-[12.5px] text-warn-ink">Leses på nytt når du går videre</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
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
                      className="inline-flex h-[30px] items-center rounded-md px-2.5 text-[13px] text-muted hover:bg-neg-soft hover:text-neg"
                    >
                      Slett
                    </button>
                  </div>
                </li>
              ))}
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
