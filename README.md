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
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Innlogging til admin (Supabase Auth, e-post og passord). Prosjekter og utlegg ligger fortsatt i egen database. |
| `ADMIN_EMAILS` | Kommaseparert liste over e-postadresser som slipper inn i `/admin` |
| `NEXT_DIST_DIR` | Valgfri separat Next-buildmappe for parallell testing |

## Innlogging i Vercel-forhåndsvisningen

`.env.development.local` brukes bare av lokal utvikling. Sett `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` og `ADMIN_EMAILS` i Vercel for Preview-miljøet, eventuelt avgrenset til branchen `project-links`. Administratorlisten er kommaseparert. Tom liste deaktiverer innlogging.

Legg forhåndsvisningens adresse med `/auth/callback` til under Supabase → Authentication → URL Configuration → Redirect URLs. Tillat også `/auth/callback?next=/auth/reset-password` for tilbakestilling. Opprett administratorbrukeren i Supabase på forhånd med e-post og passord; appen har ingen åpen registrering. «Glemt passord?» sender en tilbakestillingslenke til eksisterende administratorer. Bruk samme vertsnavn og nettleser når tilbakestillingen startes og e-postlenken åpnes: PKCE-flyten bruker en informasjonskapsel fra forespørselen. Nytt passord må ha minst 12 tegn. Standard e-postmal med `{{ .ConfirmationURL }}` støttes. Supabase må også kunne sende e-post til administratoren; kontroller SMTP-oppsettet hvis lenken ikke kommer frem.

Opprett en ny Preview-deployment etter at Vercel-variablene er lagret. Eksisterende deployments får ikke nye variabler automatisk. Test `/admin/login` med e-post og passord, og kontroller at `/admin` viser prosjektlisten. Test også «Glemt passord?» og at lenken åpner skjemaet for nytt passord. Produksjonsmiljøet konfigureres separat.

## Utenlandsk konto og språkvalg

Nye utlegg starter med norsk konto og krever 11 sifre. «International account» viser IBAN, BIC/SWIFT, bankland og kontoeiers adresse, og bytter brukergrensesnittet til engelsk. Norsk/English kan velges på siden og i personinfo-popupen; valget huskes i nettleseren. Oversettelsen gjelder innsenderflyten; brukerens egne beskrivelser og prosjektdata oversettes ikke. PDF og regnskapsmeldingen beholder norske etiketter, med nøytral «Til utbetaling» / «Til tilbakebetaling».

Utenlandsk konto krever et IBAN-land, gyldig IBAN med kontrollsiffer, BIC som passer banklandet, og full adresse. Beløp og oppgjør er fortsatt i NOK. Land uten IBAN støttes ikke av dette skjemaet. Opplysninger normaliseres og valideres også på serveren, og lagres i `Submission.bankDetails`. Norsk konto bruker fortsatt `accountNumber`. Bytte til norsk konto nullstiller utenlandske opplysninger når skjemaet lagres.

Den additive migreringen `20261103100000_international_accounts` legger til ett valgfritt JSON-felt. Kjør den i riktig databaseskjema før den nye appversjonen brukes. Eksisterende utlegg og tidligere PDF-er endres ikke.

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
