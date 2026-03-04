import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 50;

export type ReceiptForAppend = {
  blobUrl: string;
  mimeType: string;
  summary?: string;
};

/**
 * Appends one page per receipt to the summary PDF (first page from HTML).
 * Returns the full PDF as Buffer.
 */
export async function appendReceiptPages(
  summaryPdfBuffer: Buffer,
  receipts: ReceiptForAppend[],
  getReceiptBytes: (url: string) => Promise<Buffer>
): Promise<Buffer> {
  const doc = await PDFDocument.load(new Uint8Array(summaryPdfBuffer));
  const font = doc.embedStandardFont(StandardFonts.Helvetica);

  for (const receipt of receipts) {
    const bytes = await getReceiptBytes(receipt.blobUrl);
    const isPdf = receipt.mimeType.toLowerCase().includes("pdf");

    if (isPdf) {
      try {
        const srcDoc = await PDFDocument.load(new Uint8Array(bytes));
        const pages = srcDoc.getPages();
        const indices = pages.map((_, i) => i);
        const copied = await doc.copyPages(srcDoc, indices);
        copied.forEach((p) => doc.addPage(p));
      } catch {
        const page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
        page.drawText(`Kvittering: ${receipt.summary || "PDF"}`, {
          x: MARGIN,
          y: A4_HEIGHT - MARGIN,
          size: 12,
          font,
          color: rgb(0, 0, 0),
        });
      }
    } else {
      try {
        const isJpegOrHeic =
          receipt.mimeType.toLowerCase().includes("jpeg") ||
          receipt.mimeType.toLowerCase().includes("jpg") ||
          receipt.mimeType.toLowerCase().includes("heic");
        let imageBytes = bytes;
        try {
          const pipeline = sharp(bytes).rotate();
          imageBytes = isJpegOrHeic
            ? await pipeline.jpeg().toBuffer()
            : await pipeline.png().toBuffer();
        } catch {
          imageBytes = bytes;
        }
        const img = isJpegOrHeic
          ? await doc.embedJpg(new Uint8Array(imageBytes))
          : await doc.embedPng(new Uint8Array(imageBytes));
        const imgW = img.width;
        const imgH = img.height;
        const isLandscape = imgW > imgH;
        const pageWidth = isLandscape ? A4_HEIGHT : A4_WIDTH;
        const pageHeight = isLandscape ? A4_WIDTH : A4_HEIGHT;
        const page = doc.addPage([pageWidth, pageHeight]);
        const w = page.getWidth();
        const h = page.getHeight();
        const dims = img.scaleToFit(w - 2 * MARGIN, h - 2 * MARGIN);
        page.drawImage(img, {
          x: (w - dims.width) / 2,
          y: (h - dims.height) / 2,
          width: dims.width,
          height: dims.height,
        });
      } catch {
        const page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
        page.drawText(`Bilde: ${receipt.summary || "Kvittering"}`, {
          x: MARGIN,
          y: A4_HEIGHT - MARGIN,
          size: 12,
          font,
          color: rgb(0, 0, 0),
        });
      }
    }
  }

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}
