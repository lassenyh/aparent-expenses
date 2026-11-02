"use server";

import { redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/adminAuth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { LoginState } from "@/app/admin/login/actions";

export async function updatePassword(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Innlogging er ikke satt opp ennå." };
  // Validate the current session with Auth before changing credentials.
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !isAdminEmail(data.user?.email)) {
    return { error: "Lenken er utløpt eller brukeren mangler tilgang. Be om en ny lenke." };
  }
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  if (password.length < 12) return { error: "Bruk minst 12 tegn i passordet." };
  if (password !== confirmation) return { error: "Passordene er ikke like." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return { error: "Velg et annet passord enn det du har fra før." };
    return { error: "Kunne ikke lagre passordet. Prøv et annet passord, eller be om en ny lenke." };
  }
  redirect("/admin");
}
