"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { parseCommentFlags, type SmartFlag } from "@/lib/receipts/smartComment";
import { REPAYMENT_ACCOUNT_NUMBER } from "@/lib/constants";
import { currencyDisplay } from "@/lib/currencyDisplay";

const PREVIEW_STORAGE_KEY = "expense-preview";

const MEAL_COMMENT_PLACEHOLDER =
  "Forslag: Catering til filmarbeidere og statister *";
const TRANSPORT_COMMENT_PLACEHOLDER =
  "Forslag: Reise til/fra opptak, eller beskriv formål *";

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

function mapToReceiptRow(r: ReceiptRow): ReceiptRow {
  return {
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
  };
}

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

function diffShort(diffCents: number): string {
  if (diffCents > 0) return "Aparent skylder deg";
  if (diffCents < 0) return "Du skylder Aparent";
  return "I balanse";
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
      : new Date().toISOString().slice(0, 10)
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
  const [isDraggingOverReceipts, setIsDraggingOverReceipts] = useState(false);
  const [showCommentErrors, setShowCommentErrors] = useState(false);
  const [showAmountErrors, setShowAmountErrors] = useState(false);
  const [showFieldErrors, setShowFieldErrors] = useState(false);
  /** Info filled in on the upload page is shown as a summary until the user chooses to edit it. */
  const [infoExpanded, setInfoExpanded] = useState(
    () =>
      !(
        initialData.name?.trim() &&
        initialData.project?.trim() &&
        (initialData.accountNumber ?? "").replace(/\D/g, "").length === 11
      )
  );
  const [commentExpandedIds, setCommentExpandedIds] = useState<Set<string>>(
    () =>
      new Set(
        initialData.receipts
          .filter((r) => parseCommentFlags(r.commentFlags ?? null).length > 0)
          .map((r) => r.id)
      )
  );
  /** Receipt IDs where user closed the comment field with trash (so it stays collapsed even if flags exist) */
  const [commentFieldCollapsedIds, setCommentFieldCollapsedIds] = useState<Set<string>>(
    () => new Set()
  );
  /** Receipt IDs where user has clicked to dismiss the stripet grønn "kommentar ønskes" ramme (eller etter at animasjonen er ferdig) */
  const [mealHighlightDismissedIds, setMealHighlightDismissedIds] = useState<Set<string>>(
    () => new Set()
  );
  /** Satt til true når bruker lukker mat/drikke-popup – da starter pulseringsanimasjonen på kommentarfelt */
  const [mealModalClosedOnce, setMealModalClosedOnce] = useState(false);
  const [showMealInfoModal, setShowMealInfoModal] = useState(false);
  const [transportHighlightDismissedIds, setTransportHighlightDismissedIds] = useState<Set<string>>(
    () => new Set()
  );
  const [transportModalClosedOnce, setTransportModalClosedOnce] = useState(false);
  const [showTransportInfoModal, setShowTransportInfoModal] = useState(false);
  const [showCurrencyInfoModal, setShowCurrencyInfoModal] = useState(false);
  const [foreignCurrencyCode, setForeignCurrencyCode] = useState<string | null>(null);
  const commentSaveTimeoutRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const commentTextareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workDateInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const accountInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const initialFlagsById = new Map<
      string,
      ReturnType<typeof parseCommentFlags>
    >();
    initialData.receipts.forEach((r) => {
      initialFlagsById.set(r.id, parseCommentFlags(r.commentFlags ?? null));
    });

    if (
      initialData.receipts.some((r) =>
        (initialFlagsById.get(r.id) ?? []).includes("MEAL")
      )
    ) {
      setShowMealInfoModal(true);
    }
    if (
      initialData.receipts.some((r) =>
        (initialFlagsById.get(r.id) ?? []).includes("TRANSPORT")
      )
    ) {
      setShowTransportInfoModal(true);
    }
    const firstForeign = initialData.receipts.find(
      (r) =>
        r.extractedCurrency &&
        r.extractedCurrency.toUpperCase() !== "NOK"
    );
    if (firstForeign) {
      setForeignCurrencyCode(
        firstForeign.extractedCurrency ? currencyDisplay(firstForeign.extractedCurrency.toUpperCase()) : null
      );
      setShowCurrencyInfoModal(true);
    }
  }, []);
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

  const totalCents = useMemo(
    () =>
      receipts.reduce(
        (s, r) => s + (r.extractedTotalCents ?? 0),
        0
      ),
    [receipts]
  );

  const productionCashCents = useMemo(
    () => Math.round((Number(productionCash) || 0) * 100),
    [productionCash]
  );

  const diffCents = useMemo(
    () => totalCents - productionCashCents,
    [totalCents, productionCashCents]
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
            mapped.forEach((r: ReceiptRow) => {
              if (parseCommentFlags(r.commentFlags).length > 0) next.add(r.id);
            });
            return next;
          });
          if (mapped.some((r: ReceiptRow) => parseCommentFlags(r.commentFlags).includes("MEAL"))) {
            setShowMealInfoModal(true);
          }
          if (mapped.some((r: ReceiptRow) => parseCommentFlags(r.commentFlags).includes("TRANSPORT"))) {
            setShowTransportInfoModal(true);
          }
          let firstForeign: ReceiptRow | undefined;
          for (const r of mapped as ReceiptRow[]) {
            if (
              r.extractedCurrency &&
              r.extractedCurrency.toUpperCase() !== "NOK"
            ) {
              firstForeign = r;
              break;
            }
          }
          if (firstForeign) {
            setForeignCurrencyCode(
              firstForeign.extractedCurrency ? currencyDisplay(firstForeign.extractedCurrency.toUpperCase()) : null
            );
            setShowCurrencyInfoModal(true);
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

  const scheduleCommentSave = useCallback(
    (id: string, comment: string | null) => {
      const existing = commentSaveTimeoutRef.current[id];
      if (existing) clearTimeout(existing);
      commentSaveTimeoutRef.current[id] = setTimeout(() => {
        fetch(
          `/api/receipts/${encodeURIComponent(id)}?token=${encodeURIComponent(
            token
          )}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ comment }),
          }
        ).catch(() => {
          // be silent on background save errors; user can resubmit
        });
      }, 400);
    },
    [token]
  );

  const validateAccount = useCallback(() => {
    const trimmed = accountNumber.trim();
    const digits = accountNumber.replace(/\D/g, "");

    if (trimmed === "") {
      setAccountError("Kontonummer er påkrevd");
      return false;
    }

    if (digits.length !== 11) {
      setAccountError("Kontonummer må være 11 sifre");
      return false;
    }

    setAccountError(null);
    return true;
  }, [accountNumber]);

  const scrollToFirstTopError = useCallback(
    (opts: { name?: boolean; project?: boolean; account?: boolean }) => {
      if (opts.name && nameInputRef.current) {
        nameInputRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
        nameInputRef.current.focus();
        return;
      }
      if (opts.project && projectInputRef.current) {
        projectInputRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
        projectInputRef.current.focus();
        return;
      }
      if (opts.account && accountInputRef.current) {
        accountInputRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
        accountInputRef.current.focus();
      }
    },
    []
  );

  // Memoized lookup for comment flags per receipt to avoid repeated JSON parsing in render
  const flagsById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof parseCommentFlags>>();
    receipts.forEach((r) => {
      map.set(r.id, parseCommentFlags(r.commentFlags ?? null));
    });
    return map;
  }, [receipts]);

  const hasAnyMeal = useMemo(
    () =>
      receipts.some((r) =>
        (flagsById.get(r.id) ?? []).includes("MEAL")
      ),
    [receipts, flagsById]
  );

  const hasAnyTransport = useMemo(
    () =>
      receipts.some((r) =>
        (flagsById.get(r.id) ?? []).includes("TRANSPORT")
      ),
    [receipts, flagsById]
  );

  const canOpenConfirm = () => {
    // Brukes kun til å avgjøre om vi kan åpne bekreftelsesmodalen –
    // selve feilmeldingene settes i handleOpenConfirmModal.
    if (!validateAccount()) return false;
    for (const r of receipts) {
      if (r.extractedTotalCents == null) return false;
    }
    for (const r of receipts) {
      const flags = parseCommentFlags(r.commentFlags);
      const requiresComment =
        (flags.includes("MEAL") || flags.includes("TRANSPORT")) &&
        !commentFieldCollapsedIds.has(r.id);
      if (requiresComment && !(r.comment && r.comment.trim().length > 0)) {
        return false;
      }
    }
    return true;
  };

  const handleOpenConfirmModal = () => {
    setSubmitError(null);
    setShowCommentErrors(false);
    setShowAmountErrors(false);
    setShowFieldErrors(false);

    let ok = true;

    // Navn / Prosjektnavn
    const missingName = !name.trim();
    const missingProject = !project.trim();
    if (missingName || missingProject) {
      setShowFieldErrors(true);
      setSubmitError(
        missingName && missingProject
          ? "Navn og prosjektnavn er påkrevd."
          : missingName
            ? "Navn er påkrevd."
            : "Prosjektnavn er påkrevd."
      );
      ok = false;
      scrollToFirstTopError({
        name: missingName,
        project: !missingName && missingProject,
        account: false,
      });
    }

    // Kontonummer
    const accountOk = validateAccount();
    if (!accountOk) {
      ok = false;
      if (!missingName && !missingProject) {
        scrollToFirstTopError({ name: false, project: false, account: true });
      }
    }

    // Beløp
    if (receipts.some((r) => r.extractedTotalCents == null)) {
      setShowAmountErrors(true);
      setSubmitError("Alle kvitteringer må ha beløp i NOK.");
      ok = false;
    }

    // Kommentar (mat/drikke & reisekostnader)
    let missingRequiredComment = false;
    for (const r of receipts) {
      const flags = parseCommentFlags(r.commentFlags);
      const requiresComment =
        (flags.includes("MEAL") || flags.includes("TRANSPORT")) &&
        !commentFieldCollapsedIds.has(r.id);
      if (requiresComment && !(r.comment && r.comment.trim().length > 0)) {
        missingRequiredComment = true;
        break;
      }
    }
    if (missingRequiredComment) {
      setShowCommentErrors(true);
      setSubmitError(
        "Kvitteringer med mat/drikke eller reisekostnader må ha kommentar, eller fjern kommentarfeltet/taggen."
      );
      ok = false;
    }

    if (!ok) return;

    setConfirmCheckedSums(false);
    setConfirmCheckedProduction(false);
    setShowConfirmModal(true);
  };

  const handleSubmit = async () => {
    const missingName = !name.trim();
    const missingProject = !project.trim();
    if (missingName || missingProject) {
      setShowFieldErrors(true);
      setSubmitError(
        missingName && missingProject
          ? "Navn og prosjektnavn er påkrevd."
          : missingName
            ? "Navn er påkrevd."
            : "Prosjektnavn er påkrevd."
      );
      scrollToFirstTopError({
        name: missingName,
        project: !missingName && missingProject,
        account: false,
      });
      return;
    }

    if (!validateAccount()) {
      scrollToFirstTopError({ name: false, project: false, account: true });
      return;
    }
    const digits = accountNumber.replace(/\D/g, "");
    if (accountNumber.trim() && digits.length !== 11) {
      setAccountError("Kontonummer må være 11 sifre");
      return;
    }
    if (receipts.some((r) => r.extractedTotalCents == null)) {
      setShowAmountErrors(true);
      setSubmitError("Alle kvitteringer må ha beløp i NOK.");
      return;
    }
    let missingRequiredComment = false;
    for (const r of receipts) {
      const flags = parseCommentFlags(r.commentFlags);
      const requiresComment =
        (flags.includes("MEAL") || flags.includes("TRANSPORT")) &&
        !commentFieldCollapsedIds.has(r.id);
      if (requiresComment && !(r.comment && r.comment.trim().length > 0)) {
        missingRequiredComment = true;
        break;
      }
    }
    if (missingRequiredComment) {
      setShowCommentErrors(true);
      setSubmitError(
        "Kvitteringer med mat/drikke eller reisekostnader må ha kommentar, eller fjern kommentarfeltet/taggen."
      );
      return;
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
      router.refresh();
      // Beholder submitting=true så «Sender inn…» vises til router.refresh() bytter til suksesssiden (unngår blink).
    } catch (e) {
      setSubmitError((e as Error).message);
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

  const openFormPreview = () => {
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
  };

  const sendButton = (className: string) => (
    <button
      type="button"
      onClick={handleOpenConfirmModal}
      disabled={submitting}
      aria-busy={submitting}
      className={`inline-flex items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-fg hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {submitting && (
        <span
          className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      )}
      <span>{submitting ? "Sender inn…" : "Send inn"}</span>
    </button>
  );

  return (
    <>
    <div className="grid w-full gap-4">
      {showSuccessOnly ? (
        <>
          <section className="grid gap-5 rounded-lg border border-line bg-surface p-6">
            <p className="flex items-center gap-2 text-sm font-medium text-pos">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0" aria-hidden>
                <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
              </svg>
              Utlegget er sendt inn. Vennligst last ned PDF for egen kopi.
            </p>
            {displayPdfUrl && (
              <div className="flex flex-wrap gap-2">
                <a
                  href={`/api/submissions/${token}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover"
                >
                  Last ned PDF
                </a>
                <a
                  href={`/s/${token}/print`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 items-center rounded-md bg-secondary px-4 text-sm font-medium text-ink hover:bg-secondary-hover"
                >
                  Forhåndsvis / Skriv ut
                </a>
              </div>
            )}
          </section>
          <p className="text-sm text-muted">
            Har du spørsmål vedrørende utlegg, kan disse rettes til{" "}
            <a
              href="mailto:utlegg@aparent.tv"
              className="text-ink underline hover:opacity-80"
            >
              utlegg@aparent.tv
            </a>
          </p>
        </>
      ) : (
        <>
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid min-w-0 gap-3">
      {!infoExpanded ? (
      <section className="rounded-lg border border-line bg-surface p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-ink">
            Person- og prosjektinfo
          </h2>
          <button
            type="button"
            onClick={() => setInfoExpanded(true)}
            className="rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-ink hover:bg-secondary-hover"
          >
            Endre
          </button>
        </div>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Navn</dt>
            <dd className="text-ink">{name}</dd>
          </div>
          <div>
            <dt className="text-muted">Kontonummer</dt>
            <dd className="text-ink tabular-nums">{accountNumber}</dd>
          </div>
          <div>
            <dt className="text-muted">Prosjekt</dt>
            <dd className="text-ink">
              {[projectNumber.trim(), project.trim()].filter(Boolean).join(" – ")}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Dato</dt>
            <dd className="text-ink tabular-nums">
              {workDate ? workDate.split("-").reverse().join(".") : "Ikke oppgitt"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Prod.penger / forskudd</dt>
            <dd className="text-ink tabular-nums">
              {productionCash.trim() === "" ? "Ikke oppgitt" : formatNok(productionCashCents)}
            </dd>
          </div>
        </dl>
      </section>
      ) : (
      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-4 text-[15px] font-semibold text-ink">
          Person- og prosjektinfo
        </h2>
        <div className="grid grid-cols-12 gap-x-3 gap-y-4">
          <div className="col-span-12 sm:col-span-6">
            <label htmlFor="personinfo-name" className="block text-sm text-muted mb-1">
              Navn <span className="text-muted">*</span>
            </label>
            <input
              ref={nameInputRef}
              id="personinfo-name"
              name="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitted}
              className={`w-full h-9 rounded-md border bg-field px-3 text-ink placeholder-faint focus:outline-none focus:ring-2 disabled:opacity-60 ${
                showFieldErrors && !name.trim()
                  ? "border-neg focus:border-neg focus:ring-neg/15"
                  : "border-control focus:border-ink focus:ring-ink/10"
              }`}
              placeholder="Fullt navn"
            />
          </div>
          <div className="col-span-12 sm:col-span-6">
            <label htmlFor="personinfo-accountNumber" className="block text-sm text-muted mb-1">
              Kontonummer (11 sifre) <span className="text-muted">*</span>
            </label>
            <input
              ref={accountInputRef}
              id="personinfo-accountNumber"
              name="accountNumber"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={accountNumber}
              onChange={(e) => {
                setAccountNumber(e.target.value);
                setAccountError(null);
              }}
              onBlur={validateAccount}
              disabled={isSubmitted}
              className={`w-full h-9 rounded-md border bg-field px-3 text-ink placeholder-faint focus:outline-none focus:ring-2 disabled:opacity-60 ${
                accountError
                  ? "border-neg focus:border-neg focus:ring-neg/15"
                  : "border-control focus:border-ink focus:ring-ink/10"
              }`}
              placeholder="11 sifre"
              maxLength={11}
            />
          </div>
          <div className="contents">
            <div className="col-span-12 min-w-0 sm:col-span-3">
              <label htmlFor="personinfo-projectNumber" className="mb-1 flex items-center gap-1.5 text-sm text-muted">
                Prosjektnummer
                <span className="group relative inline-flex">
                  <span className="inline-flex cursor-default text-muted hover:text-ink" aria-label="Prosjektnummer finnes i email, eller fås av produsent.">
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
                  <span className="pointer-events-none absolute left-1/2 bottom-full z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-secondary px-2.5 py-1.5 text-xs text-ink opacity-0 shadow transition-opacity duration-150 group-hover:opacity-100">
                    Prosjektnummer finnes i email, eller fås av produsent.
                  </span>
                </span>
              </label>
              <input
                id="personinfo-projectNumber"
                name="projectNumber"
                type="number"
                inputMode="numeric"
                autoComplete="off"
                value={projectNumber}
                onChange={(e) => setProjectNumber(e.target.value)}
                disabled={isSubmitted}
                className="min-w-28 w-full h-9 rounded-md border border-control bg-field px-3 text-ink placeholder-faint focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10 disabled:opacity-60 sm:min-w-32 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="0"
              />
            </div>
            <div className="col-span-12 min-w-0 sm:col-span-6">
              <label className="block text-sm text-muted mb-1">
                Prosjektnavn <span className="text-muted">*</span>
              </label>
              <input
                ref={projectInputRef}
                id="personinfo-project"
                name="project"
                type="text"
                autoComplete="off"
                value={project}
                onChange={(e) => setProject(e.target.value)}
                disabled={isSubmitted}
                className={`w-full h-9 rounded-md border bg-field px-3 text-ink placeholder-faint focus:outline-none focus:ring-2 disabled:opacity-60 ${
                  showFieldErrors && !project.trim()
                    ? "border-neg focus:border-neg focus:ring-neg/15"
                    : "border-control focus:border-ink focus:ring-ink/10"
                }`}
                placeholder="Prosjektnavn"
              />
            </div>
          </div>
          <div className="col-span-12 sm:col-span-3">
            <label htmlFor="personinfo-workDate" className="block text-sm text-muted mb-1">Dato</label>
            <input
              ref={workDateInputRef}
              id="personinfo-workDate"
              name="workDate"
              type="date"
              autoComplete="off"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              onClick={() => workDateInputRef.current?.showPicker?.()}
              disabled={isSubmitted}
              className="h-9 w-full rounded-md border border-control bg-field px-3 py-1 text-ink focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10 disabled:opacity-60 cursor-pointer"
            />
          </div>
          <div className="col-span-12 sm:col-span-6">
            <label htmlFor="personinfo-productionCash" className="block text-sm text-muted mb-1">
              Prod.penger / forskudd (NOK)
            </label>
            <input
              id="personinfo-productionCash"
              name="productionCash"
              type="number"
              inputMode="numeric"
              autoComplete="off"
              value={productionCash}
              onChange={(e) => setProductionCash(e.target.value)}
              disabled={isSubmitted}
              className="w-full h-9 rounded-md border border-control bg-field px-3 text-ink placeholder-faint focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10 disabled:opacity-60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              placeholder="0"
            />
          </div>
        </div>
      </section>
      )}

      <section
        className={`rounded-lg border bg-surface p-5 transition-colors ${
          !isSubmitted && isDraggingOverReceipts ? "border-data" : "border-line"
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
        <div className="mb-4">
          <h2 className="text-[15px] font-semibold text-ink">Kvitteringer</h2>
          <p className="mt-0.5 text-sm text-muted">
            {receipts.length} bilag. Kontroller beskrivelse og beløp mot hvert bilag før du sender inn.
          </p>
        </div>
        <div className="w-full text-sm">
          {/* Desktop: column headers (hidden on mobile) */}
          <div className="hidden text-xs text-muted md:grid md:grid-cols-[auto_1fr_auto_auto] md:gap-2 md:border-b md:border-rule md:pb-2 md:text-left">
            <div className="w-6">#</div>
            <div>Beskrivelse</div>
            <div className="text-right w-28">Beløp</div>
            <div className="w-[4.25rem] text-right"><span className="sr-only">Handlinger</span></div>
          </div>
          {receipts.flatMap((r, i) => {
                const isPending =
                  addingReceipts && r.extractedSummary == null;
                if (isPending) {
                  return [
                    <div key={r.id} className="border-b border-rule py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-muted text-sm shrink-0">
                          {i + 1}.
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised">
                            <div
                              className="h-full min-w-[30%] rounded-full bg-load animate-analyze-progress"
                              role="progressbar"
                              aria-valuetext="Laster opp og analyserer"
                            />
                          </div>
                        </div>
                        <span className="text-xs text-muted shrink-0">
                          Laster opp og analyserer…
                        </span>
                      </div>
                    </div>,
                  ];
                }
                const showComment =
                  ((flagsById.get(r.id) ?? []).length > 0 &&
                    !commentFieldCollapsedIds.has(r.id)) ||
                  commentExpandedIds.has(r.id);
                const activeFlags = flagsById.get(r.id) ?? [];
                const allInfoModalsClosed =
                  (mealModalClosedOnce || !hasAnyMeal) &&
                  (transportModalClosedOnce || !hasAnyTransport);
                const showMealHighlight =
                  !isSubmitted &&
                  !showMealInfoModal &&
                  !showTransportInfoModal &&
                  allInfoModalsClosed &&
                  activeFlags.includes("MEAL") &&
                  !mealHighlightDismissedIds.has(r.id);
                const showTransportHighlight =
                  !isSubmitted &&
                  !showMealInfoModal &&
                  !showTransportInfoModal &&
                  allInfoModalsClosed &&
                  activeFlags.includes("TRANSPORT") &&
                  !transportHighlightDismissedIds.has(r.id);
                const amountInputProps = {
                  type: "number" as const,
                  min: -10000,
                  max: 10000,
                  step: "0.01",
                  value:
                    r.id in amountInputs
                      ? amountInputs[r.id]
                      : r.extractedTotalCents != null
                        ? (r.extractedTotalCents / 100).toFixed(2)
                        : "",
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                    const v = e.target.value;
                    setAmountInputs((prev) => ({ ...prev, [r.id]: v }));
                    if (v === "") {
                      updateReceipt(r.id, { extractedTotalCents: null });
                      return;
                    }
                    const num = parseFloat(v);
                    if (Number.isNaN(num) || num < -10000 || num > 10000) {
                      // Ugyldig eller utenfor tillatt intervall – behandles som ikke utfylt
                      updateReceipt(r.id, { extractedTotalCents: null });
                      return;
                    }
                    updateReceipt(r.id, {
                      extractedTotalCents: Math.round(num * 100),
                    });
                  },
                  onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
                    const v = e.target.value.trim();
                    if (v === "") return;
                    const num = parseFloat(v);
                    if (!Number.isNaN(num) && num >= -10000 && num <= 10000) {
                      setAmountInputs((prev) => {
                        const next = { ...prev };
                        next[r.id] = num.toFixed(2);
                        return next;
                      });
                    }
                  },
                  disabled: isSubmitted,
                  placeholder: "0.00",
                };

                return [
                  <div
                    key={r.id}
                    className={`grid grid-cols-1 md:grid-cols-[auto_1fr_auto_auto] md:gap-2 md:items-start gap-2 py-3 md:py-2 ${showComment ? "" : "border-b border-rule"}`}
                  >
                    {/* Mobile: row1 = # + description only, row2 = amount + NOK + icons. Desktop: grid cells */}
                    <div className="flex flex-col gap-1.5 md:contents">
                      <div className="flex items-center gap-1 min-w-0 flex-wrap md:contents md:gap-2">
                        <span className="w-4 shrink-0 text-muted text-sm md:w-6 md:text-base md:pt-0.5">{i + 1}</span>
                        <div className="min-w-0 flex-1 flex flex-col gap-1 md:col-span-1 md:flex-row md:flex-wrap md:items-center">
                          <input
                            type="text"
                            value={r.extractedSummary ?? ""}
                            onChange={(e) =>
                              updateReceipt(r.id, {
                                extractedSummary: e.target.value || null,
                              })
                            }
                            disabled={isSubmitted}
                            className="min-w-0 flex-1 h-8 w-full rounded-md border border-transparent bg-transparent px-2 py-1 font-medium text-ink hover:border-control focus:border-ink focus:bg-field focus:outline-none"
                            placeholder="Beskrivelse"
                          />
                          {r.originalAmountCents != null &&
                            r.extractedCurrency &&
                            r.extractedCurrency.toUpperCase() !== "NOK" && (
                              <span className="shrink-0 text-xs text-muted whitespace-nowrap">
                                {(r.originalAmountCents / 100).toFixed(2)} {currencyDisplay(r.extractedCurrency)}
                              </span>
                            )}
                          {activeFlags.includes("MEAL") && (
                            <span className="hidden md:inline-flex items-center gap-1 rounded-full bg-pill pl-2 pr-0.5 py-0.5 text-xs font-medium text-pill-ink">
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
                                  className="rounded-full p-0.5 text-faint hover:bg-control hover:text-ink"
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
                          {activeFlags.includes("TRANSPORT") && (
                            <span className="hidden md:inline-flex items-center gap-1 rounded-full bg-pill pl-2 pr-0.5 py-0.5 text-xs font-medium text-pill-ink">
                              Reisekostnader
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
                                          body: JSON.stringify({ dismissFlag: "TRANSPORT" as SmartFlag }),
                                        }
                                      );
                                      const flags = parseCommentFlags(r.commentFlags).filter((f) => f !== "TRANSPORT");
                                      const dismissed = [...parseCommentFlags(r.dismissedCommentFlags), "TRANSPORT"];
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
                                  className="rounded-full p-0.5 text-faint hover:bg-control hover:text-ink"
                                  title="Fjern tag"
                                  aria-label="Fjern Reisekostnader"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                                    <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-2.72 2.72a.75.75 0 1 0 1.06 1.06L10 11.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L11.06 10l2.72-2.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 6.22Z" />
                                  </svg>
                                </button>
                              )}
                            </span>
                          )}
                          {/* Desktop: "Legg til kommentar" under description (inside this cell) */}
                          {!showComment && !isSubmitted && (
                            <button
                              type="button"
                              onClick={() => {
                                setCommentExpandedIds((prev) => new Set(prev).add(r.id));
                                setCommentFieldCollapsedIds((prev) => {
                                  const next = new Set(prev);
                                  next.delete(r.id);
                                  return next;
                                });
                              }}
                              className="hidden md:block mt-0.5 w-fit text-left text-xs text-muted underline decoration-control underline-offset-2 hover:text-ink"
                            >
                              Legg til kommentar
                            </button>
                          )}
                        </div>
                        {/* Desktop: amount in own grid cell */}
                        <div className="hidden md:flex h-8 items-center justify-end gap-1">
                          <input
                            {...amountInputProps}
                            className={`h-8 w-28 rounded-md border bg-field px-2 py-1 text-right font-semibold text-ink focus:outline-none ${
                              showAmountErrors &&
                              r.extractedTotalCents == null
                                ? "border-neg focus:border-neg"
                                : "border-control focus:border-ink"
                            }`}
                          />
                          <span className="text-xs text-muted shrink-0">NOK</span>
                        </div>
                        {/* Desktop: preview + trash in grid column 4 */}
                        <div className="hidden md:flex h-8 items-center justify-end gap-1 shrink-0 md:col-start-4">
                          <button
                            type="button"
                            onClick={() => setPreviewReceipt(r)}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-control bg-surface text-muted hover:border-control-hover hover:text-ink focus:border-ink focus:outline-none"
                            title="Vis bilag"
                            aria-label="Vis bilag"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
                              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
                            </svg>
                          </button>
                          {!isSubmitted && (
                            <button
                              type="button"
                              onClick={() => handleDeleteReceipt(r.id)}
                              disabled={deletingId === r.id}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-control bg-surface text-muted hover:border-neg hover:bg-neg-soft hover:text-neg focus:border-neg focus:outline-none disabled:opacity-50"
                              title="Fjern bilag"
                              aria-label="Fjern bilag"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
                                <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.518.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Z" clipRule="evenodd" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                      {/* Mobile only: Mat/drikke på egen linje under beskrivelse (gir mer plass til beløp + ikoner) */}
                      {activeFlags.includes("MEAL") && (
                        <div className="flex items-center gap-2 md:hidden pl-5">
                          <span className="inline-flex items-center gap-1 rounded-full bg-pill pl-2 pr-0.5 py-0.5 text-xs font-medium text-pill-ink shrink-0">
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
                                className="rounded-full p-0.5 text-faint hover:bg-control hover:text-ink"
                                title="Fjern tag"
                                aria-label="Fjern Mat/drikke"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-2.72 2.72a.75.75 0 1 0 1.06 1.06L10 11.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L11.06 10l2.72-2.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 6.22Z" />
                                </svg>
                              </button>
                            )}
                          </span>
                        </div>
                      )}
                      {activeFlags.includes("TRANSPORT") && (
                        <div className="flex items-center gap-2 md:hidden pl-5">
                          <span className="inline-flex items-center gap-1 rounded-full bg-pill pl-2 pr-0.5 py-0.5 text-xs font-medium text-pill-ink shrink-0">
                            Reisekostnader
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
                                        body: JSON.stringify({ dismissFlag: "TRANSPORT" as SmartFlag }),
                                      }
                                    );
                                    const flags = parseCommentFlags(r.commentFlags).filter((f) => f !== "TRANSPORT");
                                    const dismissed = [...parseCommentFlags(r.dismissedCommentFlags), "TRANSPORT"];
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
                                className="rounded-full p-0.5 text-faint hover:bg-control hover:text-ink"
                                title="Fjern tag"
                                aria-label="Fjern Reisekostnader"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-2.72 2.72a.75.75 0 1 0 1.06 1.06L10 11.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L11.06 10l2.72-2.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 6.22Z" />
                                </svg>
                              </button>
                            )}
                          </span>
                        </div>
                      )}
                      {/* Mobile only: amount + NOK + preview + trash on one line */}
                      <div className="flex items-center gap-2 md:hidden pl-5">
                        <div className="flex h-8 items-center gap-1">
                          <input
                            {...amountInputProps}
                            className={`h-8 w-24 rounded-md border bg-field px-2 py-1 text-right font-semibold text-ink focus:outline-none ${
                              showAmountErrors &&
                              r.extractedTotalCents == null
                                ? "border-neg focus:border-neg"
                                : "border-control focus:border-ink"
                            }`}
                          />
                          <span className="text-xs text-muted shrink-0">NOK</span>
                        </div>
                        <div className="flex h-8 items-center gap-1 shrink-0 ml-auto">
                          <button
                            type="button"
                            onClick={() => setPreviewReceipt(r)}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-control bg-surface text-muted hover:border-control-hover hover:text-ink focus:border-ink focus:outline-none"
                            title="Vis bilag"
                            aria-label="Vis bilag"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
                              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
                            </svg>
                          </button>
                          {!isSubmitted && (
                            <button
                              type="button"
                              onClick={() => handleDeleteReceipt(r.id)}
                              disabled={deletingId === r.id}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-control bg-surface text-muted hover:border-neg hover:bg-neg-soft hover:text-neg focus:border-neg focus:outline-none disabled:opacity-50"
                              title="Fjern bilag"
                              aria-label="Fjern bilag"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
                                <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.518.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Z" clipRule="evenodd" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                      {/* Mobile: "Legg til kommentar" on its own row (align left with description) */}
                      {!showComment && !isSubmitted && (
                        <button
                          type="button"
                          onClick={() => {
                            setCommentExpandedIds((prev) => new Set(prev).add(r.id));
                            setCommentFieldCollapsedIds((prev) => {
                              const next = new Set(prev);
                              next.delete(r.id);
                              return next;
                            });
                          }}
                          className="text-left text-xs text-muted underline decoration-control underline-offset-2 hover:text-ink md:hidden pl-5"
                        >
                          Legg til kommentar
                        </button>
                      )}
                    </div>
                  </div>,
                  showComment ? (
                    <div key={`${r.id}-comment`} className="col-span-1 md:col-span-4 border-b border-rule pb-2 pt-0 pl-5 md:pl-0">
                      <div className="mt-1.5 flex min-h-7 items-center gap-0.5 min-w-0">
                        <div
                          className={showMealHighlight || showTransportHighlight ? "meal-highlight-wrap flex min-h-7 w-full min-w-0 max-w-full md:max-w-[19.2rem] shrink flex-1 items-center rounded" : "flex min-h-7 w-full min-w-0 max-w-full md:max-w-[19.2rem] shrink flex-1 items-center"}
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
                                : activeFlags.includes("TRANSPORT")
                                  ? TRANSPORT_COMMENT_PLACEHOLDER
                                  : "Skriv en kommentar (valgfritt)…"
                            }
                            aria-required={
                              (activeFlags.includes("MEAL") ||
                                activeFlags.includes("TRANSPORT")) &&
                              !commentFieldCollapsedIds.has(r.id)
                            }
                            rows={1}
                            className={`min-h-7 w-full min-w-0 resize-none overflow-hidden rounded-md border bg-comment px-2.5 py-1 text-xs text-ink placeholder:text-faint focus:bg-field focus:outline-none focus:ring-2 disabled:opacity-60 ${
                              (activeFlags.includes("MEAL") || activeFlags.includes("TRANSPORT")) &&
                              !commentFieldCollapsedIds.has(r.id) &&
                              !(r.comment && r.comment.trim().length > 0) &&
                              showCommentErrors
                                ? "border-neg focus:border-neg focus:ring-neg/15"
                                : "border-control focus:border-ink focus:ring-ink/10"
                            }`}
                          />
                          {showMealHighlight && (
                            <div
                              className="meal-highlight-border"
                              onAnimationEnd={() => setMealHighlightDismissedIds((prev) => new Set(prev).add(r.id))}
                              aria-hidden
                            />
                          )}
                          {showTransportHighlight && (
                            <div
                              className="meal-highlight-border"
                              onAnimationEnd={() => setTransportHighlightDismissedIds((prev) => new Set(prev).add(r.id))}
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
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-base leading-none text-muted hover:text-ink focus:outline-none"
                            title="Fjern kommentar"
                            aria-label="Fjern kommentar"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  ) : null,
                ];
              })}
        </div>
        {!isSubmitted && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-control p-3">
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
              className="rounded-md bg-secondary px-3 py-2 text-sm font-medium text-ink hover:bg-secondary-hover disabled:opacity-50"
            >
              {addingReceipts ? "Laster opp og analyserer…" : "Legg til"}
            </button>
            <span className="hidden md:inline text-sm text-muted">
              Dra filer hit for å legge til kvitteringer, eller bruk knappen.
            </span>
            {addError && (
              <p className="w-full text-sm text-neg sm:w-auto">{addError}</p>
            )}
          </div>
        )}
      </section>

      </div>

      <aside className="grid gap-3 lg:sticky lg:top-6">
        <section
          className="grid gap-4 rounded-lg border border-line bg-surface p-5"
          aria-labelledby="summary-title"
        >
          <h2 id="summary-title" className="text-[15px] font-semibold text-ink">
            Oppsummering
          </h2>
          <div>
            <p className="text-sm text-muted">{diffShort(diffCents)}</p>
            <p
              className={`whitespace-nowrap text-[30px] font-bold leading-tight tracking-tight tabular-nums ${
                diffCents < 0 ? "text-neg" : "text-data"
              }`}
            >
              {formatNok(Math.abs(diffCents))}
            </p>
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Total</dt>
              <dd className="text-ink tabular-nums">{formatNok(totalCents)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Produksjonskasse</dt>
              <dd className="text-ink tabular-nums">{formatNok(productionCashCents)}</dd>
            </div>
            <div className="flex items-start justify-between gap-3 border-t border-rule pt-2">
              <dt className="min-w-0 text-muted">{diffLabel(diffCents)}</dt>
              <dd className="shrink-0 whitespace-nowrap font-semibold text-ink tabular-nums">
                {formatNok(diffCents)}
              </dd>
            </div>
          </dl>
          {!isSubmitted && (
            <div className="hidden gap-2 lg:grid">
              {sendButton("h-10 w-full px-4")}
              <button
                type="button"
                onClick={openFormPreview}
                className="h-10 rounded-md bg-secondary px-4 text-sm font-medium text-ink hover:bg-secondary-hover"
              >
                Forhåndsvis skjema
              </button>
            </div>
          )}
          {submitError && (
            <p className="text-sm text-neg">{submitError}</p>
          )}
        </section>
        <p className="px-1 text-sm text-muted">
          Har du spørsmål vedrørende utlegg, kan disse rettes til{" "}
          <a
            href="mailto:utlegg@aparent.tv"
            className="text-ink underline hover:opacity-80"
          >
            utlegg@aparent.tv
          </a>
        </p>
      </aside>
      </div>

      {!isSubmitted && (
        <div className="sticky bottom-0 z-20 -mx-4 flex items-center justify-between gap-3 border-t border-line bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:-mx-8 md:px-8 lg:hidden">
          <div className="min-w-0">
            <p className="text-xs text-muted">{diffShort(diffCents)}</p>
            <p
              className={`whitespace-nowrap text-lg font-bold tabular-nums ${
                diffCents < 0 ? "text-neg" : "text-data"
              }`}
            >
              {formatNok(Math.abs(diffCents))}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={openFormPreview}
              className="h-9 rounded-md bg-secondary px-3 text-sm font-medium text-ink hover:bg-secondary-hover"
            >
              Forhåndsvis
            </button>
            {sendButton("h-9 px-3")}
          </div>
        </div>
      )}

      </>)}

      {showMealInfoModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="meal-info-modal-title"
        >
          <div
            className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="meal-info-modal-title"
              className="mb-4 text-lg font-semibold text-ink"
            >
              Mat og drikke
            </h2>
            <div className="text-sm text-ink space-y-3 mb-6">
              <p>
                Det ser ut som du har lagt til en eller flere kvitteringer som inneholder mat eller drikke. I så fall må du legge til en kommentar på hva og hvem det er til.
              </p>
              <p className="text-muted">
                Eksempel på mat til opptak: <em className="rounded bg-raised px-1.5 not-italic">Mat og drikke til crew og aktører</em>
              </p>
              <p className="text-muted">
                Eksempel på annen mat: <em className="rounded bg-raised px-1.5 not-italic">Overtidsmat til [Ditt navn]</em>
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
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover"
              >
                Lukk
              </button>
            </div>
          </div>
        </div>
      )}

      {showTransportInfoModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="transport-info-modal-title"
        >
          <div
            className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="transport-info-modal-title"
              className="mb-4 text-lg font-semibold text-ink"
            >
              Reisekostnader
            </h2>
            <div className="text-sm text-ink space-y-3 mb-6">
              <p>
                Det ser ut som du har lagt til en eller flere kvitteringer som kan være reisekostnader (f.eks. parkering, bensin, taxi, kollektiv). Legg gjerne til en kort kommentar om formålet.
              </p>
              <p className="text-muted">
                Eksempel: <em className="rounded bg-raised px-1.5 not-italic">Reise til/fra opptak</em> eller <em className="rounded bg-raised px-1.5 not-italic">Parkering under innspilling</em>
              </p>
              <p>
                Hvis kvitteringen ikke er en reisekostnad, fjerner du taggen eller kommentarfeltet.
              </p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowTransportInfoModal(false);
                  setTimeout(() => setTransportModalClosedOnce(true), 150);
                }}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover"
              >
                Lukk
              </button>
            </div>
          </div>
        </div>
      )}

      {showCurrencyInfoModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="currency-info-modal-title"
        >
          <div
            className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="currency-info-modal-title"
              className="mb-4 text-lg font-semibold text-ink"
            >
              Kvittering i {foreignCurrencyCode ?? "utenlandsk valuta"}
            </h2>
            <div className="text-sm text-ink space-y-3 mb-6">
              <p>
                Du har lagt til en kvittering i{" "}
                {foreignCurrencyCode ?? "utenlandsk valuta"}. Skriv inn beløpet i NOK i feltet for beløp.
              </p>
              <p className="text-muted">
                Beløpet i {foreignCurrencyCode ?? "opprinnelig valuta"} vises kun som referanse og blir ikke automatisk omregnet.
              </p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowCurrencyInfoModal(false)}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover"
              >
                Lukk
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
          onClick={() => setShowConfirmModal(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="confirm-modal-title"
              className="mb-4 text-lg font-semibold text-ink"
            >
              Siste sjekk før innsending
            </h2>
            <p className="text-sm text-muted mb-4">
              Gå gjennom punktene nedenfor før du sender inn utlegget.
            </p>
            <ul className="space-y-3 mb-6">
              <li className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="confirm-sums"
                  checked={confirmCheckedSums}
                  onChange={(e) => setConfirmCheckedSums(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                />
                <label htmlFor="confirm-sums" className="text-sm text-ink">
                  Jeg har dobbeltsjekket at summer og beskrivelser stemmer
                </label>
              </li>
              <li className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="confirm-production"
                  checked={confirmCheckedProduction}
                  onChange={(e) => setConfirmCheckedProduction(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                />
                <label htmlFor="confirm-production" className="text-sm text-ink">
                  Jeg har fylt inn om jeg har mottatt produksjonskasse (forskudd) eller ikke
                </label>
              </li>
            </ul>
            <dl className="space-y-2 text-sm mb-6 p-4 rounded-lg bg-ground">
              <div className="flex justify-between">
                <dt className="text-muted">Total</dt>
                <dd className="text-ink">{formatNok(totalCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Produksjonskasse</dt>
                <dd className="text-ink">{formatNok(productionCashCents)}</dd>
              </div>
              <div className="flex justify-between items-start gap-2 pt-2 border-t border-rule">
                <dt className="text-muted min-w-0">{diffLabel(diffCents)}</dt>
                <dd
                  className={`font-medium whitespace-nowrap shrink-0 ${
                    diffCents > 0
                      ? "text-data"
                      : diffCents < 0
                        ? "text-neg"
                        : "text-ink"
                  }`}
                >
                  {formatNok(diffCents)}
                </dd>
              </div>
              {diffCents < 0 && (
                <div className="flex justify-between pt-2 text-ink">
                  <dt className="text-muted">Kontonummer for tilbakebetaling</dt>
                  <dd className="font-mono text-ink">{REPAYMENT_ACCOUNT_NUMBER}</dd>
                </div>
              )}
            </dl>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="rounded-md bg-secondary px-4 py-2 text-sm font-medium text-ink hover:bg-secondary-hover"
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirmCheckedSums && confirmCheckedProduction) handleSubmit();
                }}
                disabled={!confirmCheckedSums || !confirmCheckedProduction}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Bekreft og send inn
              </button>
            </div>
          </div>
        </div>
      )}

      {previewReceipt && blobPreviewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Forhåndsvis bilag"
          onClick={() => setPreviewReceipt(null)}
        >
          <div
            className={`relative rounded-lg bg-surface shadow-xl flex items-start justify-center ${isImage ? "w-fit max-w-[95vw] max-h-[90vh] overflow-auto" : "min-w-[280px] min-h-[400px] max-w-[95vw] max-h-[90vh] resize overflow-auto"}`}
            onClick={(e) => e.stopPropagation()}
            style={!isImage ? { width: "min(95vw, 800px)", height: "85vh" } : undefined}
          >
            <button
              type="button"
              onClick={() => setPreviewReceipt(null)}
              className="absolute right-2 top-2 z-10 rounded-full bg-raised p-1.5 text-muted hover:bg-secondary-hover hover:text-ink focus:outline-none focus:ring-2 focus:ring-ink"
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
