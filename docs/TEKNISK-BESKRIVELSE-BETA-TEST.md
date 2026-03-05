# Teknisk beskrivelse – Utleggssystem (aparent-expenses)

Dette dokumentet beskriver applikasjonen teknisk slik at en LLM eller testleder kan lage en beta-test-brief. Språk: norsk (brukergrensesnitt og beskrivelser).

---

## 1. Formål og brukergruppe

**Formål:** Webapp for å samle inn og sende utlegg (kvitteringer) fra produsenter/freelancere til administrasjon. Brukeren lastet opp kvitteringer, fyller ut metadata, gjennomgår og sender inn. Systemet genererer en samlet PDF og sender den på e-post til admin.

**Brukergruppe:** Personer som har utlegg knyttet til produksjon (f.eks. film/TV). Appen er tilpasset både desktop og mobil (responsive), inkl. PWA-lignende opplevelse med eget app-ikon på mobil.

---

## 2. Teknisk stack

- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS 4
- **Backend:** Next.js API-ruter (serverless), Prisma, PostgreSQL
- **Filer:** Vercel Blob (opplasting og lagring av kvitteringsfiler)
- **AI:** OpenAI GPT-4o (Vision for bilder, Responses API/Files API for PDF) – valgfritt; ved manglende API-nøkkel brukes stub-data
- **PDF:** Puppeteer + @sparticuz/chromium-min (HTML→PDF), pdf-lib (sammenstilling), Inter som font i PDF
- **E-post:** Resend (ved innsending)
- **Deploy:** Vercel (typisk)

**Miljøvariabler som påvirker oppførsel:**  
`OPENAI_API_KEY`, `ADMIN_EMAIL`, `RESEND_API_KEY`, `DATABASE_URL`, `VERCEL_URL` / `NEXT_PUBLIC_APP_URL`

---

## 3. Brukerreise og sider

### 3.1 Oppstart

- **`/`** – Omdirigerer til `/new`
- **`GET /new`** – Oppretter en ny submission med et unikt, sikker `accessToken` (base64url, 32 bytes), lagrer i DB, og redirecter til **`/s/[token]`**

Brukeren har nå en personlig, delbar lenke. Det finnes ingen egen innlogging; tilgang styres utelukkende av token i URL.

### 3.2 Opplasting (DRAFT) – `/s/[token]`

- **Side:** `/s/[token]` (page.tsx + UploadStep)
- **Tilstand:** `Submission.status === "DRAFT"`
- **Innhold:**
  - Bakgrunnsbilde (tilfeldig av flere bilder)
  - Logo, tittel «Last opp dine kvitteringer», kort forklaringstekst
  - **UploadStep:** Dra-og-slipp eller knapp for å velge filer (bilder eller PDF). På mobil vises ikke teksten om «dra filer hit» (kun knapp)
  - Hver fil lastes til Vercel Blob via klient; deretter kalles API for å registrere kvitteringen på submission
  - Liste over lastede filer: filnavn (trunkert på én linje ved langt navn), uten filtype/størrelse på mobil for å spare plass
- **Navigasjon:** Når brukeren har lastet opp minst én kvittering og trykker «Opplast» (eller tilsvarende), kalles API som:
  - Analyserer alle kvitteringer (AI + smart comment-flagg)
  - Setter submission til **REVIEW**
  - Omdirigerer/viser lenke til gjennomgang

Analysen (per kvittering): bilde → GPT-4o Vision; PDF → OpenAI Files API + Responses API. Resultat: kort beskrivelse (`extractedSummary`), beløp i øre (`extractedTotalCents`), valuta. Ved mat/drikke eller transport detekteres «smart comment»-flagg (MEAL, TRANSPORT) med forslag til kommentar.

### 3.3 Gjennomgang og innsending (REVIEW) – `/s/[token]/review`

