"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { parseCommentFlags, type SmartFlag } from "@/lib/receipts/smartComment";
import { convertToNokCentsClient } from "@/lib/currencyRates";
import { REPAYMENT_ACCOUNT_NUMBER } from "@/lib/constants";

const PREVIEW_STORAGE_KEY = "expense-preview";

const MEAL_COMMENT_PLACEHOLDER =
  "Forslag: Catering til filmarbeidere og statister";

type ReceiptRow = {
  id: string;
  originalFileName: string;
  extractedSummary: string | null;
  extractedTotalCents: number | null;
  extractedCurrency: string | null;
  originalAmountCents: number | null;
  blobUrl: string;
  mimeType: string;
  comment: string | null;
  commentFlags: string | null;
  dismissedCommentFlags: string | null;
};

type InitialData = {
  status: string;
  name: string | null;
  projectNumber: string | null;
  project: string | null;
  workDate: string | null;
  accountNumber: string | null;
  productionCash: number | null;
  combinedPdfUrl: string | null;
  receipts: ReceiptRow[];
};

function formatNok(cents: number): string {
  return `${(cents / 100).toFixed(2)} kr`;
}

function diffLabel(diffCents: number): string {
  if (diffCents > 0) return "Til utbetaling (Aparent skylder deg)";
  if (diffCents < 0) return "Tilbakebetaling (du skylder Aparent)";
  return "I balanse";
}

