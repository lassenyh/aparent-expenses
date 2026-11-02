import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import { forEachConcurrent } from "@/lib/forEachConcurrent";
import { normalizeReceiptImage } from "@/lib/images/normalizeReceiptImage";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 50;
/** Receipt files fetched and converted at the same time. */
const PREPARE_CONCURRENCY = 4;

export type ReceiptFileForAppend = {
  blobUrl: string;
  mimeType: string;
  originalFileName?: string;
  /** Key of a JPEG the analysis already stored for this file (HEIC), so it need not be decoded again. */
  previewKey?: string;
};

export type ReceiptForAppend = ReceiptFileForAppend & {
  summary?: string;
  /** Extra images of the same receipt, after its own file. */
  parts?: ReceiptFileForAppend[];
};

/** A receipt file ready to go into the PDF: an image as JPEG, or a PDF as is. */
export type PreparedReceiptFile = {
  kind: "jpeg" | "pdf";
  bytes: Buffer;
  /** "Bilag n (k/m)" for receipts in several images, otherwise null. */
  label: string | null;
  name: string;
};

/**
 * Fetches every receipt file and turns images into JPEG, several at a time.
 * HEIC images use the JPEG the analysis stored when there is one; decoding an
 * iPhone photo again took about a second per receipt.
 */
export async function prepareReceiptFiles(
  receipts: ReceiptForAppend[],
  getReceiptBytes: (url: string) => Promise<Buffer>,
  getStoredJpeg?: (previewKey: string) => Promise<Buffer | null>,
): Promise<PreparedReceiptFile[]> {
  const jobs = receipts.flatMap((entry, index) => {
    const files = [entry, ...(entry.parts ?? [])];
    return files.map((file, k) => ({
      file,
      label: files.length > 1 ? `Bilag ${index + 1} (${k + 1}/${files.length})` : null,
      name: file.originalFileName || entry.summary || "kvittering",
    }));
  });
  const prepared: PreparedReceiptFile[] = new Array(jobs.length);

  await forEachConcurrent(
    jobs.map((job, i) => ({ ...job, i })),
    PREPARE_CONCURRENCY,
    async ({ file, label, name, i }) => {
      if (file.mimeType.toLowerCase().includes("pdf")) {
        prepared[i] = { kind: "pdf", bytes: await getReceiptBytes(file.blobUrl), label, name };
        return;
      }
      try {
        const stored = file.previewKey && getStoredJpeg ? await getStoredJpeg(file.previewKey) : null;
        const jpeg = stored ?? (await normalizeReceiptImage(await getReceiptBytes(file.blobUrl), file.mimeType));
        prepared[i] = { kind: "jpeg", bytes: jpeg, label, name };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Kunne ikke behandle bildet ${name}: ${message}`);
      }
    },
  );
  return prepared;
}

/**
 * Appends the prepared receipt files to the summary PDF (first page from HTML),
 * one page per image and every page of a PDF, in order.
 */
export async function appendPreparedReceiptPages(
  summaryPdfBuffer: Buffer,
  files: PreparedReceiptFile[],
): Promise<Buffer> {
  const doc = await PDFDocument.load(new Uint8Array(summaryPdfBuffer));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const labelPage = (page: PDFPage, text: string) =>
    page.drawText(text, {
      x: 24,
      y: page.getHeight() - 28,
      size: 9,
      font,
      color: rgb(0.4, 0.42, 0.45),
    });

  for (const file of files) {
    if (file.kind === "pdf") {
      try {
        const srcDoc = await PDFDocument.load(new Uint8Array(file.bytes));
        const copied = await doc.copyPages(srcDoc, srcDoc.getPageIndices());
        copied.forEach((p) => {
          doc.addPage(p);
          if (file.label) labelPage(p, file.label);
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Kunne ikke legge ved PDF-en ${file.name}: ${message}`);
      }
      continue;
    }
    try {
      const img = await doc.embedJpg(new Uint8Array(file.bytes));
      const isLandscape = img.width > img.height;
      const page = doc.addPage(isLandscape ? [A4_HEIGHT, A4_WIDTH] : [A4_WIDTH, A4_HEIGHT]);
      const w = page.getWidth();
      const h = page.getHeight();
      const dims = img.scaleToFit(w - 2 * MARGIN, h - 2 * MARGIN);
      page.drawImage(img, {
        x: (w - dims.width) / 2,
        y: (h - dims.height) / 2,
        width: dims.width,
        height: dims.height,
      });
      if (file.label) labelPage(page, file.label);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Kunne ikke behandle bildet ${file.name}: ${message}`);
    }
  }

  return Buffer.from(await doc.save());
}

/** Appends one page per receipt file to the summary PDF. Returns the full PDF. */
export async function appendReceiptPages(
  summaryPdfBuffer: Buffer,
  receipts: ReceiptForAppend[],
  getReceiptBytes: (url: string) => Promise<Buffer>,
  getStoredJpeg?: (previewKey: string) => Promise<Buffer | null>,
): Promise<Buffer> {
  const files = await prepareReceiptFiles(receipts, getReceiptBytes, getStoredJpeg);
  return appendPreparedReceiptPages(summaryPdfBuffer, files);
}
