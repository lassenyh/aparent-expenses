import { PDFDocument } from "pdf-lib";
import { normalizeReceiptImage } from "@/lib/images/normalizeReceiptImage";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 50;

export type ReceiptForAppend = {
  blobUrl: string;
  mimeType: string;
  summary?: string;
  originalFileName?: string;
};

function receiptLabel(receipt: ReceiptForAppend): string {
  return receipt.originalFileName || receipt.summary || "kvittering";
}

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
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Kunne ikke legge ved PDF-en ${receiptLabel(receipt)}: ${message}`);
      }
    } else {
      try {
        const imageBytes = await normalizeReceiptImage(bytes, receipt.mimeType);
        const img = await doc.embedJpg(new Uint8Array(imageBytes));
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
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Kunne ikke behandle bildet ${receiptLabel(receipt)}: ${message}`);
      }
    }
  }

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}