export function ReviewEditor({
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
  const [accountNumber, setAccountNumber] = useState(
    initialData.accountNumber ?? ""
  );
  const [productionCash, setProductionCash] = useState(
    initialData.productionCash != null ? String(initialData.productionCash) : ""
  );
  const [receipts, setReceipts] = useState<ReceiptRow[]>(initialData.receipts);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [combinedPdfUrl, setCombinedPdfUrl] = useState<string | null>(
    initialData.combinedPdfUrl
  );
  const [previewReceipt, setPreviewReceipt] = useState<ReceiptRow | null>(null);
  const [addingReceipts, setAddingReceipts] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmCheckedSums, setConfirmCheckedSums] = useState(false);
  const [confirmCheckedProduction, setConfirmCheckedProduction] = useState(false);
  const [confirmCheckedMealComments, setConfirmCheckedMealComments] = useState(false);
  const [isDraggingOverReceipts, setIsDraggingOverReceipts] = useState(false);
  const [commentExpandedIds, setCommentExpandedIds] = useState<Set<string>>(
    () =>
      new Set(
        initialData.receipts
          .filter((r) => parseCommentFlags(r.commentFlags).length > 0)
          .map((r) => r.id)
      )
  );
  /** Receipt IDs where user closed the comment field with trash (so it stays collapsed even if flags exist) */
  const [commentFieldCollapsedIds, setCommentFieldCollapsedIds] = useState<Set<string>>(() => new Set());
  /** Receipt IDs where user has clicked to dismiss the stripet grønn "kommentar ønskes" ramme (eller etter at animasjonen er ferdig) */
  const [mealHighlightDismissedIds, setMealHighlightDismissedIds] = useState<Set<string>>(() => new Set());
  /** Satt til true når bruker lukker mat/drikke-popup – da starter pulseringsanimasjonen på kommentarfelt */
  const [mealModalClosedOnce, setMealModalClosedOnce] = useState(false);
  const [showMealInfoModal, setShowMealInfoModal] = useState(false);
  const commentSaveTimeoutRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const commentTextareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (
      initialData.receipts.some((r) =>
        parseCommentFlags(r.commentFlags).includes("MEAL")
      )
    ) {
      setShowMealInfoModal(true);
    }
  }, []);

  const convertedToNokIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    receipts.forEach((r) => {
      if (convertedToNokIdsRef.current.has(r.id)) return;
      if (
        r.originalAmountCents != null &&
        r.extractedCurrency &&
        r.extractedCurrency.toUpperCase() !== "NOK" &&
        r.extractedTotalCents == null
      ) {
        const nokCents = convertToNokCentsClient(
          r.originalAmountCents,
          r.extractedCurrency
        );
        if (nokCents != null) {
          convertedToNokIdsRef.current.add(r.id);
          fetch(
            `/api/receipts/${encodeURIComponent(r.id)}?token=${encodeURIComponent(token)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ extractedTotalCents: nokCents }),
            }
          ).catch(() => {});
          setReceipts((prev) =>
            prev.map((rec) =>
              rec.id === r.id ? { ...rec, extractedTotalCents: nokCents } : rec
            )
          );
        }
      }
    });
  }, [receipts, token]);

  const adjustCommentHeight = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 56)}px`;
  }, []);
  const router = useRouter();
  // Fri tekst for beløpsfelt slik at bruker kan skrive f.eks. 10.50 eller 10000
  const [amountInputs, setAmountInputs] = useState<Record<string, string>>({});

  const isSubmitted = initialData.status === "SUBMITTED" || submitSuccess;
  const displayPdfUrl = combinedPdfUrl ?? initialData.combinedPdfUrl;

  const updateReceipt = (id: string, updates: Partial<ReceiptRow>) => {
    setReceipts((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...updates } : r))
    );
  };

  const totalCents = receipts.reduce(
    (s, r) => s + (r.extractedTotalCents ?? 0),
    0
  );
  const convertedFromForeignCents = receipts.reduce(
    (s, r) => s + (r.originalAmountCents != null ? (r.extractedTotalCents ?? 0) : 0),
    0
  );
  const productionCashCents = Math.round(
    (Number(productionCash) || 0) * 100
  );
  const diffCents = totalCents - productionCashCents;

  const validateAccount = () => {
    const digits = accountNumber.replace(/\D/g, "");
    if (accountNumber.trim() === "") {
      setAccountError(null);
      return true;
    }
    if (digits.length !== 11) {
      setAccountError("Kontonummer må være 11 sifre");
      return false;
    }
    setAccountError(null);
    return true;
  };

  const mapToReceiptRow = (r: {
    id: string;
    originalFileName: string;
    extractedSummary: string | null;
    extractedTotalCents: number | null;
    extractedCurrency?: string | null;
    originalAmountCents?: number | null;
    blobUrl: string;
    mimeType: string;
    comment?: string | null;
    commentFlags?: string | null;
    dismissedCommentFlags?: string | null;
  }): ReceiptRow => ({
    id: r.id,
    originalFileName: r.originalFileName,
    extractedSummary: r.extractedSummary ?? null,
    extractedTotalCents: r.extractedTotalCents ?? null,
    extractedCurrency: r.extractedCurrency ?? null,
    originalAmountCents: r.originalAmountCents ?? null,
    blobUrl: r.blobUrl,
    mimeType: r.mimeType,
    comment: r.comment ?? null,
    commentFlags: r.commentFlags ?? null,
    dismissedCommentFlags: r.dismissedCommentFlags ?? null,
  });

  const scheduleCommentSave = useCallback(
    (id: string, comment: string | null) => {
      if (commentSaveTimeoutRef.current[id]) {
        clearTimeout(commentSaveTimeoutRef.current[id]);
      }
      commentSaveTimeoutRef.current[id] = setTimeout(async () => {
        try {
          const res = await fetch(
            `/api/receipts/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ comment: comment?.trim() || null }),
            }
          );
          if (!res.ok) throw new Error("Kunne ikke lagre kommentar");
        } catch {
          // Optional: could set a per-receipt error state
        }
        delete commentSaveTimeoutRef.current[id];
      }, 500);
    },
    [token]
  );

  const handleDeleteReceipt = useCallback(
    async (receiptId: string) => {
      if (isSubmitted) return;
      setDeletingId(receiptId);
      setAddError(null);
      try {
        const res = await fetch(
          `/api/receipts/${encodeURIComponent(receiptId)}?token=${encodeURIComponent(token)}`,
          { method: "DELETE" }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Kunne ikke slette bilag");
        setReceipts((prev) => prev.filter((r) => r.id !== receiptId));
        setAmountInputs((prev) => {
          const next = { ...prev };
          delete next[receiptId];
          return next;
        });
      } catch (e) {
        setAddError((e as Error).message);
      } finally {
        setDeletingId(null);
      }
    },
    [token, isSubmitted]
  );

  const handleAddFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length || isSubmitted) return;
      const allowed = ["image/", "application/pdf"];
      setAddError(null);
      setAddingReceipts(true);
      try {
        let currentReceipts = receipts;
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (!allowed.some((p) => file.type.toLowerCase().startsWith(p)))
            continue;
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
          const apiReceipts = data.receipts as Array<{ id: string; originalFileName: string; mimeType: string; blobUrl: string }>;
          const byId = new Map(currentReceipts.map((r) => [r.id, r]));
          currentReceipts = apiReceipts.map((r) => {
            const existing = byId.get(r.id);
            return {
              ...r,
              extractedSummary: existing?.extractedSummary ?? null,
              extractedTotalCents: existing?.extractedTotalCents ?? null,
              extractedCurrency: existing?.extractedCurrency ?? null,
              originalAmountCents: existing?.originalAmountCents ?? null,
              comment: existing?.comment ?? null,
              commentFlags: existing?.commentFlags ?? null,
              dismissedCommentFlags: existing?.dismissedCommentFlags ?? null,
            } as ReceiptRow;
          });
          setReceipts(currentReceipts);
        }
        const analyzeRes = await fetch(
          `/api/submissions/${encodeURIComponent(token)}/analyze-new`,
          { method: "POST" }
        );
        if (!analyzeRes.ok) {
          const errData = await analyzeRes.json().catch(() => ({}));
          throw new Error(errData.error ?? "Analyse av nye bilag feilet");
        }
        const updated = await analyzeRes.json();
        if (updated?.receipts?.length) {
          const mapped = updated.receipts.map(mapToReceiptRow);
          setReceipts(mapped);
          setCommentExpandedIds((prev) => {
            const next = new Set(prev);
            mapped.forEach((r) => {
              if (parseCommentFlags(r.commentFlags).length > 0) next.add(r.id);
            });
            return next;
          });
          if (mapped.some((r) => parseCommentFlags(r.commentFlags).includes("MEAL"))) {
            setShowMealInfoModal(true);
          }
        }
      } catch (e) {
        setAddError((e as Error).message);
      } finally {
        setAddingReceipts(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [token, receipts, isSubmitted]
  );

  const canOpenConfirm = () => {
    if (!validateAccount()) return false;
    const digits = accountNumber.replace(/\D/g, "");
    if (accountNumber.trim() && digits.length !== 11) return false;
    for (const r of receipts) {
      if (r.extractedTotalCents == null) return false;
    }
    return true;
  };

  const handleOpenConfirmModal = () => {
    setSubmitError(null);
    if (!canOpenConfirm()) {
      if (!validateAccount()) return;
      const digits = accountNumber.replace(/\D/g, "");
      if (accountNumber.trim() && digits.length !== 11) {
        setAccountError("Kontonummer må være 11 sifre");
        return;
      }
      for (const r of receipts) {
        if (r.extractedTotalCents == null) {
          setSubmitError("Alle kvitteringer må ha beløp (NOK).");
          return;
        }
      }
      return;
    }
    setConfirmCheckedSums(false);
    setConfirmCheckedProduction(false);
    setConfirmCheckedMealComments(false);
    setShowConfirmModal(true);
  };

  const handleSubmit = async () => {
    if (!validateAccount()) return;
    const digits = accountNumber.replace(/\D/g, "");
    if (accountNumber.trim() && digits.length !== 11) {
      setAccountError("Kontonummer må være 11 sifre");
      return;
    }
    for (const r of receipts) {
      if (r.extractedTotalCents == null) {
        setSubmitError("Alle kvitteringer må ha beløp (NOK).");
        return;
      }
    }
    setSubmitError(null);
    setShowConfirmModal(false);
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/submissions/${encodeURIComponent(token)}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name || null,
            projectNumber: projectNumber.trim() || null,
            project: project.trim() || null,
            workDate: workDate || null,
            accountNumber: accountNumber.trim() || null,
            productionCash: productionCash === "" ? null : Number(productionCash),
            receipts: receipts.map((r) => ({
              id: r.id,
              extractedSummary: r.extractedSummary || null,
              extractedTotalCents: r.extractedTotalCents,
              comment: r.comment?.trim() || null,
            })),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Innsending feilet");
      setCombinedPdfUrl(data.combinedPdfUrl);
      setSubmitSuccess(true);
      router.refresh();
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const blobPreviewUrl =
    previewReceipt && token
      ? `/api/submissions/${encodeURIComponent(token)}/receipts/${encodeURIComponent(previewReceipt.id)}/blob`
      : null;
  const isImage =
    previewReceipt?.mimeType?.toLowerCase().startsWith("image/") ?? false;

  useEffect(() => {
    if (!previewReceipt) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewReceipt(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewReceipt]);

  const showSuccessOnly = submitSuccess || (isSubmitted && displayPdfUrl);

  return (
    <>
    <div className="max-w-4xl space-y-8">
      {showSuccessOnly ? (
        <>
          <section className="rounded-xl border border-green-800 bg-green-950/30 p-6">
            <p className="text-green-400 font-medium mb-2">
              Utlegget er sendt inn.
            </p>
            {displayPdfUrl && (
              <div className="flex flex-wrap gap-3">
                <a
                  href={`/api/submissions/${token}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-600"
                >
                  Last ned PDF
                </a>
                <a
                  href={`/s/${token}/print`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block rounded-lg border border-neutral-600 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-700"
                >
                  Forhåndsvis / Skriv ut
                </a>
              </div>
            )}
          </section>
          <p className="text-sm text-neutral-400">
            Har du spørsmål vedrørende utlegg, kan disse rettes til{" "}
            <a
              href="mailto:lasse@aparent.tv"
              className="text-neutral-300 underline hover:text-white"
            >
              lasse@aparent.tv
            </a>
          </p>
        </>
      ) : (
        <>
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
              disabled={isSubmitted}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500 disabled:opacity-60"
              placeholder="Fullt navn"
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr]">
            <div className="min-w-0">
              <label className="mb-1 flex items-center gap-1.5 text-sm text-neutral-400">
                Prosjektnummer
                <span className="group relative inline-flex">
                  <span className="inline-flex cursor-default text-neutral-500 hover:text-neutral-300" aria-label="Prosjektnummer finnes i email, eller fås av produsent.">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-4 w-4"
                      aria-hidden
                    >
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 0 1 2 0v1a1 1 0 0 1-2 0V6ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </span>
                  <span className="pointer-events-none absolute left-1/2 bottom-full z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-neutral-700 px-2.5 py-1.5 text-xs text-white opacity-0 shadow transition-opacity duration-150 group-hover:opacity-100">
                    Prosjektnummer finnes i email, eller fås av produsent.
                  </span>
                </span>
              </label>
              <input
                type="text"
                value={projectNumber}
                onChange={(e) => setProjectNumber(e.target.value)}
                disabled={isSubmitted}
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
                disabled={isSubmitted}
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
              disabled={isSubmitted}
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
              onBlur={validateAccount}
              disabled={isSubmitted}
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
              Prod.penger / forskudd (NOK)
            </label>
            <input
              type="number"
              value={productionCash}
              onChange={(e) => setProductionCash(e.target.value)}
              disabled={isSubmitted}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500 disabled:opacity-60"
              placeholder="0"
            />
          </div>
        </div>
      </section>

      <section
        className={`rounded-xl border-2 border-dashed p-6 transition-colors ${
          !isSubmitted && isDraggingOverReceipts
            ? "border-green-500 bg-green-950/20"
            : "border-neutral-800 bg-neutral-900/50"
        }`}
        onDrop={
          !isSubmitted
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingOverReceipts(false);
                handleAddFiles(e.dataTransfer.files);
              }
            : undefined
        }
        onDragOver={
          !isSubmitted
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingOverReceipts(true);
              }
            : undefined
        }
        onDragEnter={
          !isSubmitted
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingOverReceipts(true);
              }
            : undefined
        }
        onDragLeave={
          !isSubmitted
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingOverReceipts(false);
              }
            : undefined
        }
      >
        <h2 className="text-lg font-medium text-neutral-200 mb-4">
          Kvitteringer
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-700 text-left text-neutral-400">
                <th className="w-8 pb-2 pr-2">#</th>
                <th className="pb-2 pr-2">Beskrivelse</th>
                <th className="pb-2 pr-2 text-right" />
                <th className="pb-2 pr-2 text-right w-28">Handlinger</th>
              </tr>
            </thead>
            <tbody>
              {receipts.flatMap((r, i) => {
                const isPending =
                  addingReceipts && r.extractedSummary == null;
                if (isPending) {
                  return [
                    <tr key={r.id} className="border-b border-neutral-800">
                      <td colSpan={4} className="py-3 pr-2">
                        <div className="flex items-center gap-3">
                          <span className="text-neutral-500 text-sm">
                            {i + 1}.
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
                              <div
                                className="h-full min-w-[30%] rounded-full bg-green-600 animate-analyze-progress"
                                role="progressbar"
                                aria-valuetext="Laster opp og analyserer"
                              />
                            </div>
                          </div>
                          <span className="text-xs text-neutral-400 shrink-0">
                            Laster opp og analyserer…
                          </span>
                        </div>
                      </td>
                    </tr>,
                  ];
                }
                const activeFlags = parseCommentFlags(r.commentFlags);
                const showComment =
                  (activeFlags.length > 0 && !commentFieldCollapsedIds.has(r.id)) ||
                  commentExpandedIds.has(r.id);
                const showMealHighlight =
                  !isSubmitted &&
                  !showMealInfoModal &&
                  mealModalClosedOnce &&
                  activeFlags.includes("MEAL") &&
                  !mealHighlightDismissedIds.has(r.id);
                return [
                  <tr key={r.id} className={showComment ? "" : "border-b border-neutral-800"}>
                    <td className="align-top w-8 py-2 pr-2 text-neutral-500">{i + 1}</td>
                    <td className="align-top py-2 pr-2">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <input
                            type="text"
                            value={r.extractedSummary ?? ""}
                            onChange={(e) =>
                              updateReceipt(r.id, {
                                extractedSummary: e.target.value || null,
                              })
                            }
                            disabled={isSubmitted}
                            className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-white focus:border-neutral-500 focus:outline-none"
                            placeholder="Beskrivelse"
                          />
                          {r.originalAmountCents != null &&
                            r.extractedCurrency &&
                            r.extractedCurrency.toUpperCase() !== "NOK" && (
                              <span className="shrink-0 text-xs text-neutral-400 whitespace-nowrap">
                                {(r.originalAmountCents / 100).toFixed(2)} {r.extractedCurrency}
                              </span>
                            )}
                          {activeFlags.includes("MEAL") && (
                              <span className="inline-flex items-center gap-1 rounded bg-amber-900/50 pl-1.5 pr-0.5 py-0.5 text-xs text-amber-200">
                                Mat/drikke
                                {!isSubmitted && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await fetch(
                                        `/api/receipts/${encodeURIComponent(r.id)}?token=${encodeURIComponent(token)}`,
                                        {
                                          method: "PATCH",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ dismissFlag: "MEAL" as SmartFlag }),
                                        }
                                      );
                                      const flags = parseCommentFlags(r.commentFlags).filter((f) => f !== "MEAL");
                                      const dismissed = [...parseCommentFlags(r.dismissedCommentFlags), "MEAL"];
                                      updateReceipt(r.id, {
                                        commentFlags: flags.length ? JSON.stringify(flags) : null,
                                        dismissedCommentFlags: JSON.stringify(dismissed),
                                      });
                                      if (flags.length === 0) {
                                        setCommentExpandedIds((prev) => {
                                          const next = new Set(prev);
                                          next.delete(r.id);
                                          return next;
                                        });
                                        setCommentFieldCollapsedIds((prev) =>
                                          new Set(prev).add(r.id)
                                        );
                                      }
                                    } catch {
                                      // ignore
                                    }
                                  }}
                                  className="rounded p-0.5 hover:bg-amber-800/50 text-amber-200 hover:text-white"
                                  title="Fjern tag"
                                  aria-label="Fjern Mat/drikke"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                                    <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-2.72 2.72a.75.75 0 1 0 1.06 1.06L10 11.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L11.06 10l2.72-2.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 6.22Z" />
                                  </svg>
                                </button>
                                )}
                              </span>
                            )}
                        </div>
                        {!showComment && !isSubmitted && (
                          <button
                            type="button"
                            onClick={() => {
                              setCommentExpandedIds((prev) =>
                                new Set(prev).add(r.id)
                              );
                              setCommentFieldCollapsedIds((prev) => {
                                const next = new Set(prev);
                                next.delete(r.id);
                                return next;
                              });
                            }}
                            className="text-left text-xs text-gray-500 hover:underline"
                          >
                            Legg til kommentar
                          </button>
                        )}
                      </div>
                    </td>
                  <td className="align-top py-2 pr-2 text-right">
                    <div className="flex h-8 items-center justify-end gap-1">
                        <input
                          type="number"
                          min={0}
                          max={10000}
                          step="0.01"
                          value={
                            r.id in amountInputs
                              ? amountInputs[r.id]
                              : r.extractedTotalCents != null
                                ? (r.extractedTotalCents / 100).toFixed(2)
                                : ""
                          }
                          onChange={(e) => {
                            const v = e.target.value;
                            setAmountInputs((prev) => ({ ...prev, [r.id]: v }));
                            if (v === "") {
                              updateReceipt(r.id, { extractedTotalCents: null });
                              return;
                            }
                            const num = parseFloat(v);
                            if (!Number.isNaN(num) && num >= 0 && num <= 10000) {
                              updateReceipt(r.id, {
                                extractedTotalCents: Math.round(num * 100),
                              });
                            }
                          }}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v === "") return;
                            const num = parseFloat(v);
                            if (!Number.isNaN(num) && num >= 0 && num <= 10000) {
                              setAmountInputs((prev) => {
                                const next = { ...prev };
                                next[r.id] = num.toFixed(2);
                                return next;
                              });
                            }
                          }}
                          disabled={isSubmitted}
                          className="h-8 w-28 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-right text-white focus:border-neutral-500 focus:outline-none"
                          placeholder="0.00"
                        />
                        <span className="text-xs text-neutral-500 shrink-0">NOK</span>
                    </div>
                  </td>
                  <td className="align-top py-2">
                    <div className="flex h-8 items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setPreviewReceipt(r)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded border border-neutral-600 bg-neutral-800 px-2 py-1 text-neutral-300 hover:border-neutral-500 hover:text-white focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
                        title="Vis bilag"
                        aria-label="Vis bilag"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="h-4 w-4"
                          aria-hidden
                        >
                          <path
                            fillRule="evenodd"
                            d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                      {!isSubmitted && (
                        <button
                          type="button"
                          onClick={() => handleDeleteReceipt(r.id)}
                          disabled={deletingId === r.id}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-neutral-600 bg-neutral-800 text-neutral-400 hover:border-red-500/50 hover:bg-red-950/30 hover:text-red-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-50"
                          title="Fjern bilag"
                          aria-label="Fjern bilag"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="h-4 w-4"
                            aria-hidden
                          >
                            <path
                              fillRule="evenodd"
                              d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.518.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>,
                  showComment ? (
                    <tr key={`${r.id}-comment`} className="border-b border-neutral-800">
                      <td className="w-8 align-top pb-2 pr-2 pt-0" />
                      <td colSpan={3} className="align-top pb-2 pr-2 pt-0">
                        <div className="mt-1.5 flex min-h-7 items-center gap-0.5">
                            <div
                              className={showMealHighlight ? "meal-highlight-wrap flex min-h-7 max-w-[19.2rem] shrink flex-1 min-w-0 items-center rounded" : "flex min-h-7 max-w-[19.2rem] shrink flex-1 min-w-0 items-center"}
                            >
                              <textarea
                              ref={(el) => {
                                commentTextareaRefs.current[r.id] = el;
                                adjustCommentHeight(el);
                              }}
                              value={r.comment ?? ""}
                              onChange={(e) => {
                                const value = e.target.value;
                                updateReceipt(r.id, {
                                  comment: value || null,
                                });
                                scheduleCommentSave(r.id, value || null);
                                adjustCommentHeight(e.target as HTMLTextAreaElement);
                              }}
                              disabled={isSubmitted}
                              placeholder={
                                activeFlags.includes("MEAL")
                                  ? MEAL_COMMENT_PLACEHOLDER
                                  : "Skriv en kommentar (valgfritt)…"
                              }
                              rows={1}
                              className="min-h-7 w-full resize-none overflow-hidden rounded-md border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.03)] px-2.5 py-1 text-xs text-white placeholder:text-[rgba(255,255,255,0.45)] focus:border-[rgba(255,255,255,0.25)] focus:outline-none focus:ring-1 focus:ring-[rgba(255,255,255,0.15)] disabled:opacity-60"
                            />
                            {showMealHighlight && (
                              <div
                                className="meal-highlight-border"
                                onAnimationEnd={() => setMealHighlightDismissedIds((prev) => new Set(prev).add(r.id))}
                                aria-hidden
                              />
                            )}
                          </div>
                            {!isSubmitted && (
                              <button
                                type="button"
                                onClick={async () => {
                                  const flagsToDismiss = [...activeFlags];
                                  for (const flag of flagsToDismiss) {
                                    try {
                                      await fetch(
                                        `/api/receipts/${encodeURIComponent(r.id)}?token=${encodeURIComponent(token)}`,
                                        {
                                          method: "PATCH",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ dismissFlag: flag }),
                                        }
                                      );
                                    } catch {
                                      // ignore
                                    }
                                  }
                                  const dismissed = [...parseCommentFlags(r.dismissedCommentFlags), ...flagsToDismiss];
                                  updateReceipt(r.id, {
                                    comment: null,
                                    commentFlags: null,
                                    dismissedCommentFlags: JSON.stringify(dismissed),
                                  });
                                  scheduleCommentSave(r.id, null);
                                  setCommentExpandedIds((prev) => {
                                    const next = new Set(prev);
                                    next.delete(r.id);
                                    return next;
                                  });
                                  setCommentFieldCollapsedIds((prev) =>
                                    new Set(prev).add(r.id)
                                  );
                                }}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-base leading-none text-gray-500 opacity-70 hover:opacity-100 hover:text-gray-300 focus:outline-none"
                                title="Fjern kommentar"
                                aria-label="Fjern kommentar"
                              >
                                ×
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </table>
        </div>
        {!isSubmitted && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,image/heic,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                handleAddFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={addingReceipts}
              className="rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-neutral-300 hover:border-neutral-500 hover:bg-neutral-700 hover:text-white disabled:opacity-50"
            >
              {addingReceipts ? "Laster opp og analyserer…" : "Legg til"}
            </button>
            <span className="text-sm text-neutral-500">
              Dra filer hit for å legge til kvitteringer, eller bruk knappen.
            </span>
            {addError && (
              <p className="w-full text-sm text-red-400 sm:w-auto">{addError}</p>
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <h2 className="text-lg font-medium text-neutral-200 mb-4">
          Oppsummering
        </h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-neutral-400">Total</dt>
            <dd className="text-white">{formatNok(totalCents)}</dd>
          </div>
          {convertedFromForeignCents > 0 && (
            <div className="flex justify-between text-neutral-400">
              <dt className="text-neutral-500">Inkl. konvertert fra annen valuta</dt>
              <dd className="text-neutral-400">{formatNok(convertedFromForeignCents)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-neutral-400">Produksjonskasse</dt>
            <dd className="text-white">{formatNok(productionCashCents)}</dd>
          </div>
          <div className="flex justify-between pt-2 border-t border-neutral-700">
            <dt className="text-neutral-400">{diffLabel(diffCents)}</dt>
            <dd className="text-white font-medium">
              {formatNok(diffCents)}
            </dd>
          </div>
        </dl>
      </section>

      {!isSubmitted && (
        <section className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleOpenConfirmModal}
            disabled={submitting}
            className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50"
          >
            {submitting ? "Sender inn…" : "Send inn"}
          </button>
          <button
            type="button"
            onClick={() => {
              const payload = {
                submission: {
                  name: name || null,
                  projectNumber: projectNumber.trim() || null,
                  project: project.trim() || null,
                  workDate: workDate ? `${workDate}T12:00:00.000Z` : null,
                  accountNumber: accountNumber.trim() || null,
                  productionCashCents,
                },
                receipts: receipts.map((r) => ({
                  summary: r.extractedSummary ?? "Kvittering",
                  amountCents: r.extractedTotalCents ?? 0,
                  comment: r.comment ?? null,
                  originalAmountCents: r.originalAmountCents ?? null,
                  extractedCurrency: r.extractedCurrency ?? null,
                })),
                totals: { totalCents, productionCashCents, diffCents },
              };
              try {
                sessionStorage.setItem(
                  `${PREVIEW_STORAGE_KEY}-${token}`,
                  JSON.stringify(payload)
                );
                window.open(
                  `/s/${token}/preview`,
                  "_blank",
                  "width=720,height=900,scrollbars=yes,resizable=yes"
                );
              } catch {
                // sessionStorage can throw in private mode
              }
            }}
            className="rounded-lg border border-neutral-600 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-700"
          >
            Forhåndsvis
          </button>
          {submitError && (
            <p className="text-sm text-red-400">{submitError}</p>
          )}
        </section>
      )}

      </>)}

      {showMealInfoModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="meal-info-modal-title"
        >
          <div
            className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="meal-info-modal-title"
              className="mb-4 text-lg font-bold text-white"
            >
              Mat og drikke
            </h2>
            <div className="text-sm text-neutral-300 space-y-3 mb-6">
              <p>
                Det ser ut som du har lagt til en kvittering som inneholder mat eller drikke. I så fall må du legge til en kommentar på hva og hvem det er til.
              </p>
              <p className="text-neutral-400">
                Eksempel på mat til opptak: <em>Mat og drikke til crew og aktører</em>
              </p>
              <p className="text-neutral-400">
                Eksempel på annen mat: <em>Overtidsmat til [Ditt navn]</em>
              </p>
              <p>
                Hvis kvitteringen ikke inneholder mat eller drikke så fjerner du bare kommentarfeltet eller mat/drikke-taggen.
              </p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowMealInfoModal(false);
                  // Start pulseringsanimasjon på kommentarfelt først etter at modal er lukket (klar overgang)
                  setTimeout(() => setMealModalClosedOnce(true), 150);
                }}
                className="rounded-lg bg-neutral-700 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-600"
              >
                Lukk
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
          onClick={() => setShowConfirmModal(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="confirm-modal-title"
              className="text-lg font-medium text-white mb-4"
            >
              Siste sjekk før innsending
            </h2>
            <p className="text-sm text-neutral-400 mb-4">
              Gå gjennom punktene nedenfor før du sender inn utlegget.
            </p>
            <ul className="space-y-3 mb-6">
              <li className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="confirm-sums"
                  checked={confirmCheckedSums}
                  onChange={(e) => setConfirmCheckedSums(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-neutral-600 bg-neutral-800 text-green-600 focus:ring-green-500"
                />
                <label htmlFor="confirm-sums" className="text-sm text-neutral-300">
                  Jeg har dobbeltsjekket at summer og beskrivelser stemmer
                </label>
              </li>
              <li className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="confirm-production"
                  checked={confirmCheckedProduction}
                  onChange={(e) => setConfirmCheckedProduction(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-neutral-600 bg-neutral-800 text-green-600 focus:ring-green-500"
                />
                <label htmlFor="confirm-production" className="text-sm text-neutral-300">
                  Jeg har fylt inn om jeg har mottatt produksjonskasse (forskudd) eller ikke
                </label>
              </li>
              {receipts.some((r) => parseCommentFlags(r.commentFlags).includes("MEAL")) && (
                <li className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="confirm-meal-comments"
                    checked={confirmCheckedMealComments}
                    onChange={(e) => setConfirmCheckedMealComments(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-neutral-600 bg-neutral-800 text-green-600 focus:ring-green-500"
                  />
                  <label htmlFor="confirm-meal-comments" className="text-sm text-neutral-300">
                    Jeg har kommentert kvitteringer som inneholder mat/drikke
                  </label>
                </li>
              )}
            </ul>
            <dl className="space-y-2 text-sm mb-6 p-4 rounded-lg bg-neutral-800/50">
              <div className="flex justify-between">
                <dt className="text-neutral-400">Total</dt>
                <dd className="text-white">{formatNok(totalCents)}</dd>
              </div>
              {convertedFromForeignCents > 0 && (
                <div className="flex justify-between text-neutral-400">
                  <dt className="text-neutral-500">Inkl. konvertert fra annen valuta</dt>
                  <dd className="text-neutral-400">{formatNok(convertedFromForeignCents)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-neutral-400">Produksjonskasse</dt>
                <dd className="text-white">{formatNok(productionCashCents)}</dd>
              </div>
              <div className="flex justify-between pt-2 border-t border-neutral-700">
                <dt className="text-neutral-400">{diffLabel(diffCents)}</dt>
                <dd
                  className={`font-medium ${
                    diffCents > 0
                      ? "text-green-400"
                      : diffCents < 0
                        ? "text-red-400"
                        : "text-white"
                  }`}
                >
                  {formatNok(diffCents)}
                </dd>
              </div>
              {diffCents < 0 && (
                <div className="flex justify-between pt-2 text-neutral-300">
                  <dt className="text-neutral-400">Kontonummer for tilbakebetaling</dt>
                  <dd className="font-mono text-white">{REPAYMENT_ACCOUNT_NUMBER}</dd>
                </div>
              )}
            </dl>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="rounded-lg border border-neutral-600 bg-neutral-800 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-700 hover:text-white"
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={() => {
                  const mealOk = !receipts.some((r) => parseCommentFlags(r.commentFlags).includes("MEAL")) || confirmCheckedMealComments;
                  if (confirmCheckedSums && confirmCheckedProduction && mealOk) handleSubmit();
                }}
                disabled={
                  !confirmCheckedSums ||
                  !confirmCheckedProduction ||
                  (receipts.some((r) => parseCommentFlags(r.commentFlags).includes("MEAL")) && !confirmCheckedMealComments)
                }
                className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Bekreft og send inn
              </button>
            </div>
          </div>
        </div>
      )}

      {previewReceipt && blobPreviewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Forhåndsvis bilag"
          onClick={() => setPreviewReceipt(null)}
        >
          <div
            className={`relative rounded-lg bg-neutral-900 shadow-xl flex items-start justify-center ${isImage ? "w-fit max-w-[95vw] max-h-[90vh] overflow-auto" : "min-w-[280px] min-h-[400px] max-w-[95vw] max-h-[90vh] resize overflow-auto"}`}
            onClick={(e) => e.stopPropagation()}
            style={!isImage ? { width: "min(95vw, 800px)", height: "85vh" } : undefined}
          >
            <button
              type="button"
              onClick={() => setPreviewReceipt(null)}
              className="absolute right-2 top-2 z-10 rounded-full bg-neutral-800 p-1.5 text-neutral-400 hover:bg-neutral-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-white"
              aria-label="Lukk"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
            {isImage ? (
              <img
                src={blobPreviewUrl}
                alt={previewReceipt.extractedSummary || previewReceipt.originalFileName}
                className="max-h-[90vh] max-w-[95vw] w-auto h-auto object-contain block"
              />
            ) : (
              <iframe
                src={blobPreviewUrl}
                title={previewReceipt.extractedSummary || previewReceipt.originalFileName}
                className="w-full h-full min-h-[60vh] rounded-lg"
              />
            )}
          </div>
        </div>
      )}
    </div>
    </>
  );
}
