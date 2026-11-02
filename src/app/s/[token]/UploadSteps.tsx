export const UPLOAD_INTRO_SEEN_KEY = "aparent-upload-intro-seen";

/**
 * How a claim is sent in, in three steps. Shown in the intro before the first upload, and on the
 * project link's start page, which counts as having seen the intro.
 */
export function UploadSteps({ projectFilled = false }: { projectFilled?: boolean }) {
  return (
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
          <strong className="font-semibold">Kontroller og send inn.</strong>{" "}
          {projectFilled ? "Fyll inn navn og kontonummer" : "Fyll inn person- og prosjektinfo"}, sjekk beløp og
          beskrivelse på hver kvittering, og send utlegget til produsenten.
        </span>
      </li>
    </ol>
  );
}
