# Aparent utlegg

Next.js 16.3 / React 19 / Prisma 7.10 / PostgreSQL. Kvitteringer lagres privat i Vercel Blob, analyseres med OpenAI og sendes som samlet PDF via Resend.

## Lokal kjøring

```sh
npm ci # Node.js >= 22.12
npx prisma generate
npm run db:migrate:dev
npm run dev
```

Bruk en egen database eller et eget skjema til utvikling. Migrering endrer databasen i `DATABASE_URL`; kontroller målet før kommandoen kjøres. Migrasjonen `20260919000000_reliable_receipts` er additiv og nødvendig før den nye appversjonen tas i bruk. Den bevarer tidligere beløp og merker historisk e-poststatus som ukjent. Den endrer ikke eksisterende tilgangslenkers levetid.

Sett `DATABASE_SCHEMA=expenses_development` i `.env.development.local` før utviklingsmigrering. `npm run db:migrate:dev` bruker utviklingsmiljøets filer og samme skjema som dev-serveren. Sett også `RESEND_API_KEY=` der for å deaktivere ekte e-post lokalt. Start dev-serveren på nytt etter endring av databaseskjema. Produksjon migreres separat med `npx prisma migrate deploy`.

Konfigurer servervariabler lokalt i `.env.local` eller i driftsmiljøet. Ikke legg hemmeligheter i Git eller `NEXT_PUBLIC_*`:

| Variabel | Bruk |
|---|---|
| `DATABASE_URL` | PostgreSQL, påkrevd |
| `DATABASE_SCHEMA` | Valgfritt separat skjema; standard `public`. Prisma-konfigurasjonen bruker samme verdi ved migrering. |
| `BLOB_READ_WRITE_TOKEN` | Privat Vercel Blob-lagring |
| `OPENAI_API_KEY` | Kvitteringsanalyse; manglende nøkkel gir synlig feil og manuell utfylling |
| `RECEIPT_MODEL` | Standard `gpt-4o`. Bytt først etter sammenlignbar test. |
| `ADMIN_EMAIL` | Regnskapsmottaker for vanlige utlegg, bindes ved opprettelse |
| `RESEND_API_KEY`, `RESEND_FROM` | E-post; bruk verifisert avsender i drift |
| `ADMIN_SUBMITTER_NAME`, `ADMIN_SUBMITTER_ACCOUNT`, `ADMIN_SUBMITTER_EMAIL` | Admin-forhåndsutfylling og mottaker. Opplysningene bindes til hvert oppgjør. |
| `NEXT_DIST_DIR` | Valgfri separat Next-buildmappe for parallell testing |

## Gjeldende brukerflyt

Grensesnittet følger designretningen Hovedbok: nøytrale flater uten bakgrunnsbilder, lys og mørk modus etter systeminnstillingen, og gult bare på beløpet til utbetaling og på lastestolper. Fargene er definert som tokens i `src/app/globals.css`. Last opp bilag; hvert bilag analyseres i bakgrunnen så snart det er lastet opp. «Gå videre» åpner person- og prosjektinfo, og når den er fylt ut venter appen på analysene som gjenstår før gjennomgangen åpnes. Der vises infoen som et sammendrag med «Endre». En lang kvittering kan bestå av flere bilder: på opplastingen velges bildene og slås sammen (eller «Legg til bilde» på en rad), og i gjennomgangen ligger «Legg til bilde», «Slå sammen med …» og «Del opp» under «Flere valg». Bildene analyseres sammen og blir hver sin side i PDF-en. Migrasjonen `20261102120000_receipt_parts` er additiv og må kjøres før denne versjonen tas i bruk. Kontroller og korriger felter i den opprinnelige gjennomgangstabellen, forhåndsvis og bekreft innsending. Bekreftelsessiden viser en oppsummering av oppgjøret; videobakgrunnen er skjult, men filen ligger fortsatt i `public/`.

Ytelsesforbedringer beholdes uten ekstra steg: komprimerte bakgrunner, fire samtidige analyser, HEIC dekodet direkte til sharp uten mellomliggende JPEG, gjenbrukt databasepool og lokal PDF-styling med samme opprinnelige utforming. Analyse bruker GPT-4o med strukturert uthenting av bare feltene appen lagrer (ikke varelinjer og MVA-detaljer). Et tomt eller avkortet svar prøves én gang til. Valutaomregning følger de opprinnelige `EXCHANGE_RATE_*`-innstillingene og standardratene.

Sammenlign modeller og innstillinger med `npm run benchmark:fixtures` (syntetiske kvitteringer med fasit) og `npm run benchmark:receipts -- <manifest.json> --variants ...`. Bruk bare syntetiske eller godkjente kvitteringer; filene sendes til OpenAI.

Se [gjenopprettingsrapporten](docs/ui-restoration-2026-09-19.md) for avgrensning og tester. Den tidligere implementasjonsrapporten er historisk; nye arbeidsflyter der er reversert. Bakgrunnsjobber, e-postwebhook og nye kontroll-/organiseringssider er ikke aktive i denne versjonen.

## Kontroll

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Bruk kun syntetiske data ved lokal testing. `.env.development.local` kan deaktivere e-post med `RESEND_API_KEY=`. Eksisterende produksjonsdata endres ikke av oppstart av dev-serveren.
