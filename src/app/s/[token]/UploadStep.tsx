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

  return (
    <div className="w-full min-w-0 max-w-2xl space-y-6">
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 md:p-6">
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          className={`mb-4 rounded-lg border-2 border-dashed p-6 text-center text-neutral-400 transition-colors ${
            isDraggingOver
              ? "border-green-500 bg-green-950/20"
              : "border-neutral-600 bg-neutral-800/50 hover:border-neutral-500"
          }`}
        >
          <p className="mb-2">Dra filer hit eller</p>
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
            className="rounded-lg bg-neutral-700 px-4 py-2 text-sm text-white hover:bg-neutral-600"
          >
            Velg filer
          </button>
          <p className="mt-2 text-xs">Bilder og PDF</p>
        </div>

        <ul className="space-y-2">
          {receipts.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-800/50 px-3 py-2"
            >
              <span className="text-xl shrink-0">
                {isPdf(r.mimeType) ? "📄" : "🖼️"}
              </span>
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="truncate text-sm text-white" title={r.originalFileName}>
                  {r.originalFileName}
                </p>
                {analysis[r.id] === "pending" && (
                  <p className="text-xs text-neutral-500">Leser kvitteringen…</p>
                )}
                {analysis[r.id] === "done" && (
                  <p className="text-xs text-neutral-500">Lest</p>
                )}
                {analysis[r.id] === "error" && (
                  <p className="text-xs text-amber-300/90">Leses på nytt når du går videre</p>
                )}
              </div>
              <a
                href={r.blobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded px-2 py-1 text-sm text-neutral-400 hover:text-white hover:bg-neutral-700"
              >
                Åpne
              </a>
              <button
                type="button"
                onClick={() => handleDeleteReceipt(r.id)}
                className="rounded px-2 py-1 text-sm text-red-400 hover:bg-red-500/20"
              >
                Slett
              </button>
            </li>
          ))}
          {uploadingFiles.map(({ id, fileName }) => (
            <li
              key={id}
              className="flex flex-col gap-2 rounded-lg border border-neutral-700 bg-neutral-800/50 px-3 py-2"
              role="status"
              aria-label={`Laster opp ${fileName}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xl opacity-70 shrink-0">📤</span>
                <p className="min-w-0 flex-1 truncate text-sm text-neutral-300" title={fileName}>
                  {fileName}
                </p>
                <span className="text-xs text-neutral-500 shrink-0">
                  Laster opp…
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-700">
                <div
                  className="h-full min-w-[30%] rounded-full bg-green-600 animate-analyze-progress"
                  aria-hidden
                />
              </div>
            </li>
          ))}
        </ul>
        {receipts.length === 0 && uploadingFiles.length === 0 && (
          <p className="text-center text-sm text-neutral-500">
            Ingen kvitteringer lagt til ennå.
          </p>
        )}
      </section>

      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={handleOpenInfo}
          disabled={receipts.length === 0 && uploadingFiles.length === 0}
          className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50"
        >
          Gå videre
        </button>
        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}
      </div>

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
