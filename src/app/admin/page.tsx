import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { isAdminSubmitterConfigured } from "@/lib/adminDefaults";

export default function AdminPage() {
  const configured = isAdminSubmitterConfigured();

  return (
    <main className="flex flex-col">
      <AppHeader />
      <div className="px-4 pb-12 pt-2 md:px-8 md:pt-6">
        <section className="mx-auto grid w-full max-w-[520px] gap-5 rounded-lg border border-line bg-surface p-7">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">Admin – utlegg</h1>
          <p className="text-sm leading-relaxed text-muted">
            Samme flyt som vanlig innsending, men navn og kontonummer er forhåndsutfylt
            fra miljøvariabler. E-post sendes til{" "}
            <span className="text-ink">aparentas@ebilag.com</span>.
          </p>
          {configured ? (
            <div>
              <Link
                href="/admin/new"
                className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover"
              >
                Start nytt utlegg
              </Link>
            </div>
          ) : (
            <p className="rounded-lg border border-warn-line bg-warn-bg px-4 py-3 text-sm text-warn-ink">
              Sett <code className="font-mono text-[12.5px]">ADMIN_SUBMITTER_NAME</code> og{" "}
              <code className="font-mono text-[12.5px]">ADMIN_SUBMITTER_ACCOUNT</code> (11 sifre) i
              .env eller Vercel.
            </p>
          )}
          <p className="text-[13px]">
            <Link href="/new" className="text-muted underline underline-offset-2 hover:text-ink">
              Vanlig innsending (uten forhåndsutfylling)
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
