import test from "node:test";
import assert from "node:assert/strict";
import { pdfDownloadHeader } from "../src/lib/downloadFilename.ts";

test("PDF headers support Unicode project names without invalid HTTP characters", () => {
  const header = pdfDownloadHeader("0101 \u2013 \u00c5pent prosjekt\r\n.pdf");
  assert.doesNotThrow(() => new Headers({ "Content-Disposition": header }));
  assert.match(header, /filename\*=UTF-8/);
  assert.match(header, /%E2%80%93/);
  assert.ok(!header.includes("\r") && !header.includes("\n"));
});
