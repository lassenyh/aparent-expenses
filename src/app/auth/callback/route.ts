import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { authDestination } from "@/lib/authRedirect";

/** Where the sign-in link in the e-mail lands. Handles both the default link and a token_hash template. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const supabase = await createSupabaseServerClient();
  let ok = false;
  if (supabase && code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (supabase && tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }
  const destination = authDestination(url.searchParams.get("next"));
  const response = NextResponse.redirect(new URL(ok ? destination : "/admin/login?feil=lenke", request.url));
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
