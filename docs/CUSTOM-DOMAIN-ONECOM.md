# Eget domene for Aparent Utlegg (one.com + Vercel)

Slik kobler du appen til **aparent.tv** via one.com, med appen hostet på Vercel.

---

## 1. Velg adresse

- **Underdomene (anbefalt):** f.eks. **utlegg.aparent.tv** – da kan aparent.tv fortsatt brukes til hovednettside.
- **Hoveddomene:** **aparent.tv** – bare aktuelt hvis utleggsappen skal være hele aparent.tv.

Eksemplet nedenfor bruker **utlegg.aparent.tv**.

---

## 2. Legg til domene i Vercel

**Viktig:** Du må være **inne i prosjektet**, ikke bare på Vercel-hovedside.

1. Gå til [vercel.com/dashboard](https://vercel.com/dashboard).
2. Klikk på **prosjektet** (f.eks. aparent-expenses) slik at du er på prosjektsiden (URL lik noe som `vercel.com/[ditt-brukernavn]/aparent-expenses` eller `vercel.com/[team]/aparent-expenses`).
3. I venstre sidefelt: **Settings** → **Domains**.
4. Skriv inn **utlegg.aparent.tv** (eller valgt adresse) og klikk **Add**.
5. Vercel viser hva du må sette opp i DNS (typisk en **CNAME**-post).

Får du 404 på Domains? Da er du sannsynligvis på dashboard-nivå (oversikt over alle prosjekter). Gå inn i det enkelte prosjekt først, deretter Settings → Domains. Riktig URL er f.eks. `https://vercel.com/lassenyh/aparent-expenses/settings/domains` (erstatt brukernavn/prosjektnavn med dine).

---

## 2b. Domenet er knyttet til en annen Vercel-konto (TXT-verifisering)

Hvis Vercel sier at domenet er knyttet til en annen konto og ber deg legge inn en **TXT-post** på **_vercel.aparent.tv**:

1. **I Vercel:** Noter den **nøyaktige TXT-verdien** Vercel viser (lang streng med bokstaver og tall).
2. **I one.com:**  
   - Gå til **DNS** / **Avansert DNS** for aparent.tv.  
   - Legg til en **TXT**-post:  
     - **Vert / Host / Subdomain:** `_vercel` (noen steder skrives det som `_vercel.aparent.tv`; bruk det som gir posten for `_vercel.aparent.tv`).  
     - **Verdi / Innhold:** lim inn TXT-verdien fra Vercel (uten anførselstegn).  
   - Lagre.
3. Vent 2–5 minutter (opptil 24 timer), så klikk **Verify** i Vercel. Når verifiseringen er grønn, kan du **fjerne TXT-posten** hos one.com hvis du vil.
4. Etter verifisering må du fortsatt ha **CNAME** (eller A) for selve adressen (f.eks. utlegg.aparent.tv) som beskrevet i avsnitt 3 under.

---

## 3. Sett opp DNS hos one.com

1. Logg inn på [one.com](https://www.one.com) → **Domener** → velg **aparent.tv**.
2. Gå til **DNS-innstillinger** / **DNS-records** / **Avansert DNS** (avhengig av one.com sitt grensesnitt).
3. Legg til en ny post:

   **For underdomene (utlegg.aparent.tv):**

   | Type  | Vert / Host / Subdomain | Verdi / Mål |
   |-------|-------------------------|-------------|
   | CNAME | utlegg                  | cname.vercel-dns.com |

   - **Vert/Host:** `utlegg` (uten aparent.tv).
   - **Verdi:** `cname.vercel-dns.com` (dette er Vercel sin vanlige CNAME; bruk gjerne den Vercel viser under Domains).

   **For hoveddomene (aparent.tv):**

   Vercel vil typisk gi deg to **A**-poster med IP-adresser. I one.com legger du til:

   | Type | Vert | Verdi        |
   |------|------|--------------|
   | A    | @    | 76.76.21.21  |
   | A    | @    | 76.76.21.241 |

   (Bruk de IP-adressene Vercel viser under Domains for ditt prosjekt.)

4. Lagre. DNS kan ta fra noen minutter opp til 24–48 timer å oppdatere seg.

---

## 4. Verifiser i Vercel

- Under **Domains** i Vercel skal domenet etter hvert vises som **Valid** / med grønn hake.
- Hvis det står at noe mangler, sjekk at CNAME (eller A) i one.com er nøyaktig som Vercel anbefaler.

---

## 5. HTTPS (SSL)

Vercel ordner automatisk SSL-sertifikat (HTTPS) for domenet når DNS er riktig. Ingen ekstra steg hos one.com.

---

## 6. Miljøvariabler (valgfritt)

Hvis du har `NEXT_PUBLIC_APP_URL` eller lenker i e-post som bygger full URL:

- Sett f.eks. **NEXT_PUBLIC_APP_URL** = `https://utlegg.aparent.tv` i Vercel (**Settings** → **Environment Variables**).
- Da vil lenker i appen/e-post bruke det nye domenet.

---

## Kort sjekkliste

- [ ] Domene lagt til i Vercel (Settings → Domains).
- [ ] CNAME (eller A) satt hos one.com som Vercel viser.
- [ ] Venter på DNS (opp til 24–48 timer).
- [ ] Vercel viser domenet som valid.
- [ ] (Valgfritt) NEXT_PUBLIC_APP_URL satt til `https://utlegg.aparent.tv`.

Etter det er appen tilgjengelig på **https://utlegg.aparent.tv** (eller valgt adresse).
