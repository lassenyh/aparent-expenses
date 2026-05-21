import Link from "next/link";
import { isAdminSubmitterConfigured } from "@/lib/adminDefaults";

export default function AdminPage() {
  const configured = isAdminSubmitterConfigured();

  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-950 text-white p-6">
      <div className="max-w-lg text-center space-y-6">
        <h1 className="text-2xl font-semibold">Admin – utlegg</h1>
        <p className="text-sm text-neutral-400 leading-relaxed">
          Samme flyt som vanlig innsending, men navn og kontonummer er forhåndsutfylt
          fra miljøvariabler.
        </p>
        {configured ? (
          <Link
            href="/admin/new"
            className="inline-block rounded-lg bg-green-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-600"
          >
            Start nytt utlegg
          </Link>
        ) : (
          <p className="text-sm text-amber-300/90">
            Sett <code className="text-amber-100">ADMIN_SUBMITTER_NAME</code> og{" "}
            <code className="text-amber-100">ADMIN_SUBMITTER_ACCOUNT</code> (11 sifre) i
            .env eller Vercel.
          </p>
        )}
        <p className="text-xs text-neutral-500">
          <Link href="/new" className="underline hover:text-neutral-300">
            Vanlig innsending (uten forhåndsutfylling)
          </Link>
        </p>
      </div>
    </main>
  );
}
