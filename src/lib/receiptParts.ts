import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { deleteReceiptPreview } from "@/lib/receiptPreview";

/**
 * Operations for receipts photographed in several images. A receipt's own file
 * is part 1; ReceiptPart rows hold the rest in order. Every change clears the
 * extracted fields so the receipt is analysed again as a whole; clearing
 * analysisStartedAt also makes any analysis still running discard its result.
 */
const RESET_ANALYSIS = {
  extractedSummary: null,
  extractedTotalCents: null,
  extractedCurrency: "NOK",
  originalAmountCents: null,
  foreignExchange: Prisma.DbNull,
  merchant: null,
  receiptDate: null,
  commentFlags: null,
  analysisStartedAt: null,
};

export type NewPartFile = {
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  blobUrl: string;
  blobPath: string;
};

async function nextPosition(receiptId: string): Promise<number> {
  const last = await prisma.receiptPart.findFirst({
    where: { receiptId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return (last?.position ?? 0) + 1;
}

/** Adds an uploaded image to the end of a receipt. */
export async function addReceiptPart(receiptId: string, file: NewPartFile): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const last = await tx.receiptPart.findFirst({
      where: { receiptId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    await tx.receiptPart.create({
      data: { receiptId, position: (last?.position ?? 0) + 1, ...file },
    });
    await tx.receipt.update({ where: { id: receiptId }, data: RESET_ANALYSIS });
  });
}

/**
 * Appends the sources' images, in the given order, to the target receipt and
 * removes the source receipts. Files in Blob are kept: they now belong to the target.
 */
export async function combineReceipts(targetId: string, sourceIds: string[]): Promise<void> {
  let position = await nextPosition(targetId);
  const sources = await prisma.receipt.findMany({
    where: { id: { in: sourceIds } },
    include: { parts: { orderBy: { position: "asc" } } },
  });
  const ordered = sourceIds
    .map((id) => sources.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => s != null);

  await prisma.$transaction(async (tx) => {
    const target = await tx.receipt.findUniqueOrThrow({ where: { id: targetId } });
    let comment = target.comment;
    for (const source of ordered) {
      await tx.receiptPart.create({
        data: {
          receiptId: targetId,
          position: position++,
          originalFileName: source.originalFileName,
          mimeType: source.mimeType,
          sizeBytes: source.sizeBytes,
          blobUrl: source.blobUrl,
          blobPath: source.blobPath,
        },
      });
      // Existing parts keep their id, so their stored previews stay valid.
      for (const part of source.parts) {
        await tx.receiptPart.update({
          where: { id: part.id },
          data: { receiptId: targetId, position: position++ },
        });
      }
      if (!comment?.trim() && source.comment?.trim()) comment = source.comment;
      await tx.receipt.delete({ where: { id: source.id } });
    }
    await tx.receipt.update({ where: { id: targetId }, data: { ...RESET_ANALYSIS, comment } });
  });

  // The sources' own files moved into new parts, so their previews are keyed wrongly now.
  await Promise.all(ordered.map((s) => deleteReceiptPreview(s.id)));
}

/** Turns every extra image of a receipt back into a receipt of its own. */
export async function splitReceipt(receiptId: string): Promise<void> {
  const receipt = await prisma.receipt.findUniqueOrThrow({
    where: { id: receiptId },
    include: { parts: { orderBy: { position: "asc" } } },
  });
  await prisma.$transaction(async (tx) => {
    for (const part of receipt.parts) {
      await tx.receipt.create({
        data: {
          submissionId: receipt.submissionId,
          originalFileName: part.originalFileName,
          mimeType: part.mimeType,
          sizeBytes: part.sizeBytes,
          blobUrl: part.blobUrl,
          blobPath: part.blobPath,
          // Keep upload order: each new receipt sorts right after the original.
          createdAt: new Date(receipt.createdAt.getTime() + part.position),
        },
      });
    }
    await tx.receiptPart.deleteMany({ where: { receiptId } });
    await tx.receipt.update({ where: { id: receiptId }, data: RESET_ANALYSIS });
  });
  await Promise.all(receipt.parts.map((p) => deleteReceiptPreview(`part-${p.id}`)));
}
