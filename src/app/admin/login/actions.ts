"use server";

import { redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/adminAuth";
import { requestOrigin } from "@/lib/requestOrigin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LoginState = { sentTo?: string; error?: string };

export async function sendLoginLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Skriv inn en gyldig e-postadresse." };

  // Only addresses with access get a link; the answer is the same either way.
  if (isAdminEmail(email)) {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { error: "Innlogging er ikke satt opp ennå." };
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${await requestOrigin()}/auth/callback` },
    });
    if (error) {
      console.error("[admin login]", error);
      return { error: "Kunne ikke sende innloggingslenken. Prøv igjen om litt." };
    }
  }
  return { sentTo: email };
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase?.auth.signOut();
  redirect("/admin/login");
}
