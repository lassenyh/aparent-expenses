import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAmount,
  ownsAllReceipts,
  escapeHtml,
  isExpired,
} from "../src/lib/receiptValidation.ts";
import { parseReceiptOutput } from "../src/lib/analyzeReceipt.ts";
const result = (patch = {}) =>
  JSON.stringify({
    summary: "Returbillett tog",
    merchant: "TEST",
    receiptDate: "2026-09-19",
    total: 170,
    currency: "NOK",
    readable: true,
    isRefund: false,
    refundEvidence: null,
    receiptCount: 1,
    issues: [],
    vatBreakdown: [],
    lineItems: [],
    ...patch,
  });
test("Norwegian amounts preserve cents and reject partial parsing", () => {
  for (const [value, expected] of [
    ["1.234,56", 123456],
    ["1 234,56", 123456],
    ["41,25", 4125],
    ["10.50", 1050],
    [-170, -17000],
    ["-1.234,56", -123456],
  ])
    assert.equal(parseAmount(value), expected);
  for (const value of [
    "1.234.56",
    "12abc",
    "",
    Infinity,
    NaN,
    "1e4",
    "1,234.56",
  ])
    assert.equal(parseAmount(value), null);
});
test("return train ticket is positive; refund requires explicit evidence", () => {
  assert.equal(parseReceiptOutput(result()).totalCents, 17000);
  assert.equal(
    parseReceiptOutput(result({ isRefund: true, refundEvidence: null }))
      .totalCents,
    17000,
  );
  assert.equal(
    parseReceiptOutput(
      result({ isRefund: true, refundEvidence: "REFUND 170,00" }),
    ).totalCents,
    -17000,
  );
});
test("poor images and multiple receipts cannot invent usable totals", () => {
  assert.equal(
    parseReceiptOutput(result({ readable: false })).totalCents,
    null,
  );
  assert.equal(
    parseReceiptOutput(result({ receiptCount: 2 })).totalCents,
    null,
  );
  assert.equal(parseReceiptOutput(result({ currency: null })).totalCents, null);
});
test("original foreign-currency flow converts to NOK and keeps the original amount", () => {
  const previous = process.env.EXCHANGE_RATE_EUR;
  process.env.EXCHANGE_RATE_EUR = "11.5";
  try {
    const eur = parseReceiptOutput(result({ currency: "EUR", total: 12.5 }));
    assert.equal(eur.totalCents, 14375);
    assert.equal(eur.originalAmountCents, 1250);
  } finally {
    if (previous === undefined) delete process.env.EXCHANGE_RATE_EUR;
    else process.env.EXCHANGE_RATE_EUR = previous;
  }
});
test("receipt ownership rejects foreign and duplicate ids", () => {
  assert.equal(ownsAllReceipts(["a"], ["a", "b"]), true);
  assert.equal(ownsAllReceipts(["a", "foreign"], ["a", "b"]), false);
  assert.equal(ownsAllReceipts(["a", "a"], ["a", "b"]), false);
});
test("email text is escaped and expired tokens rejected", () => {
  assert.equal(escapeHtml('<script>"&'), "&lt;script&gt;&quot;&amp;");
  assert.equal(isExpired(new Date(0)), true);
  assert.equal(isExpired(null), false);
});
