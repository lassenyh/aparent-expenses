import Link from "next/link";

/** Top bar shared by the app's pages: the logo, optionally a link, and a step label. */
export function AppHeader({ logoHref, step }: { logoHref?: string; step?: string }) {
  const logo = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo.png" alt="Aparent" className="logo-img h-[30px] w-auto" />
  );
  return (
    <header className="flex items-center justify-between gap-4 px-4 py-4 md:px-8">
      {logoHref ? (
        <Link
          href={logoHref}
          aria-label="Til opplasting"
          className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-ground"
        >
          {logo}
        </Link>
      ) : (
        logo
      )}
      {step && <span className="text-[13px] text-muted">{step}</span>}
    </header>
  );
}
