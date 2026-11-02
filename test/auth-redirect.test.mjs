import assert from "node:assert/strict";
import test from "node:test";
import { authDestination } from "../src/lib/authRedirect.ts";

test("auth callbacks only allow the password reset destination", () => {
  assert.equal(authDestination("/auth/reset-password"), "/auth/reset-password");
  for (const next of [null, "https://example.com", "//example.com", "/admin/other", "/auth/reset-password?next=https://example.com"]) {
    assert.equal(authDestination(next), "/admin");
  }
});
