import assert from "node:assert/strict";
import test from "node:test";

import { findDuplicates } from "../src/lib/duplicates.ts";

const kiwi = { merchant: "KIWI HAMAR", receiptDate: "2026-10-14", extractedTotalCents: 128450 };

test("the same file uploaded twice is a duplicate of the first", () => {
  const dups = findDuplicates([
    { id: "a", contentHash: "h1" },
    { id: "b", contentHash: "h2" },
    { id: "c", contentHash: "h1" },
  ]);
  assert.deepEqual([...dups], [["c", "a"]]);
});

test("two photos of the same purchase match on shop, date and amount", () => {
  const dups = findDuplicates([
    { id: "a", contentHash: "h1", ...kiwi },
    { id: "b", contentHash: "h2", ...kiwi, merchant: "Kiwi Hamar AS" },
  ]);
  assert.equal(dups.get("b"), "a");
});

test("a different amount, date or shop is not a duplicate", () => {
  const dups = findDuplicates([
    { id: "a", ...kiwi },
    { id: "b", ...kiwi, extractedTotalCents: 128460 },
    { id: "c", ...kiwi, receiptDate: "2026-10-15" },
    { id: "d", ...kiwi, merchant: "Rema 1000" },
  ]);
  assert.equal(dups.size, 0);
});

test("unanalysed receipts or a missing shop are only matched on the file", () => {
  const dups = findDuplicates([
    { id: "a", receiptDate: "2026-10-10", extractedTotalCents: 24000, merchant: null },
    { id: "b", receiptDate: "2026-10-10", extractedTotalCents: 24000, merchant: null },
    { id: "c" },
    { id: "d" },
  ]);
  assert.equal(dups.size, 0);
});
