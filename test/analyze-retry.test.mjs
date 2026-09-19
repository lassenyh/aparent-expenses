import assert from "node:assert/strict";
import test from "node:test";

import {
  getResponseOutputText,
  shouldRetryWithCompactAnalysis,
} from "../src/lib/analyzeReceipt.ts";

test("retries incomplete receipt output with a compact schema only for token limits", () => {
  assert.equal(
    shouldRetryWithCompactAnalysis({
      status: "incomplete",
      output_text: "{\"summary\":\"avkuttet",
      incomplete_details: { reason: "max_output_tokens" },
    }),
    true,
  );
  assert.equal(
    shouldRetryWithCompactAnalysis({
      status: "incomplete",
      output_text: "",
      incomplete_details: { reason: "content_filter" },
    }),
    false,
  );
  assert.equal(
    shouldRetryWithCompactAnalysis({
      status: "completed",
      output_text: "{\"summary\":\"ok\"}",
      incomplete_details: null,
    }),
    false,
  );
  assert.equal(
    shouldRetryWithCompactAnalysis({
      status: "completed",
      output_text: "",
      incomplete_details: null,
      output: [],
    }),
    true,
  );
  assert.equal(
    shouldRetryWithCompactAnalysis({
      status: "completed",
      output_text: "",
      incomplete_details: null,
      output: [
        { type: "message", content: [{ type: "refusal", refusal: "No" }] },
      ],
    }),
    false,
  );
});

test("reads structured output text directly when the SDK shortcut is empty", () => {
  assert.equal(
    getResponseOutputText({
      output_text: "",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: "{\"summary\":\"Bauhaus\"}" }],
        },
      ],
    }),
    '{"summary":"Bauhaus"}',
  );
});
