import assert from "node:assert/strict";
import test from "node:test";

import {
  canAnalyzeSubmission,
  receiptNeedsAnalysis,
} from "../src/lib/submissionAnalysis.ts";

test("analysis can resume in review and only retries unfinished receipts", () => {
  assert.equal(canAnalyzeSubmission("DRAFT"), true);
  assert.equal(canAnalyzeSubmission("REVIEW"), true);
  assert.equal(canAnalyzeSubmission("SUBMITTED"), false);
  assert.equal(receiptNeedsAnalysis({ extractedSummary: null }), true);
  assert.equal(receiptNeedsAnalysis({ extractedSummary: "Bauhaus byggevarer" }), false);
});
