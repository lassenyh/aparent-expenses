> Historisk implementasjonsrapport. UI- og flytendringene nedenfor er senere reversert etter brukerens ønske. Se `ui-restoration-2026-09-19.md` for gjeldende avgrensning.

# Gjennomførte forbedringer – 19.09.2026

Endringene er implementert og testet lokalt med syntetiske data i et separat PostgreSQL-skjema. Eksisterende produksjonstabeller og utlegg er ikke migrert eller endret. Ingen e-post er sendt.

| Prioritet fra gjennomgangen | Gjennomført |
|---|---|
| Tilgang og eierskap | Påkrevd token ved sletting, transaksjoner og eierskapskontroll ved kladdlagring; innsendingsruten bruker kun lagrede bilag. Admin autentiseres i både proxy, side og opprettelsesrute. Mottaker bindes til oppgjøret. Gamle omveier for innsending er stengt. |
| Varige kladder | Felles automatisk lagring med synlig status, retry, heltallsøre, versjonskonflikt og lokal sikkerhetskopi. Nye filer og analyser overskriver ikke lagrede rettelser. |
| Pålitelig analyse | Strengt strukturert svar, eksplisitt usikkerhet/feil, manuell kontroll per bilag, retry og uforanderlige originalforslag med forsøks-ID. Returbillett endrer ikke beløpets fortegn. |
| Innsending og e-post | Servervalidering og kladdlås; PDF og varig e-postjobb lagres før transport. Idempotens, retry, separate statuser, signert leveringswebhook og manuell oppfølging utenfor leverandørens dedupliseringsvindu. |
| Mobil og lasting | 44px-knapper, fleksibelt skjema uten mobiloverløp, norsk sidespråk, ca. 420 KB WebP-bakgrunner totalt, ingen automatisk 39 MB-video og ingen eksterne skrifter i appskallet. |
| Analysehastighet | Maksimalt to samtidige analyser, lagrede statuser og utløpende kjøreleaser. Gjenopptak i appen eller autentisert vedlikeholdsjobb. Benchmarkverktøy for 1/5/10 bilag. |
| Flere sider / duplikater | Gruppér bilder/sider til ett bilag, del PDF per side, bevar og vis originalkilder. SHA-256-varsel om duplikater. |
| Flere kvitteringsfelt | Butikk, separat kjøpsdato, valuta, originalbeløp, NOK-beløp, mva. og varelinjer kan kontrolleres og korrigeres i egne felt. Lesbar analysehistorikk. |
| Personvern og opprydding | OpenAI `store:false`, sletting av midlertidige PDF-er og én times utløp som reserve. Varig Blob-oppryddingskø, utløp for nye lenker, valgfri sletting av gamle utløpte kladder og personvernside. Innsendte/historiske oppgjør slettes ikke automatisk. |
| Vedlikehold | Oppdatert README, regresjonstester, fjernet gamle editorer/innsendingsveier/valutakurskode og ubrukt PDF-parser. Next.js 16.3.5, Prisma 7.10, Puppeteer 25.11, sharp 0.35.4 og øvrige kompatible sikkerhetsoppdateringer. |

PDF-eksporten bruker lokale stiler og innebygd logo, uten eksterne CDN-er. Kjøpsdato vises per bilag. Det endelige syntetiske PDF-utkastet er visuelt kontrollert; oppsummering og fem bilag gir seks lesbare sider.

## Verifisering

- 12 automatiserte tester består: HEIC/bilde/PDF, norske beløp, returbillett/refusjon, uleselig/multikvittering, eierskap, HTML-escaping, utløp og e-postretry med erstattet transport.
- TypeScript, ESLint og produksjonsbygg består sluttkjøringen (Next.js 16.3.5).
- Avhengighetskontroll etter oppdatering: **0 kjente sårbarheter**. To målrettede overrides retter indirekte avhengigheter i Prisma-verktøyet; ingen overgang til Prisma 8 RC.
- API-regresjon: samtidig lagring gir 200 og 409; sletting uten eller med feil token gir 403; forfalsket admin-cookie gir 401; fremmede bilag/opplastinger avvises; gammel innsendingsrute gir 410.
- Migrasjonene er kjørt på et isolert skjema med kunstig historisk oppgjør. Beløp, historisk lenke og innsendingsstatus bevares. Hele kontrolltransaksjonen rulles tilbake.
- Subagent brukte appen i Chrome/Puppeteer: kladd/refresh, nettverksfeil/retry, ugyldig fil, nye bilag, duplikater, privat originalvisning, PDF-deling/sammenslåing, PDF-nedlasting og mobil 320/390. Funksjonstestene ble gjentatt etter bibliotekoppdateringen.
- Mva. 9,25 og korrigert varenavn overlever ny lasting, mens originalhistorikken fortsatt viser mva. 8 og «Kaffe». Åpne detaljfelter gir ikke overløp ved 320 px.
- Samme svært uskarpe testbilde som tidligere ga oppdiktet returbeløp, gir nå en synlig uleselig-advarsel uten beløp. Dette er ett testtilfelle, ikke en generell kvalitetsrate.

Råresultater, nettleserrapport, skjermbilder og PDF finnes lokalt under `output/implementation-2026-09-19/` (ignorert av Git).

## Målinger

Modellmåling med én syntetisk kvittering gjentatt, GPT-4o, Node 24.14, samtidighet 2. Måler modellbehandlingen inklusive lokal bildelesing/normalisering, **ikke** full brukerflyt med Blob og database:

| Antall bilag | Tid |
|---|---:|
| 1 | 2,907 s |
| 5 | 7,485 s |
| 10 | 9,581 s |

Alle 16 forsøk traff forventet total, valuta, dato og lesbarhet for denne kvitteringen. Ingen alternativ modell er målt i denne implementeringen. GPT-4o beholdes; et bytte skal begrunnes med samme testkorpus og gjeldende kostnader.

## Før produksjonsbruk

1. Kjør den additive migrasjonen `20260919000000_reliable_receipts` mot riktig database før den nye appversjonen publiseres. Oppgrader runtime til Node >=22.12.
2. Sett eget `ADMIN_ACCESS_PASSWORD`, kontroller mottakere og Resend-avsender. Ingen hemmeligheter eller produksjonsinnstillinger er endret automatisk.
3. Konfigurer `CRON_SECRET` og en periodisk jobb til `/api/maintenance`, samt Resend-webhook og `RESEND_WEBHOOK_SECRET`. Uten tidsplan fortsetter jobber ved brukerens handlinger; ingen bakgrunnsgaranti er aktivert eksternt.
4. Velg virksomhetens oppbevaringsrutine. Automatisk kladdsletting er av som standard; eldre lenker uten utløp beholdes.

Faktisk sluttinnsending og leveranse av ekte e-post er ikke ende-til-ende-testet. Automatisk godkjenningskontroll avviste subagentens innsendingsforsøk fordi e-postisoleringen ikke var tilstrekkelig verifisert. Handlingen ble stoppet. Feil, retry og deduplisering er testet med erstattet transport; signert webhook er implementert, men ikke koblet til en ekstern leverandørkonto.

PDF-deling skjer per side, ikke per utsnitt innenfor én side. Stort realistisk kvitteringskorpus, fysisk mobilkamera og utrulling på Vercel gjenstår som driftsverifisering.
