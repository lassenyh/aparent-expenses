"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LanguageSwitch, T, useLanguage } from "./LanguageProvider";

/** Top bar shared by the app's pages: the logo, optionally a link, and a step label. */
export function AppHeader({ logoHref, step }: { logoHref?: string; step?: string }) {
  const { t } = useLanguage();
  const pathname = usePathname();
  const logo = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo.png" alt="Aparent" className="logo-img h-[30px] w-auto shrink-0" />
  );
  return (
    <header className="flex items-center justify-between gap-4 px-4 py-4 md:px-8">
      {logoHref ? (
        <Link
          href={logoHref}
          aria-label={t("Til opplasting")}
          className="shrink-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-ground"
        >
          {logo}
        </Link>
      ) : (
        logo
      )}
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-1">
        {step && <span className="whitespace-nowrap text-[13px] text-muted"><T>{step}</T></span>}
        {!pathname.startsWith("/admin") && !pathname.startsWith("/auth") && <LanguageSwitch />}
      </div>
    </header>
  );
}
