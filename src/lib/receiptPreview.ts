import { del, get, put } from "@vercel/blob";

/**
 * Ready-made JPEG versions of HEIC receipts. Decoding an iPhone photo takes about
 * a second, so it is done once (during analysis, or on the first view) and the
 * JPEG is kept in Blob next to the original.
 */
function previewPathname(receiptId: string): string {
  return `receipt-previews/${receiptId}.jpg`;
}

export async function storeReceiptPreview(receiptId: string, jpeg: Buffer): Promise<void> {
  await put(previewPathname(receiptId), jpeg, {
    access: "private",
    contentType: "image/jpeg",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

/** Returns the stored JPEG, or null when there is none yet. */
export async function readReceiptPreview(receiptId: string): Promise<Buffer | null> {
  try {
    const result = await get(previewPathname(receiptId), { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  } catch {
    return null;
  }
}

export async function deleteReceiptPreview(receiptId: string): Promise<void> {
  try {
    await del(previewPathname(receiptId));
  } catch {
    // No preview stored, or already gone.
  }
}
