"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";

type ReceiptItem = {
  id: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  blobUrl: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isPdf(mime: string): boolean {
  return mime.toLowerCase().includes("pdf");
}

export function UploadStep({
  token,
  receipts: initialReceipts,
}: {
  token: string;
  receipts: ReceiptItem[];
}) {
  const router = useRouter();
  const [receipts, setReceipts] = useState<ReceiptItem[]>(initialReceipts);
  const [uploadingFiles, setUploadingFiles] = useState<Array<{ id: string; fileName: string }>>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ONBOARDING_SEEN_KEY = "expense-onboarding-seen";

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (files == null || files.length === 0) return;
      const allowed = ["image/", "application/pdf"];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!allowed.some((p) => file.type.toLowerCase().startsWith(p)))
          continue;
        const tempId = `upload-${Date.now()}-${i}`;
        setUploadingFiles((prev) => [...prev, { id: tempId, fileName: file.name }]);
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
          setReceipts(data.receipts);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setUploadingFiles((prev) => prev.filter((f) => f.id !== tempId));
        }
      }
    },
    [token]
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

  const handleAnalyze = async () => {
    if (receipts.length === 0) {
      setError("Last opp minst én kvittering først.");
      return;
    }
    setError(null);
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/submissions/${encodeURIComponent(token)}/analyze`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Analyse feilet");
      }
      try {
        const seen = sessionStorage.getItem(`${ONBOARDING_SEEN_KEY}-${token}`);
        if (seen === "1") {
          router.push(`/s/${token}/review`);
        } else {
          setShowOnboardingModal(true);
        }
      } catch {
        setShowOnboardingModal(true);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleOnboardingContinue = () => {
    try {
      sessionStorage.setItem(`${ONBOARDING_SEEN_KEY}-${token}`, "1");
    } catch {
      // ignore
    }
    setShowOnboardingModal(false);
    router.push(`/s/${token}/review`);
  };

  const handleDeleteReceipt = async (id: string) => {
    try {
      const res = await fetch(
        `/api/receipts/${id}?token=${encodeURIComponent(token)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Kunne ikke slette");
      setReceipts((prev) => prev.filter((r) => r.id !== id));
    } catch (_e) {
      setError("Kunne ikke slette kvittering");
    }
  };

  return (
    <div className="w-full max-w-2xl space-y-6">
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
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
              <span className="text-xl">
                {isPdf(r.mimeType) ? "📄" : "🖼️"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white">{r.originalFileName}</p>
                <p className="text-xs text-neutral-500">
                  {r.mimeType} · {formatBytes(r.sizeBytes)}
                </p>
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
              <div className="flex items-center gap-3">
                <span className="text-xl opacity-70">📤</span>
                <p className="min-w-0 flex-1 truncate text-sm text-neutral-300">
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

      {analyzing && (
        <div
          className="rounded-xl border border-neutral-700 bg-neutral-800/80 p-6 text-center"
          role="status"
          aria-live="polite"
          aria-label="Analyserer kvitteringer"
        >
          <p className="mb-3 text-sm font-medium text-neutral-200">
            Analyserer kvitteringer…
          </p>
          <p className="mb-4 text-xs text-neutral-400">
            Dette kan ta litt tid avhengig av antall filer.
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-700">
            <div className="h-full min-w-[30%] rounded-full bg-green-600 animate-analyze-progress" />
          </div>
        </div>
      )}

      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={analyzing || receipts.length === 0}
          className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50"
        >
          {analyzing ? "Går videre…" : "Gå videre"}
        </button>
        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}
      </div>

      {showOnboardingModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-modal-title"
        >
          <div
            className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="onboarding-modal-title"
              className="text-lg font-semibold text-white"
            >
              Kvitteringene er klare for gjennomgang
            </h2>
            <p className="text-sm text-neutral-300 leading-relaxed">
              Vi har lest kvitteringene dine og fylt ut utleggsskjemaet automatisk.
              Gå gjennom hver linje og sjekk at beløp og beskrivelse stemmer før du sender inn.
            </p>
            <p className="text-xs text-neutral-500 leading-relaxed">
              Noen kjøp kan kreve en kort kommentar, for eksempel mat/drikke.
            </p>
            <div className="pt-1">
              <button
                type="button"
                onClick={handleOnboardingContinue}
                className="w-full rounded-lg bg-green-600 px-4 py-3 text-sm font-medium text-white hover:bg-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-neutral-900"
              >
                Gå til gjennomgang
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
