"use client";

import { useState, useCallback, useRef } from "react";
import { upload } from "@vercel/blob/client";

type ReceiptItem = {
  id: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  blobUrl: string;
};

type InitialData = {
  id: string;
  status: string;
  name: string | null;
  projectNumber: string | null;
  project: string | null;
  workDate: string | null;
  productionCash: number | null;
  accountNumber: string | null;
  receipts: ReceiptItem[];
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isPdf(mime: string): boolean {
  return mime.toLowerCase().includes("pdf");
}

export function SubmissionEditor({
  initialData,
  token,
}: {
  initialData: InitialData;
  token: string;
}) {
  const [name, setName] = useState(initialData.name ?? "");
  const [projectNumber, setProjectNumber] = useState(initialData.projectNumber ?? "");
  const [project, setProject] = useState(initialData.project ?? "");
  const [workDate, setWorkDate] = useState(
    initialData.workDate
      ? new Date(initialData.workDate).toISOString().slice(0, 10)
      : ""
  );
  const [productionCash, setProductionCash] = useState(
    initialData.productionCash ?? ""
  );
  const [accountNumber, setAccountNumber] = useState(
    initialData.accountNumber ?? ""
  );
  const [accountError, setAccountError] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<ReceiptItem[]>(initialData.receipts);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [uploadingIds, setUploadingIds] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSubmitted = initialData.status === "SUBMITTED" || submitSuccess;
  const isLocked = isSubmitted;

  const validateAccount = useCallback((value: string) => {
    const digits = value.replace(/\D/g, "");
    if (value.trim() === "") {
      setAccountError(null);
      return;
    }
    if (digits.length !== 11) {
      setAccountError("Kontonummer må være 11 sifre");
    } else {
      setAccountError(null);
    }
  }, []);

  const handleAccountBlur = () => {
    validateAccount(accountNumber);
  };

  const handleSave = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/submission", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          name: name || null,
          projectNumber: projectNumber.trim() || null,
          project: project.trim() || null,
          workDate: workDate || null,
          productionCash:
            productionCash === "" ? null : Number(productionCash) || null,
          accountNumber: accountNumber.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lagring feilet");
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    validateAccount(accountNumber);
    if (accountError) return;
    const digits = accountNumber.replace(/\D/g, "");
    if (accountNumber.trim() && digits.length !== 11) {
      setAccountError("Kontonummer må være 11 sifre");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/submission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Innsending feilet");
      setSubmitSuccess(true);
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      console.log("[handleFiles] called", { files: files != null, length: files?.length ?? 0, isLocked });
      if (files == null || files.length === 0) {
        console.log("[handleFiles] early return: no files or empty");
        return;
      }
      if (isLocked) {
        console.log("[handleFiles] early return: form is locked");
        return;
      }
      const allowedTypes = ["image/", "application/pdf"];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log("[handleFiles] processing file", i + 1, file.name, file.type, file.size);
        const ok = allowedTypes.some((p) => file.type.toLowerCase().startsWith(p));
        if (!ok) {
          console.log("[handleFiles] skipping file (type not allowed)", file.name, file.type);
          continue;
        }
        const tempId = `upload-${Date.now()}-${i}`;
        setUploadingIds((prev) => new Set(prev).add(tempId));
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
          console.error("[handleFiles] upload/receipt error", e);
        } finally {
          setUploadingIds((prev) => {
            const next = new Set(prev);
            next.delete(tempId);
            return next;
          });
        }
      }
    },
    [token, isLocked]
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log("[drag/drop] drop", e.dataTransfer.files?.length ?? 0, "files");
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDeleteReceipt = async (id: string) => {
    if (isLocked) return;
    try {
      const res = await fetch(`/api/receipts/${id}?token=${encodeURIComponent(token)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Kunne ikke slette");
      const data = await res.json();
      setReceipts((prev) => prev.filter((r) => r.id !== id));
    } catch (_e) {
      // Could show toast
    }
  };

  const openFile = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="max-w-2xl space-y-8">
      {/* Personinfo + prosjekt */}
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <h2 className="text-lg font-medium text-neutral-200 mb-4">
          Person- og prosjektinfo
        </h2>
        <div className="grid gap-4">
          <div>
            <label className="block text-sm text-neutral-400 mb-1">Navn</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleSave}
              disabled={isLocked}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500 disabled:opacity-60"
              placeholder="Fullt navn"
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr]">
            <div className="min-w-0">
              <label className="mb-1 block text-sm text-neutral-400">
                Prosjektnummer
              </label>
              <input
                type="text"
                value={projectNumber}
                onChange={(e) => setProjectNumber(e.target.value)}
                onBlur={handleSave}
                disabled={isLocked}
                className="min-w-28 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500 disabled:opacity-60 sm:min-w-32"
                placeholder="0"
              />
            </div>
            <div className="min-w-0">
              <label className="block text-sm text-neutral-400 mb-1">
                Prosjektnavn
              </label>
              <input
                type="text"
                value={project}
                onChange={(e) => setProject(e.target.value)}
                onBlur={handleSave}
                disabled={isLocked}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500 disabled:opacity-60"
                placeholder="Prosjektnavn"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-1">Dato</label>
            <input
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              onBlur={handleSave}
              disabled={isLocked}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-white focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500 disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              Kontonummer (11 sifre)
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={accountNumber}
              onChange={(e) => {
                setAccountNumber(e.target.value);
                setAccountError(null);
              }}
              onBlur={handleAccountBlur}
              disabled={isLocked}
              className={`w-full rounded-lg border bg-neutral-800 px-3 py-2 text-white placeholder-neutral-500 focus:outline-none focus:ring-1 disabled:opacity-60 ${
                accountError
                  ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                  : "border-neutral-700 focus:border-neutral-500 focus:ring-neutral-500"
              }`}
              placeholder="11 sifre"
              maxLength={11}
            />
            {accountError && (
              <p className="mt-1 text-sm text-red-400">{accountError}</p>
            )}
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              Prod.penger (kr)
            </label>
            <input
              type="number"
              value={productionCash}
              onChange={(e) => setProductionCash(e.target.value)}
              onBlur={handleSave}
              disabled={isLocked}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500 disabled:opacity-60"
              placeholder="0"
            />
          </div>
        </div>
        {saveError && (
          <p className="mt-2 text-sm text-red-400">{saveError}</p>
        )}
      </section>

      {/* Kvitteringer */}
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <h2 className="text-lg font-medium text-neutral-200 mb-4">
          Kvitteringer
        </h2>
        {!isLocked && (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            className="mb-4 rounded-lg border-2 border-dashed border-neutral-600 bg-neutral-800/50 p-6 text-center text-neutral-400 hover:border-neutral-500 transition-colors"
          >
            <p className="mb-2">Dra filer hit eller</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,image/heic,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                const fileList = e.target.files;
                console.log("[file input] onChange fired", fileList?.length ?? 0, "files", fileList);
                handleFiles(fileList);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => {
                console.log("[Velg filer] button clicked, triggering file input");
                fileInputRef.current?.click();
              }}
              className="rounded-lg bg-neutral-700 px-4 py-2 text-sm text-white hover:bg-neutral-600"
            >
              Velg filer
            </button>
            <p className="mt-2 text-xs">Bilder og PDF, flere filer tillatt</p>
          </div>
        )}

        {uploadingIds.size > 0 && (
          <p className="text-sm text-neutral-400 mb-2">Laster opp…</p>
        )}

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
              <button
                type="button"
                onClick={() => openFile(r.blobUrl)}
                className="rounded px-2 py-1 text-sm text-neutral-400 hover:text-white hover:bg-neutral-700"
              >
                Åpne
              </button>
              {!isLocked && (
                <button
                  type="button"
                  onClick={() => handleDeleteReceipt(r.id)}
                  className="rounded px-2 py-1 text-sm text-red-400 hover:bg-red-500/20"
                >
                  Slett
                </button>
              )}
            </li>
          ))}
        </ul>
        {receipts.length === 0 && uploadingIds.size === 0 && (
          <p className="text-sm text-neutral-500">Ingen kvitteringer lagt til ennå.</p>
        )}
      </section>

      {/* Actions */}
      <section className="flex flex-wrap items-center gap-3">
        {!isSubmitted && (
          <>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-neutral-700 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-600 disabled:opacity-50"
            >
              {saving ? "Lagrer…" : "Lagre"}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || receipts.length === 0}
              className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50"
            >
              {submitting ? "Sender inn…" : "Send inn"}
            </button>
          </>
        )}
           {submitSuccess && (
     <p className="text-green-400 font-medium">
       Utlegget er sendt inn. Vennligst last ned PDF for egen kopi.
     </p>
   )}
        {submitError && (
          <p className="text-sm text-red-400">{submitError}</p>
        )}
      </section>
    </div>
  );
}
