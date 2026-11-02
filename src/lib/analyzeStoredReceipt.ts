import { get } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { analyzeReceipt } from "@/lib/analyzeReceipt";
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

/** Analyses one stored receipt and saves the extracted fields and comment flags. */
export async function analyzeAndStoreReceipt(receipt: StoredReceipt, bytes: Buffer): Promise<void> {
  const analyzed = await analyzeReceipt(bytes, receipt.mimeType);
  const { flags } = detectSmartComment({
    description: analyzed.summary,
    vendor: receipt.originalFileName,
    extractedText: analyzed.extractedText,
  });
  const dismissed = parseCommentFlags(receipt.dismissedCommentFlags);
  const activeFlags = flags.filter((f) => !dismissed.includes(f));

  await prisma.receipt.update({
    where: { id: receipt.id },
    data: {
      extractedSummary: analyzed.summary,
      extractedTotalCents: analyzed.totalCents,
      extractedCurrency: analyzed.currency ?? "NOK",
      originalAmountCents: analyzed.originalAmountCents ?? undefined,
      commentFlags: stringifyCommentFlags(activeFlags),
    },
  });
}
