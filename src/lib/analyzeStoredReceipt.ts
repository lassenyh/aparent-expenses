import { Prisma } from "@prisma/client";
import { bankConversion } from "./currency";
import { createHash } from "node:crypto";
import { get } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { analyzeReceiptFiles } from "@/lib/analyzeReceipt";
import {
  detectReceiptImageFormat,
  normalizeReceiptImage,
} from "@/lib/images/normalizeReceiptImage";
import { storeReceiptPreview } from "@/lib/receiptPreview";
import {
  detectSmartComment,
  parseCommentFlags,
  stringifyCommentFlags,
} from "@/lib/receipts/smartComment";

type StoredReceipt = {
  id: string;
  blobUrl: string;
  mimeType: string;
  originalFileName: string;
  dismissedCommentFlags: string | null;
};

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Reads a receipt file from private Blob storage, or returns null when it cannot be read. */
export async function readReceiptBlob(blobUrl: string): Promise<Buffer | null> {
  const result = await get(blobUrl, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return streamToBuffer(result.stream);
}

/** A file of a stored receipt: the receipt's own file, or one of its extra parts. */
export type StoredReceiptFile = {
  /** Key for the stored JPEG preview: the receipt id for its own file, `part-<id>` for parts. */
  previewKey: string;
  bytes: Buffer;
  mimeType: string;
};

/**
 * Reads every file of a receipt in order: its own file, then its parts.
 * Returns null when the receipt's own file cannot be read; a missing part is an error.
 */
export async function loadReceiptFiles(receipt: StoredReceipt): Promise<StoredReceiptFile[] | null> {
  const main = await readReceiptBlob(receipt.blobUrl);
  if (!main) return null;
  const parts = await prisma.receiptPart.findMany({
    where: { receiptId: receipt.id },
    orderBy: { position: "asc" },
  });
  const files: StoredReceiptFile[] = [{ previewKey: receipt.id, bytes: main, mimeType: receipt.mimeType }];
  for (const part of parts) {
    const bytes = await readReceiptBlob(part.blobUrl);
    if (!bytes) throw new Error(`Kunne ikke hente ${part.originalFileName}`);
    files.push({ previewKey: `part-${part.id}`, bytes, mimeType: part.mimeType });
  }
  return files;
}

/**
 * Analyses one stored receipt and saves the extracted fields and comment flags.
 * A result is discarded when the receipt changed meanwhile (parts added or merged),
 * because the changes reset analysisStartedAt and a new analysis is started.
 */
export async function analyzeAndStoreReceipt(
  receipt: StoredReceipt,
  files: StoredReceiptFile[]
): Promise<{ stored: boolean }> {
  const startedAt = new Date();
  const claimed = await prisma.receipt.updateMany({
    where: { id: receipt.id },
    data: { analysisStartedAt: startedAt },
  });
  if (claimed.count === 0) return { stored: false };

  // HEIC is decoded once here; the JPEG feeds the analysis and is kept for the receipt preview.
  const analysisFiles = [];
  for (const file of files) {
    if (detectReceiptImageFormat(file.bytes, file.mimeType) === "heic") {
      const jpeg = await normalizeReceiptImage(file.bytes, file.mimeType);
      await storeReceiptPreview(file.previewKey, jpeg).catch((error) =>
        console.warn("[analyzeStoredReceipt] Kunne ikke lagre forhåndsvisning", error)
      );
      analysisFiles.push({ bytes: jpeg, mimeType: "image/jpeg" });
    } else {
      analysisFiles.push({ bytes: file.bytes, mimeType: file.mimeType });
    }
  }
  const analyzed = await analyzeReceiptFiles(analysisFiles);
  const { flags } = detectSmartComment({
    description: analyzed.summary,
    vendor: receipt.originalFileName,
    extractedText: analyzed.extractedText,
  });
  const dismissed = parseCommentFlags(receipt.dismissedCommentFlags);
  const activeFlags = flags.filter((f) => !dismissed.includes(f));

  let foreignExchange = null;
  if (analyzed.currency !== "NOK" && analyzed.originalAmountCents != null && analyzed.receiptDate) {
    try { foreignExchange = await bankConversion(analyzed.currency, analyzed.originalAmountCents, analyzed.receiptDate); }
    catch { /* Keep the receipt readable; review asks for a date or documented conversion. */ }
  }
  const saved = await prisma.receipt.updateMany({
    where: { id: receipt.id, analysisStartedAt: startedAt },
    data: {
      extractedSummary: analyzed.summary,
      extractedTotalCents: foreignExchange?.nokAmountCents ?? analyzed.totalCents,
      foreignExchange: foreignExchange ?? Prisma.DbNull,
      extractedCurrency: analyzed.currency ?? "NOK",
      originalAmountCents: analyzed.originalAmountCents ?? null,
      commentFlags: stringifyCommentFlags(activeFlags),
      merchant: analyzed.merchant?.trim() || null,
      receiptDate: analyzed.receiptDate,
      // Fingerprint of the receipt's own file, used to spot the same file uploaded twice.
      contentHash: createHash("sha256").update(files[0].bytes).digest("hex"),
    },
  });
  return { stored: saved.count > 0 };
}
