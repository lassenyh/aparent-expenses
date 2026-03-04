import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFPage,
} from "pdf-lib";
import sharp from "sharp";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 50;
const LINE_HEIGHT = 14;
const SECTION_PAD = 12;
const BORDER_GRAY = 0.85;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  } catch {
    return iso;
  }
}

export type ReceiptForPdf = {
  summary: string;
  amountCents: number;
  blobUrl: string;
  mimeType: string;
};

export type SubmissionForPdf = {
  token: string;
  name: string | null;
  project: string | null;
  workDate: string | null;
  accountNumber: string | null;
  productionCashCents: number;
};

function formatNok(cents: number): string {
  return `${(cents / 100).toFixed(2)} kr`;
}

function diffLabel(diffCents: number): string {
  if (diffCents > 0) return "Til utbetaling (Aparent skylder deg)";
  if (diffCents < 0) return "Tilbakebetaling (du skylder Aparent)";
  return "I balanse";
}

/**
 * Legacy: PDF generation for submit/email now uses renderExpensePdfHtml + htmlToPdf
 * (same React layout as preview). This function is kept for reference or if receipt
 * attachment pages are needed again.
 */
export async function buildCombinedPdf(
  submission: SubmissionForPdf,
  receipts: ReceiptForPdf[],
  getReceiptBytes: (url: string) => Promise<Buffer>
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = doc.embedStandardFont(StandardFonts.Helvetica);
  const fontBold = doc.embedStandardFont(StandardFonts.HelveticaBold);

  const totalCents = receipts.reduce((s, r) => s + r.amountCents, 0);
  const diffCents = totalCents - submission.productionCashCents;

  const cover = doc.addPage([A4_WIDTH, A4_HEIGHT]);
  let y = A4_HEIGHT - MARGIN;

  const draw = (
    page: PDFPage,
    text: string,
    opts?: { bold?: boolean; color?: [number, number, number] }
  ) => {
    const f = opts?.bold ? fontBold : font;
    page.drawText(text, {
      x: MARGIN,
      y,
      size: opts?.bold ? 12 : 11,
      font: f,
      color: opts?.color ? rgb(opts.color[0], opts.color[1], opts.color[2]) : rgb(0, 0, 0),
    });
    y -= LINE_HEIGHT;
  };

  const drawSectionBox = (page: PDFPage, bottomY: number, height: number) => {
    page.drawRectangle({
      x: MARGIN,
      y: bottomY,
      width: A4_WIDTH - 2 * MARGIN,
      height,
      borderColor: rgb(BORDER_GRAY, BORDER_GRAY, BORDER_GRAY),
      borderWidth: 0.5,
    });
  };

  // Title
  draw(cover, "Utlegg", { bold: true });
  y -= 16;

  // Section: Person- og prosjektinfo
  const infoStartY = y;
  draw(cover, "Person- og prosjektinfo", { bold: true });
  y -= LINE_HEIGHT + 4;
  draw(cover, `Navn: ${submission.name ?? "—"}`);
  draw(cover, `Prosjekt: ${submission.project ?? "—"}`);
  draw(cover, `Dato: ${formatDate(submission.workDate)}`);
  draw(cover, `Kontonummer: ${submission.accountNumber ?? "—"}`);
  draw(cover, `Produksjonskasse: ${formatNok(submission.productionCashCents)}`);
  y -= SECTION_PAD;
  drawSectionBox(cover, y, infoStartY - y + SECTION_PAD);
  y -= 12;

  // Section: Kvitteringer (each line with project prefix when set)
  const recStartY = y;
  draw(cover, "Kvitteringer", { bold: true });
  y -= LINE_HEIGHT + 4;
  receipts.forEach((r, i) => {
    draw(cover, `${i + 1}. ${r.summary || "Kvittering"} – ${formatNok(r.amountCents)}`);
  });
  y -= SECTION_PAD;
  drawSectionBox(cover, y, recStartY - y + SECTION_PAD);
  y -= 12;

  // Section: Oppsummering
  const sumStartY = y;
  draw(cover, "Oppsummering", { bold: true });
  y -= LINE_HEIGHT + 4;
  draw(cover, `Total: ${formatNok(totalCents)}`);
  draw(cover, `Produksjonskasse: ${formatNok(submission.productionCashCents)}`);
  draw(cover, `${diffLabel(diffCents)}: ${formatNok(diffCents)}`, { bold: true });
  y -= SECTION_PAD;
  drawSectionBox(cover, y, sumStartY - y + SECTION_PAD);

  // Append receipt content
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
        // If PDF load fails, add a placeholder page
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

  return doc.save();
}
