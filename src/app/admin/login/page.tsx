import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { getAdminEmail } from "@/lib/adminAuth";
import { supabaseConfig } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";
import { signOut } from "./actions";

export const metadata = { title: "Logg inn – Aparent Utlegg" };

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ feil?: string }>;
}) {
  if (await getAdminEmail()) redirect("/admin");
  const { feil } = await searchParams;

  // Signed in with an address that is not on the list.
  const supabase = await createSupabaseServerClient();
  const claims = supabase ? (await supabase.auth.getClaims()).data?.claims : null;
  const otherEmail = typeof claims?.email === "string" ? claims.email : null;

  return (
    <main className="flex flex-col">
      <AppHeader />
      <div className="px-4 pb-12 pt-2 md:px-8 md:pt-6">
        <section className="mx-auto grid w-full max-w-[400px] gap-5 rounded-lg border border-line bg-surface p-7">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">Admin</h1>
            <p className="text-sm leading-relaxed text-muted">Logg inn for å opprette prosjekter og lenker.</p>
          </div>
          {!supabaseConfig() ? (
            <p className="rounded-lg border border-warn-line bg-warn-bg px-4 py-3 text-sm text-warn-ink">
              Innlogging er ikke satt opp. Sett <code className="font-mono text-[12.5px]">NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
              <code className="font-mono text-[12.5px]">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> og{" "}
              <code className="font-mono text-[12.5px]">ADMIN_EMAILS</code>.
            </p>
          ) : otherEmail ? (
            <div className="space-y-3">
              <p className="text-sm leading-relaxed text-muted">
                Du er logget inn som <span className="text-ink">{otherEmail}</span>, som ikke har tilgang.
              </p>
              <form action={signOut}>
                <button
                  type="submit"
                  className="h-9 rounded-md bg-secondary px-4 text-sm font-medium text-ink hover:bg-secondary-hover"
                >
                  Logg ut
                </button>
              </form>
            </div>
          ) : (
            <>
              {feil === "lenke" && (
                <p className="text-sm text-neg">Lenken er utløpt eller allerede brukt. Be om en ny.</p>
              )}
              <LoginForm />
            </>
          )}
        </section>
      </div>
    </main>
  );
}
