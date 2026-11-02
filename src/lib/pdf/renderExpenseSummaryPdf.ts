import { bankPdfRows } from "@/lib/bankDetails";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { REPAYMENT_ACCOUNT_NUMBER } from "@/lib/constants";
import { currencyDisplay } from "@/lib/currencyDisplay";
import type {
  ExpensePdfReceipt,
  ExpensePdfSubmission,
  ExpensePdfTotals,
} from "@/components/pdf/ExpensePdfLayout";

/**
 * Draws the expense form's summary pages with pdf-lib, mirroring ExpensePdfLayout
 * (which the browser preview still uses). Drawing directly avoids starting Chrome,
 * which on Vercel downloaded itself on every cold start before the PDF could be made.
 */

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 30;
const MARGIN_TOP = 30;
const MARGIN_BOTTOM = 30;
const CONTENT_W = PAGE_W - 2 * MARGIN_X;
const CARD_PAD = 18;
const SECTION_GAP = 20;
const TEXT = 10.5;
const SMALL = 9;
const LINE = 15;

const ink = rgb(0.067, 0.094, 0.153); // gray-900
const muted = rgb(0.42, 0.447, 0.502); // gray-500
const border = rgb(0.898, 0.906, 0.922); // gray-200
const headerFill = rgb(0.976, 0.98, 0.984); // gray-50
const positive = rgb(0.086, 0.639, 0.29); // green-600
const negative = rgb(0.863, 0.149, 0.149); // red-600

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function formatNok(cents: number): string {
  return `${(cents / 100).toFixed(2)} NOK`;
}

function diffLabel(diffCents: number): string {
  if (diffCents > 0) return "Til utbetaling";
  if (diffCents < 0) return "Til tilbakebetaling";
  return "I balanse";
}