- **Side:** `/s/[token]/review` (ReviewEditor)
- **Tilstand:** `Submission.status === "REVIEW"`
- **Header (mobil):** Logo sentrert øverst, deretter tittel «Gjennomgang og innsending» på én linje under med større avstand
- **Skjemafelter (metadata):**
  - Navn
  - Prosjektnummer (nummerfelt på mobil)
  - Prosjekt
  - Arbeidsdato (datovelger)
  - Prod.penger (produksjonskontant; nummerfelt på mobil)
  - **Kontonummer** – **påkrevd** før innsending; må være nøyaktig 11 sifre (blanke fjernes, kun sifre teller)
- **Kvitteringsliste:**
  - Desktop: tabell-lignende grid (nr, beskrivelse, beløp, valuta, handlinger)
  - Mobil: kortvisning – beskrivelse på egen linje, evt. «Mat/drikke»-tag på egen linje under, deretter beløp + NOK + «Vis bilag» + slett-ikon på én linje; «Legg til kommentar» under
- Per kvittering: redigerbar beskrivelse, redigerbart beløp (øre), valuta vist, «Vis bilag» (åpner forhåndsvisning), slett, og valgfri kommentar. Smart comment-forslag (f.eks. catering) kan vises og avvises (dismiss).
- **Oppsummering:** Total sum vises alltid på én linje (mobil: whitespace-nowrap e.l.)
- **Handlinger:**
  - **Eksporter PDF** – Genererer samme samlede PDF som ved innsending (oppsummering + kvitteringssider), lastes ned uten å sende e-post eller endre status. Brukes til testing og egen kopi.
  - **Send inn** – Validerer kontonummer (påkrevd, 11 sifre), genererer PDF, laster opp til Blob, sender e-post til `ADMIN_EMAIL` med lenke til PDF, setter status til **SUBMITTED**

Ved valideringsfeil (f.eks. manglende eller ugyldig kontonummer) vises feilmelding og innsending stoppes.

### 3.4 Etter innsending (SUBMITTED)

- **`/s/[token]`** og **`/s/[token]/review`** viser begge en «ferdig»-tilstand:
  - Video-bakgrunn (success)
  - Melding om at utlegget er sendt inn
  - Knapp «Last ned PDF» (henter PDF fra `combinedPdfUrl` / API)
  - Knapp «Nytt oppgjør» (går til `/new`)
  - Kontakt: utlegg@aparent.tv

### 3.5 Andre sider

- **`/s/[token]/preview`** – Popup/visning for forhåndsvisning av en enkelt kvittering (blob), identifisert via token + receiptId i query
- **`/s/[token]/print`** – Printvennlig visning (kan brukes til utskrift av oppsummering/kvitteringer)

---

## 4. API – oversikt

- **`POST /api/receipts`** – Registrer ny kvittering (token, filmetadata fra Blob)
- **`PATCH /api/receipts/[id]`** – Oppdater kvittering (beskrivelse, beløp, kommentar, flags)
- **`DELETE /api/receipts/[id]`** – Slett kvittering
- **`GET /api/submissions/[token]/receipts/[receiptId]/blob`** – Hent blob for forhåndsvisning (sikret via token)
- **`PATCH /api/submission`** – Oppdater submission (navn, prosjektnummer, prosjekt, dato, prod.penger, kontonummer)
- **`POST /api/submissions/[token]/analyze-new`** (eller tilsvarende analyze) – Kjør AI-analyse på alle kvitteringer, sett smart comment-flagg, oppdater status til REVIEW
- **`POST /api/submissions/[token]/batchDismissFlag`** – Avvis smart comment-flagg på kvitteringer
- **`POST /api/submissions/[token]/submit`** – Valider kontonummer, generer PDF, send e-post, sett SUBMITTED
- **`POST /api/submissions/[token]/export-pdf`** – Generer og returner PDF (ingen e-post, ingen statusendring)
- **`GET /api/submissions/[token]/pdf`** – Hent den ferdige kombinierte PDF (etter innsending)

Blob-opplasting skjer fra klient mot Vercel Blob; deretter sendes blobUrl/blobPath til appens API for å knytte kvitteringen til submission.

