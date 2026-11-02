"use client";

import { T, useLanguage } from "@/components/LanguageProvider";
export const UPLOAD_INTRO_SEEN_KEY = "aparent-upload-intro-seen";

/**
 * How a claim is sent in, in three steps. Shown in the intro before the first upload, and on the
 * project link's start page, which counts as having seen the intro.
 */
export function UploadSteps({ projectFilled = false }: { projectFilled?: boolean }) {
  const { t } = useLanguage();
  return (
    <ol className="space-y-3.5 text-sm text-ink">
      <li className="grid grid-cols-[24px_minmax(0,1fr)] gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-raised text-[12px] font-semibold text-muted">1</span>
        <span>
          <strong className="font-semibold"><T>{"Last opp kvitteringene."}</T></strong><T>{"Bilder fra mobilen eller PDF. Vi leser dem med en gang."}</T></span>
      </li>
      <li className="grid grid-cols-[24px_minmax(0,1fr)] gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-raised text-[12px] font-semibold text-muted">2</span>
        <span>
          <strong className="font-semibold"><T>{"Lang kvittering?"}</T></strong><T>{"Ta flere bilder. Kryss av bildene som hører sammen og velg «Slå sammen til én kvittering», eller trykk «Legg til bilde» på kvitteringen."}</T></span>
      </li>
      <li className="grid grid-cols-[24px_minmax(0,1fr)] gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-raised text-[12px] font-semibold text-muted">3</span>
        <span>
          <strong className="font-semibold"><T>{"Kontroller og send inn."}</T></strong>{t(" ")}
          {t(projectFilled ? "Fyll inn navn og kontonummer" : "Fyll inn person- og prosjektinfo")}<T>{", sjekk beløp og beskrivelse på hver kvittering, og send utlegget til produsenten."}</T></span>
      </li>
    </ol>
  );
}
