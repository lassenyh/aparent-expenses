import assert from "node:assert/strict";
import test from "node:test";

import { currencyDisplay } from "../src/lib/currencyDisplay.ts";

test("an unknown currency is shown as text, never as the internal code", () => {
  assert.equal(currencyDisplay("UNKNOWN"), "ukjent valuta");
  assert.equal(currencyDisplay("SEK"), "SEK");
});
