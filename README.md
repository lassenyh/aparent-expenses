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
| `PUPPETEER_EXECUTABLE_PATH` | Valgfri lokal Chrome til PDF |
| `NEXT_DIST_DIR` | Valgfri separat Next-buildmappe for parallell testing |

## Gjeldende brukerflyt

Appens opprinnelige grensesnitt og brukerflyt fra `4635111` er gjenopprettet. Last opp bilag, velg «Gå videre», kontroller og korriger felter i den opprinnelige gjennomgangstabellen, forhåndsvis og bekreft innsending. Bekreftelsessiden har den opprinnelige videobakgrunnen.

Ytelsesforbedringer beholdes uten ekstra steg: komprimerte bakgrunner, to samtidige analyser, gjenbrukt databasepool og lokal PDF-styling med samme opprinnelige utforming. Analyse bruker GPT-4o med strukturert uthenting. Valutaomregning følger de opprinnelige `EXCHANGE_RATE_*`-innstillingene og standardratene.

Se [gjenopprettingsrapporten](docs/ui-restoration-2026-09-19.md) for avgrensning og tester. Den tidligere implementasjonsrapporten er historisk; nye arbeidsflyter der er reversert. Bakgrunnsjobber, e-postwebhook og nye kontroll-/organiseringssider er ikke aktive i denne versjonen.

## Kontroll

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Bruk kun syntetiske data ved lokal testing. `.env.development.local` kan deaktivere e-post med `RESEND_API_KEY=`. Eksisterende produksjonsdata endres ikke av oppstart av dev-serveren.
