import { prisma } from "@/lib/db";

/** A receipt as the upload page lists it. */
export type UploadListItem = {
  id: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  blobUrl: string;
  analyzed: boolean;
  /** Fields used to spot possible duplicates; null until the receipt is analysed. */
  contentHash: string | null;
  merchant: string | null;
  receiptDate: string | null;
  extractedTotalCents: number | null;
  /** Extra images after the receipt's own file, in order. */
  parts: ReceiptPartSummary[];
};

export type ReceiptPartSummary = { id: string; mimeType: string; originalFileName: string };

const PART_SELECT = {
  orderBy: { position: "asc" as const },
  select: { id: true, mimeType: true, originalFileName: true },
};

export async function uploadListForClient(submissionId: string): Promise<UploadListItem[]> {
  const receipts = await prisma.receipt.findMany({
    where: { submissionId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      originalFileName: true,
      mimeType: true,
      sizeBytes: true,
      blobUrl: true,
      extractedSummary: true,
      contentHash: true,
      merchant: true,
      receiptDate: true,
      extractedTotalCents: true,
      parts: PART_SELECT,
    },
  });
  return receipts.map(({ extractedSummary, ...r }) => ({
    ...r,
    analyzed: extractedSummary != null,
  }));
}

/** A receipt row as the review page shows it. */
export async function receiptRowForClient(id: string) {
  const r = await prisma.receipt.findUnique({
    where: { id },
    include: { parts: PART_SELECT },
  });
  if (!r) return null;
  return {
    id: r.id,
    originalFileName: r.originalFileName,
    extractedSummary: r.extractedSummary,
    extractedTotalCents: r.extractedTotalCents,
    extractedCurrency: r.extractedCurrency ?? null,
    originalAmountCents: r.originalAmountCents ?? null,
    foreignExchange: r.foreignExchange ?? null,
    blobUrl: r.blobUrl,
    mimeType: r.mimeType,
    comment: r.comment,
    commentFlags: r.commentFlags ?? null,
    dismissedCommentFlags: r.dismissedCommentFlags ?? null,
    merchant: r.merchant ?? null,
    receiptDate: r.receiptDate ?? null,
    contentHash: r.contentHash ?? null,
    parts: r.parts,
  };
}
