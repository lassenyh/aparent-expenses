import { NextResponse, after } from "next/server";
import { get } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { readReceiptBlob } from "@/lib/analyzeStoredReceipt";
import { readReceiptPreview, storeReceiptPreview } from "@/lib/receiptPreview";
import {
  detectReceiptImageFormat,
  normalizeReceiptImage,
} from "@/lib/images/normalizeReceiptImage";

export const runtime = "nodejs";

function looksLikeHeic(mimeType: string, fileName: string): boolean {
  return /hei[cf]/i.test(mimeType) || /\.hei[cf]$/i.test(fileName);
}

/**
 * GET /api/submissions/[token]/receipts/[receiptId]/blob
 * Streamer et enkelt bilag (bilde eller PDF) for forhåndsvisning.
 * Blob er private – direkte blob-URL gir Forbidden, derfor proxy her.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ token: string; receiptId: string }> }
) {
  const { token, receiptId } = await context.params;
  if (!token || !receiptId) {
    return NextResponse.json({ error: "Missing token or receiptId" }, { status: 400 });
  }

  const submission = await prisma.submission.findUnique({
    where: { accessToken: token },
    include: { receipts: true },
  });

  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  const found = submission.receipts.find((r) => r.id === receiptId);
  if (!found) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  // ?part=<id> serves one of the receipt's extra images instead of its own file.
  const partId = new URL(request.url).searchParams.get("part");
  let receipt = { ...found, previewKey: found.id };
  if (partId) {
    const part = await prisma.receiptPart.findFirst({ where: { id: partId, receiptId } });
    if (!part) return NextResponse.json({ error: "Receipt part not found" }, { status: 404 });
    receipt = { ...found, ...part, id: found.id, previewKey: `part-${part.id}` };
  }

  try {
    // Only Safari can show HEIC, so iPhone photos are converted to JPEG for viewing.
    if (looksLikeHeic(receipt.mimeType, receipt.originalFileName)) {
      const preview = await readReceiptPreview(receipt.previewKey);
      if (preview) {
        return new NextResponse(new Uint8Array(preview), {
          headers: {
            "Content-Type": "image/jpeg",
            "Content-Disposition": "inline",
            "Cache-Control": "private, max-age=3600",
          },
        });
      }
      const bytes = await readReceiptBlob(receipt.blobUrl);
      if (!bytes) {
        return NextResponse.json({ error: "Kunne ikke hente bilag" }, { status: 502 });
      }
      if (detectReceiptImageFormat(bytes, receipt.mimeType) === "heic") {
        const jpeg = await normalizeReceiptImage(bytes, receipt.mimeType);
        // Receipts analysed before previews were stored get one now, after the response.
        after(() =>
          storeReceiptPreview(receipt.previewKey, jpeg).catch((error) =>
            console.warn("[receipt blob] Kunne ikke lagre forhåndsvisning", error)
          )
        );
        return new NextResponse(new Uint8Array(jpeg), {
          headers: {
            "Content-Type": "image/jpeg",
            "Content-Disposition": "inline",
            "Cache-Control": "private, max-age=3600",
          },
        });
      }
      return new NextResponse(new Uint8Array(bytes), {
        headers: {
          "Content-Type": receipt.mimeType || "application/octet-stream",
          "Content-Disposition": "inline",
        },
      });
    }

    const result = await get(receipt.blobUrl, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return NextResponse.json(
        { error: "Kunne ikke hente bilag" },
        { status: 502 }
      );
    }

    const contentType = receipt.mimeType || "application/octet-stream";
    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": "inline",
      },
    });
  } catch (error) {
    console.error("[receipt blob]", error);
    return NextResponse.json(
      { error: "Kunne ikke hente bilag" },
      { status: 500 }
    );
  }
}
