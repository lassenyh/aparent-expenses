"use server";

import { redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/adminAuth";
import { requestOrigin } from "@/lib/requestOrigin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminAuthConfigured } from "@/lib/supabase/config";

export type LoginState = { sentTo?: string; error?: string };

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (!isAdminAuthConfigured()) return { error: "Innlogging er ikke satt opp ennå." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const invalid = { error: "E-post eller passord er feil, eller brukeren mangler tilgang." };
  if (!isAdminEmail(email) || !password) return invalid;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Innlogging er ikke satt opp ennå." };
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !isAdminEmail(data.user?.email)) {
    if (data.session) await supabase.auth.signOut();
    return invalid;
  }
  redirect("/admin");
}

export async function requestPasswordReset(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (!isAdminAuthConfigured()) return { error: "Innlogging er ikke satt opp ennå." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Skriv inn en gyldig e-postadresse." };

  // Only addresses with access get a link; the answer is the same either way.
  if (isAdminEmail(email)) {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { error: "Innlogging er ikke satt opp ennå." };
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${await requestOrigin()}/auth/callback?next=/auth/reset-password`,
    });
    if (error) {
      console.error("[admin password reset]", error.code);
      return { error: "Kunne ikke sende e-posten. Prøv igjen om litt." };
    }
  }
  return { sentTo: email };
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase?.auth.signOut();
  redirect("/admin/login");
}
