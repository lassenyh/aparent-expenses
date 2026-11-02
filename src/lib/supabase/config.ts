/**
 * Supabase is used only to sign admins in; projects and claims stay in the app's own database.
 * The names match what Supabase's Vercel integration sets.
 */
export function supabaseConfig(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return url && key ? { url, key } : null;
}

/** An empty allowlist must be reported as missing setup, not a successfully sent link. */
export function isAdminAuthConfigured(): boolean {
  return !!supabaseConfig() && !!process.env.ADMIN_EMAILS?.split(",").some((email) => email.trim());
}
