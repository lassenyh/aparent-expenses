"use client";

import { useEffect, useRef } from "react";

export const UPLOAD_INTRO_SEEN_KEY = "aparent-upload-intro-seen";

/** Short introduction shown before the first upload on this device, and again from «Slik fungerer det». */
export function UploadIntro({ onClose }: { onClose: () => void }) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    buttonRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-scrim p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-intro-title"
    >
      <div className="my-auto w-full max-w-md space-y-5 rounded-xl border border-line bg-surface p-6 shadow-2xl">
        <div className="space-y-1">
          <h2 id="upload-intro-title" className="text-lg font-semibold tracking-[-0.01em] text-ink">
            Slik sender du inn utlegg
          </h2>
          <p className="text-sm text-muted">Det tar et par minutter, og vi fyller ut skjemaet for deg.</p>
        </div>
        <ol className="space-y-3.5 text-sm text-ink">
          <li className="grid grid-cols-[24px_minmax(0,1fr)] gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-raised text-[12px] font-semibold text-muted">1</span>
            <span>
              <strong className="font-semibold">Last opp kvitteringene.</strong> Bilder fra mobilen eller PDF. Vi leser dem
              med en gang.
            </span>
          </li>
          <li className="grid grid-cols-[24px_minmax(0,1fr)] gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-raised text-[12px] font-semibold text-muted">2</span>
            <span>
              <strong className="font-semibold">Lang kvittering?</strong> Ta flere bilder. Kryss av bildene som hører sammen
              og velg «Slå sammen til én kvittering», eller trykk «Legg til bilde» på kvitteringen.
            </span>
          </li>
          <li className="grid grid-cols-[24px_minmax(0,1fr)] gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-raised text-[12px] font-semibold text-muted">3</span>
            <span>
              <strong className="font-semibold">Kontroller og send inn.</strong> Fyll inn person- og prosjektinfo, sjekk
              beløp og beskrivelse på hver kvittering, og send utlegget til produsenten.
            </span>
          </li>
        </ol>
        <div className="flex justify-end">
          <button
            ref={buttonRef}
            type="button"
            onClick={onClose}
            className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover"
          >
            Kom i gang
          </button>
        </div>
      </div>
    </div>
  );
}
