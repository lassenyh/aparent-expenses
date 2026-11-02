import assert from "node:assert/strict";
import test from "node:test";
import { supabaseConfig, isAdminAuthConfigured } from "../src/lib/supabase/config.ts";

test("admin login requires both Supabase credentials and a nonempty allowlist", () => {
  const names = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "ADMIN_EMAILS"];
  const saved = names.map((name) => process.env[name]);
  try {
    for (const name of names) delete process.env[name];
    assert.equal(isAdminAuthConfigured(), false);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-key";
    process.env.ADMIN_EMAILS = " ,  , ";
    assert.equal(isAdminAuthConfigured(), false);
    process.env.ADMIN_EMAILS = "admin@example.com";
    assert.equal(isAdminAuthConfigured(), true);
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "  ";
    assert.equal(isAdminAuthConfigured(), false);
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "legacy-test-key";
    assert.equal(supabaseConfig().key, "legacy-test-key");
    assert.equal(isAdminAuthConfigured(), true);
  } finally {
    names.forEach((name, index) => {
      if (saved[index] === undefined) delete process.env[name];
      else process.env[name] = saved[index];
    });
  }
});