---

## 5. Datamodell (kort)

- **Submission:** id, accessToken (unikt), status (DRAFT | REVIEW | SUBMITTED), name, projectNumber, project, workDate, productionCash, accountNumber, totalInclVat, combinedPdfUrl, createdAt
- **Receipt:** id, submissionId, originalFileName, mimeType, sizeBytes, blobUrl, blobPath, extractedSummary, extractedTotalCents, extractedCurrency, originalAmountCents, comment, commentFlags (JSON), dismissedCommentFlags (JSON), createdAt

Sletting av submission kan cascade-slette receipts; blob-filer kan leve videre i Vercel Blob inntil ev. opprydding.

---

## 6. PDF-flyt

1. **Oppsummering:** React-komponent (ExpensePdfLayout) rendres til HTML med Inter font, deretter HTML→PDF via Puppeteer (Chromium).
2. **Kvitteringssider:** Hver kvittering hentes som blob; bilder/PDF konverteres til PDF-sider (ev. ved bruk av pdf-lib / bilde-embedding).
3. **Kombinert PDF:** Oppsummerings-PDF + alle kvitteringssider slås sammen til én fil, lastes opp til Blob, og URL lagres i `Submission.combinedPdfUrl`. Ved export-pdf returneres samme fil som nedlasting uten å lagre eller sende e-post.

Maks PDF-størrelse (ved submit) er begrenset (f.eks. 10 MB); ved overskridelse returneres feil.

---

## 7. Mobilspesifikke detaljer

- Responsive breakpoints (Tailwind): mobil først, `md:` for desktop
- Kontonummer: påkrevd, 11 sifre
- Prosjektnummer og Prod.penger: `inputMode="numeric"`, type number, spinner skjult med CSS
- Kvitteringsliste: kort med beskrivelse, tag (Mat/drikke), beløp + ikoner på egen linje; «Legg til kommentar» under
- Footer: mindre tekst, sentrert på mobil; «INSTAGRAM» skjult på mobil
- Drag-and-drop-tekst skjult på mobil
- App-ikon: apple touch icon peker på `/phone_home.png`
- Datovelger: sørg for at feltet ikke er for bredt så velgeren er trykkbar på mobil

---

## 8. Feil- og grensetilfeller

- **Ingen OPENAI_API_KEY:** Kvitteringer får stub-beskrivelse («Kvittering») og null beløp; bruker kan manuelt fylle inn
- **Manglende kontonummer ved Send inn:** 400 med melding «Kontonummer er påkrevd»
- **Kontonummer ≠ 11 sifre:** 400 «Kontonummer må være 11 sifre»
- **Submission ikke i REVIEW ved submit:** 400
- **ADMIN_EMAIL eller RESEND ikke satt:** 500 ved innsending
- **PDF for stor:** 400/413 etter konfigurert grense
- **Ukjent token:** 404 på sider og relevante API-kall

---

## 9. Anbefalt fokus for beta-test-brief

- **Smoke:** Opprett nytt oppgjør (/new), last opp én eller flere kvitteringer (bilde + PDF), gå til gjennomgang, fyll ut alle felt inkl. kontonummer (11 sifre), eksporter PDF, send inn, sjekk e-post og nedlasting av PDF.
- **Mobil:** Samme flyt på mobil; sjekk layout (kvitteringskort, total på én linje, footer, header på review), nummerfelt, datovelger, at «Vis bilag» og slett er tilgjengelige.
- **Validering:** Forsøk innsending uten kontonummer, med 10 sifre, med bokstaver – forvent tydelige feilmeldinger.
- **Grenser:** Mange kvitteringer, store filer, svært lange filnavn (trunkering).
- **Tilgjengelighet og ytelse:** Lastetid på review ved mange kvitteringer, opplevelse ved treg nettverk, lesbarhet og kontrast (mørk tema).

---

*Dokumentet er basert på kodebase aparent-expenses og kan oppdateres ved endringer i funksjonalitet eller arkitektur.*
