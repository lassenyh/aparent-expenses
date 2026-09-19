# Gjenoppretting av opprinnelig UI – 19. september 2026

Referanse: `4635111` (Fix HEIC receipt export), siste commit før gjennomgangen. Brukeren ba om uendret grensesnitt og brukerflyt, med ytelsesforbedringer beholdt.

## Gjenopprettet

Opplasting, gjennomgangstabell, felter, kommentarer, infomodaler, bekreftelsesmodal, forhåndsvisning, utskriftslayout, adminflyt og bekreftelsesside med original video er hentet fra referansecommit. Opprinnelige tekster, avstander, farger, tilfeldig bakgrunnsvalg og navigasjon er tilbake. API-kontraktene som disse komponentene bruker er også gjenopprettet. Nye sider for organisering, detaljkontroll, analysehistorikk og leveringsstatus er fjernet.

De opprinnelige TSX-komponentene har bare følgende kildeavvik: `.webp` i stedet for `.jpg`, lokal lasting av samme Geist-fontfamilier, og en TypeScript-type i `mapToReceiptRow`. PDF-komponenten er identisk med referansen.

## Beholdt uten nye brukerhandlinger

- Komprimerte varianter av de samme ti bakgrunnsbildene.
- To parallelle kvitteringsanalyser, i samme opprinnelige forespørsel. Hele settet fullføres før gjennomgang åpnes.
- Gjenbruk av databasepool og de additive indeksene.
- PDF uten eksterne CSS-/fontkall: originale Tailwind 3-klasser kompilert lokalt og Inter innebygd. Ingen egen erstatningslayout.
- Oppdaterte runtime-avhengigheter, HEIC-støtte og fungerende separat dev-skjema.
- Strukturert kvitteringsanalyse bak eksisterende felter. Automatisk valutaomregning er gjenopprettet som før.
- Kontroll av eierskap ved endring/sletting av bilag, uten endringer i legitime UI-handlinger.

Den store suksessvideoen er tilbake: å fjerne den var en synlig opplevelsesendring, ikke en akseptabel ytelsesoptimalisering her. Additive databasefelt er ikke slettet; de gjenopprettede sidene bruker ikke de nye arbeidsflytene. Ingen produksjonsmigrering eller e-postsending ble utført.

## Kontroll

- Subagent testet ekte nettleser: opplasting → analyse → gjennomgang → redigering → forhåndsvisning, samt mobil og bekreftelsesside. Original video spiller med mute/loop. Kun syntetiske data i `expenses_development`.
- 390 px uten horisontal overflow. Ved 320 px gjenfinnes den opprinnelige 14 px-overflowen; ingen ny layoutendring for å rette den i denne tilbakeføringen.
- 12 automatiske tester bestått, inkludert fullføring av alle analyser med maks to samtidige og opprinnelig valutaomregning.
- Typekontroll bestått. Lint beholder advarsler for opprinnelige komponentmønstre; ingen feil. Nye React-regler for tilfeldig serverbakgrunn og effektbasert sessionStorage/modal-initialisering er avgrenset til advarsler i de berørte originalfilene.
- Syntetisk PDF: 108145 bytes, lokal Chrome-generering 1514 ms i én kjøring. Ingen eksterne ressurser ved rendering; ikke et generelt ytelsesestimat.

Skjermbilder og nettleserrapport: `output/ui-restore-2026-09-19/`. Sikkerhetskopi av kildekoden før tilbakeføring finnes i samme mappe.
