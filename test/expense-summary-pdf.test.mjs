import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";

import { renderExpenseSummaryPdf } from "../src/lib/pdf/renderExpenseSummaryPdf.ts";

const submission = {
  name: "Ingrid Solheim",
  projectNumber: "2417",
  project: "Vinterlys",
  workDate: "2026-10-14T12:00:00.000Z",
  accountNumber: "15032748219",
  productionCashCents: 0,
};

test("draws the summary without Chrome and continues long lists on new pages", async () => {
  const receipts = Array.from({ length: 40 }, (_, i) => ({
    summary: `Kvittering ${i + 1} hos Biltema`,
    amountCents: 10000,
    comment: i % 3 === 0 ? "Reise til opptak" : null,
  }));
  const pdf = await renderExpenseSummaryPdf({
    submission,
    receipts,
    totals: { totalCents: 400000, productionCashCents: 0, diffCents: 400000 },
  });
  const doc = await PDFDocument.load(pdf);
  assert.ok(doc.getPageCount() >= 2);
});

test("text outside the PDF font's character set does not break the form", async () => {
  const pdf = await renderExpenseSummaryPdf({
    submission: { ...submission, name: "Łukasz Żółć 🎬" },
    receipts: [{ summary: "Kaffe ☕ hos Kiwi – «crew»", amountCents: 4500, comment: "Smørbrød ≈ 45 kr" }],
    totals: { totalCents: 4500, productionCashCents: 0, diffCents: 4500 },
  });
  assert.equal((await PDFDocument.load(pdf)).getPageCount(), 1);
});
