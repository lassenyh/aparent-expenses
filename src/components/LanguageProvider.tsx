"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { translate, type Language } from "@/lib/translations";

const LanguageContext = createContext<{ language: Language; setLanguage: (language: Language) => void }>({ language: "nb", setLanguage: () => {} });

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, update] = useState<Language>("nb");
  useEffect(() => {
    let saved = document.cookie.split(";").map(value => value.trim()).find(value => value.startsWith("aparent-language="))?.split("=")[1];
    try { saved = localStorage.getItem("aparent-language") ?? saved; } catch { /* Storage can be disabled. */ }
    const timer = setTimeout(() => {
      if (saved === "en") { update("en"); document.documentElement.lang = "en"; }
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  function setLanguage(next: Language) {
    update(next);
    document.documentElement.lang = next;
    document.cookie = `aparent-language=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    try { localStorage.setItem("aparent-language", next); } catch { /* Keep the choice for this visit. */ }
  }
  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  return { ...context, t: (text: string | null | undefined) => translate(text ?? "", context.language) };
}

export function T({ children }: { children: string }) {
  const { t } = useLanguage();
  return <>{t(children)}</>;
}

export function LanguageSwitch() {
  const { language, setLanguage } = useLanguage();
  return <div className="flex shrink-0 items-center gap-1 text-[13px]" role="group" aria-label="Språk / Language">
    {([['nb', 'Norsk'], ['en', 'English']] as const).map(([code, label]) => <button key={code} type="button" lang={code}
      aria-pressed={language === code} onClick={() => setLanguage(code)}
      className={`rounded-md px-2.5 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${language === code ? "bg-secondary font-medium text-ink" : "text-muted hover:text-ink"}`}>{label}</button>)}
  </div>;
}