/** Standard PDF fonts only cover Western European characters; anything else is simplified. */
function makeSafe(font: PDFFont) {
  const cache = new Map<string, string>();
  const encodable = (ch: string) => {
    try {
      font.widthOfTextAtSize(ch, 10);
      return true;
    } catch {
      return false;
    }
  };
  return (text: string) =>
    Array.from(text.replace(/[\r\n\t]+/g, " "))
      .map((ch) => {
        if (cache.has(ch)) return cache.get(ch)!;
        let out = ch;
        if (!encodable(ch)) {
          const base = ch.normalize("NFKD").replace(/[̀-ͯ]/g, "");
          out = base && Array.from(base).every(encodable) ? base : "?";
        }
        cache.set(ch, out);
        return out;
      })
      .join("");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean).flatMap(word => {
    if (font.widthOfTextAtSize(word, size) <= width) return [word];
    const chunks: string[] = [];
    let chunk = "";
    for (const character of word) {
      if (chunk && font.widthOfTextAtSize(chunk + character, size) > width) {
        chunks.push(chunk);
        chunk = "";
      }
      chunk += character;
    }
    if (chunk) chunks.push(chunk);
    return chunks;
  });
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function roundedRectPath(w: number, h: number, r: number): string {
  return `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
}

export async function renderExpenseSummaryPdf({
  submission,
  receipts,
  totals,
}: {
  submission: ExpensePdfSubmission;
  receipts: ExpensePdfReceipt[];
  totals: ExpensePdfTotals;
}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle("Utleggsskjema");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const safe = makeSafe(regular);

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  /** Distance from the top of the current page. */
  let top = MARGIN_TOP;
  const yOf = (t: number) => PAGE_H - t;
  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    top = MARGIN_TOP;
  };
  const fits = (height: number) => top + height <= PAGE_H - MARGIN_BOTTOM;

  const text = (
    value: string,
    x: number,
    baselineTop: number,
    opts: { font?: PDFFont; size?: number; color?: RGB; align?: "left" | "right" } = {},
  ) => {
    const font = opts.font ?? regular;
    const size = opts.size ?? TEXT;
    const s = safe(value);
    const width = font.widthOfTextAtSize(s, size);
    page.drawText(s, {
      x: opts.align === "right" ? x - width : x,
      y: yOf(baselineTop),
      size,
      font,
      color: opts.color ?? ink,
    });
  };
  const hline = (x1: number, x2: number, t: number) =>
    page.drawLine({ start: { x: x1, y: yOf(t) }, end: { x: x2, y: yOf(t) }, thickness: 0.75, color: border });
  const box = (x: number, t: number, w: number, h: number, r: number, fill?: RGB) =>
    page.drawSvgPath(roundedRectPath(w, h, r), {
      x,
      y: yOf(t),
      borderColor: border,
      borderWidth: 0.75,
      ...(fill ? { color: fill } : {}),
    });
  const cardTitle = (title: string, t: number) =>
    text(title.toUpperCase(), MARGIN_X + CARD_PAD, t, { font: bold, size: TEXT });

  // Header: title, project line and logo, then a rule.
  const project = [submission.projectNumber?.trim(), submission.project?.trim()].filter(Boolean).join(" – ");
  text("Utleggsskjema", MARGIN_X, top + 18, { font: bold, size: 18 });
  if (project) text(project, MARGIN_X, top + 36, { size: TEXT, color: muted });
  try {
    const logo = await doc.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "logo-pdf.png")));
    const scaled = logo.scaleToFit(105, 36);
    page.drawImage(logo, { x: PAGE_W - MARGIN_X - scaled.width, y: yOf(top + scaled.height), ...scaled });
  } catch {
    // The form is complete without the logo.
  }
  top += project ? 50 : 34;
  hline(MARGIN_X, PAGE_W - MARGIN_X, top);
  top += SECTION_GAP;

  // Person and project info.
  const infoRows: Array<[string, string]> = [
    ["Navn", submission.name ?? "—"],
    ["Prosjektnummer", submission.projectNumber?.trim() || "—"],
    ["Prosjektnavn", submission.project ?? "—"],
    ["Dato", formatDate(submission.workDate)],
    ...(submission.bankDetails ? bankPdfRows(submission.bankDetails) : [["Kontonummer", submission.accountNumber ?? "—"]] as Array<[string,string]>),
    ["Produksjonskasse", formatNok(submission.productionCashCents)],
  ];
  const wrappedInfo = infoRows.map(([label, value]) => ({ label, lines: wrap(safe(value), regular, TEXT, CONTENT_W - CARD_PAD * 2 - 150) }));
  const infoHeight = CARD_PAD + 24 + wrappedInfo.reduce((sum, row) => sum + row.lines.length * LINE + 9, 0) - 9 + CARD_PAD;
  const infoTop = top;
  cardTitle("Person- og prosjektinfo", top + CARD_PAD + 9);
  let rowTop = top + CARD_PAD + 12 + 12;
  for (const {label, lines} of wrappedInfo) {
    text(label, MARGIN_X + CARD_PAD, rowTop + 11, { color: muted });
    lines.forEach((value, index) => text(value, PAGE_W - MARGIN_X - CARD_PAD, rowTop + 11 + index * LINE, { align: "right" }));
    rowTop += lines.length * LINE + 9;
  }
  box(MARGIN_X, infoTop, CONTENT_W, infoHeight, 9);
  top += infoHeight + SECTION_GAP;

  // Receipts table; continues on the next page when it runs out of room.
  const tableX = MARGIN_X + CARD_PAD;
  const tableW = CONTENT_W - 2 * CARD_PAD;
  const colNr = tableX + 12;
  const colDesc = tableX + 48;
  const colAmountRight = tableX + tableW - 12;
  const amountWidth = 90;
  const descWidth = colAmountRight - amountWidth - colDesc - 12;
  const HEADER_ROW = 27;

  // A receipt and its comment form one row, so a page break never separates them.
  type Row = { height: number; draw: (rowTop: number) => void };
  const rows: Row[] = [];
  receipts.forEach((r, i) => {
    const foreign =
      r.originalAmountCents != null && r.extractedCurrency && r.extractedCurrency.toUpperCase() !== "NOK"
        ? `${(r.originalAmountCents / 100).toFixed(2)} ${currencyDisplay(r.extractedCurrency)}`
        : null;
    const descLines = wrap(safe(r.summary || "Kvittering"), regular, TEXT, descWidth);
    const foreignOnOwnLine =
      foreign != null &&
      regular.widthOfTextAtSize(descLines[descLines.length - 1], TEXT) + 8 + regular.widthOfTextAtSize(foreign, TEXT) > descWidth;
    const mainHeight = 18 + (descLines.length + (foreignOnOwnLine ? 1 : 0)) * LINE;
    const comment = r.comment?.trim();
    const commentLines = comment ? wrap(safe(`Kommentar: ${comment}`), regular, TEXT, tableW - 48) : [];
    const commentHeight = comment ? 18 + commentLines.length * LINE : 0;
    rows.push({
      height: mainHeight + commentHeight,
      draw: (t) => {
        text(String(i + 1), colNr, t + 9 + 11);
        descLines.forEach((line, k) => text(line, colDesc, t + 9 + 11 + k * LINE));
        if (foreign) {
          const lastTop = t + 9 + 11 + (descLines.length - 1) * LINE;
          if (foreignOnOwnLine) text(foreign, colDesc, lastTop + LINE, { color: muted });
          else
            text(foreign, colDesc + regular.widthOfTextAtSize(descLines[descLines.length - 1], TEXT) + 8, lastTop, {
              color: muted,
            });
        }
        text(formatNok(r.amountCents), colAmountRight, t + 9 + 11, { align: "right" });
        if (comment) {
          hline(tableX, tableX + tableW, t + mainHeight);
          commentLines.forEach((line, k) => text(line, tableX + 24, t + mainHeight + 9 + 11 + k * LINE));
        }
      },
    });
  });

  let first = true;
  let rowIndex = 0;
  while (rowIndex < rows.length || first) {
    // A card segment holds the title (first page only), the column header and as many rows as fit.
    const titleHeight = first ? 12 + 12 : 0;
    if (!fits(CARD_PAD + titleHeight + HEADER_ROW + (rows[rowIndex]?.height ?? 0) + CARD_PAD)) newPage();
    const cardTop = top;
    if (first) cardTitle("Kvitteringer", top + CARD_PAD + 9);
    let t = top + CARD_PAD + titleHeight;
    const tableTop = t;
    page.drawSvgPath(roundedRectPath(tableW, HEADER_ROW, 0.01), { x: tableX, y: yOf(t), color: headerFill });
    text("NR.", colNr, t + 18, { font: bold, size: SMALL });
    text("BESKRIVELSE", colDesc, t + 18, { font: bold, size: SMALL });
    text("BELØP", colAmountRight, t + 18, { font: bold, size: SMALL, align: "right" });
    t += HEADER_ROW;
    hline(tableX, tableX + tableW, t);
    let placed = 0;
    // The first row of a segment is always placed, so a row taller than a page cannot stall the loop.
    while (
      rowIndex < rows.length &&
      (placed === 0 || t + rows[rowIndex].height + CARD_PAD <= PAGE_H - MARGIN_BOTTOM)
    ) {
      placed++;
      const row = rows[rowIndex];
      row.draw(t);
      t += row.height;
      if (rowIndex < rows.length - 1) hline(tableX, tableX + tableW, t);
      rowIndex++;
    }
    box(tableX, tableTop, tableW, t - tableTop, 6);
    box(MARGIN_X, cardTop, CONTENT_W, t + CARD_PAD - cardTop, 9);
    top = t + CARD_PAD + SECTION_GAP;
    first = false;
    if (rowIndex < rows.length) newPage();
  }

  // Summary.
  const { totalCents, productionCashCents, diffCents } = totals;
  const summaryHeight = CARD_PAD + 24 + LINE * 3 + 12 * 2 + 12 + (diffCents < 0 ? LINE + 6 : 0) + CARD_PAD;
  if (!fits(summaryHeight)) newPage();
  const summaryTop = top;
  cardTitle("Oppsummering", top + CARD_PAD + 9);
  let t = top + CARD_PAD + 24;
  const right = PAGE_W - MARGIN_X - CARD_PAD;
  const left = MARGIN_X + CARD_PAD;
  text("Total", left, t + 11, { color: muted });
  text(formatNok(totalCents), right, t + 11, { align: "right" });
  t += LINE + 12;
  text("Produksjonskasse", left, t + 11, { color: muted });
  text(formatNok(productionCashCents), right, t + 11, { align: "right" });
  t += LINE + 6;
  hline(left, right, t);
  t += 12;
  text(diffLabel(diffCents), left, t + 11);
  text(formatNok(diffCents), right, t + 11, {
    align: "right",
    color: diffCents > 0 ? positive : diffCents < 0 ? negative : ink,
  });
  t += LINE;
  if (diffCents < 0) {
    t += 6;
    text("Kontonummer for tilbakebetaling", left, t + 11, { color: muted });
    text(REPAYMENT_ACCOUNT_NUMBER, right, t + 11, { align: "right" });
    t += LINE;
  }
  box(MARGIN_X, summaryTop, CONTENT_W, t + CARD_PAD - summaryTop, 9);

  return Buffer.from(await doc.save());
}
