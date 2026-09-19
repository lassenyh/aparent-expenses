import assert from "node:assert/strict";
import test from "node:test";

import { detectSmartComment } from "../src/lib/receipts/smartComment.ts";

test("does not classify Obs Bygg receipts as food and drink", () => {
  for (const description of [
    "Byggevarer Obs Bygg Alnabru",
    "Byggvarer Obs Bygg",
    "Trelast Obs Alnabru",
  ]) {
    const result = detectSmartComment({
      vendor: "IMG_6938.heic",
      description,
    });

    assert.equal(result.flags.includes("MEAL"), false, description);
  }
});

test("still classifies ordinary Obs grocery receipts as food and drink", () => {
  const result = detectSmartComment({ description: "Innkjøp Obs Alnabru" });

  assert.equal(result.flags.includes("MEAL"), true);
});

test("explicit food still wins in a non-grocery retail context", () => {
  const result = detectSmartComment({ description: "Kaffe Obs Bygg Alnabru" });

  assert.equal(result.flags.includes("MEAL"), true);
});
