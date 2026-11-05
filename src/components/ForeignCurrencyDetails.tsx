"use client";
import { useState, useId } from "react";
import { useLanguage } from "./LanguageProvider";
import { readForeignExchange } from "@/lib/foreignExchange";

import type { receiptRowForClient } from "@/lib/receiptRows";
type SavedReceipt = NonNullable<Awaited<ReturnType<typeof receiptRowForClient>>>;
type CurrencyReceipt = { id: string; extractedCurrency: string | null; originalAmountCents: number | null; receiptDate?: string | null; extractedTotalCents: number | null; foreignExchange?: unknown };
export function ForeignCurrencyDetails({ receipt, token, onSaved, disabled }: { receipt: CurrencyReceipt; token: string; onSaved: (value: SavedReceipt) => void; disabled: boolean }) {
  const { t } = useLanguage();
  const id = useId();
  const fx = readForeignExchange(receipt.foreignExchange);
  const [currency, setCurrency] = useState(receipt.extractedCurrency === "UNKNOWN" ? "" : receipt.extractedCurrency ?? "");
  const [amount, setAmount] = useState(receipt.originalAmountCents == null ? "" : (receipt.originalAmountCents / 100).toFixed(2));
  const [date, setDate] = useState(receipt.receiptDate ?? "");
  const [manual, setManual] = useState(fx?.source === "MANUAL");
  const [nok, setNok] = useState(fx?.source === "MANUAL" ? (fx.nokAmountCents / 100).toFixed(2) : "");
  const [note, setNote] = useState(fx?.note ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = "h-9 w-full min-w-0 rounded-md border border-control bg-field px-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/10";
  const cents = (value: string) => /^[+-]?\d+(?:[.,]\d{1,2})?$/.test(value.trim()) ? Math.round(Number(value.replace(",", ".")) * 100) : null;
  async function save() {
    setPending(true); setError(null);
    try {
      const response = await fetch(`/api/receipts/${receipt.id}?token=${encodeURIComponent(token)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fxMode: manual ? "manual" : "bank", currency, originalAmountCents: cents(amount), receiptDate: date, extractedTotalCents: manual ? cents(nok) : undefined, note }) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error ?? "Kunne ikke beregne valuta.");
      onSaved(value);
    } catch (error) { setError(error instanceof Error ? error.message : "Kunne ikke beregne valuta."); }
    finally { setPending(false); }
  }
  return <details open={!fx || undefined} className="min-w-0 text-[13px] text-muted">
    <summary className={`cursor-pointer py-1 underline underline-offset-2 ${!fx ? "text-neg" : ""}`}>{t(fx ? "Valutagrunnlag" : "Kontroller dato og beløp for omregning")}</summary>
    {fx ? <p className="mt-2 break-words">{fx.source === "NORGES_BANK" ? <>{t("Norges Bank")}: 1 {fx.currency} = {fx.rate.toFixed(8).replace(/0+$/, "").replace(/\.$/, "")} NOK · {t("Kursdato")}: {fx.rateDate} · {t("Kjøpsdato")}: {fx.receiptDate}</> : <>{t("Faktisk NOK-beløp")}: {fx.note}</>}</p> : <p className="mt-2 text-neg">{t("Kunne ikke omregne bilaget automatisk. Kontroller dato og beløp.")}</p>}
    {!disabled && <>
      <fieldset disabled={pending} className="mt-2 min-w-0 space-y-3 rounded-md border border-line bg-ground p-3">
        <p>{t("Vi bruker kurs på kjøpsdatoen, eller siste tilgjengelige bankdag før denne. Kontroller dato og originalbeløp.")}</p>
        <div className="grid min-w-0 gap-3 sm:grid-cols-3">
          <label htmlFor={`${id}-currency`} className="min-w-0 space-y-1"><span>{t("Valuta (kode)")}</span><input id={`${id}-currency`} value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} maxLength={3} autoCapitalize="characters" className={field} placeholder="SEK" /></label>
          <label htmlFor={`${id}-amount`} className="min-w-0 space-y-1"><span>{t("Originalbeløp")}</span><input id={`${id}-amount`} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} className={field} /></label>
          <label htmlFor={`${id}-date`} className="min-w-0 space-y-1"><span>{t("Kjøpsdato")}</span><input id={`${id}-date`} type="date" value={date} onInput={e => setDate(e.currentTarget.value)} onChange={e => setDate(e.target.value)} className={field} /></label>
        </div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={manual} onChange={e => setManual(e.target.checked)} />{t("Bruk faktisk NOK-beløp fra bank/kort")}</label>
        {manual && <div className="grid gap-3 sm:grid-cols-2">
          <label htmlFor={`${id}-nok`} className="min-w-0 space-y-1"><span>{t("Faktisk NOK-beløp")}</span><input id={`${id}-nok`} inputMode="decimal" value={nok} onChange={e => setNok(e.target.value)} className={field} /></label>
          <label htmlFor={`${id}-note`} className="min-w-0 space-y-1"><span>{t("Dokumentasjonsgrunnlag")}</span><input id={`${id}-note`} value={note} onChange={e => setNote(e.target.value)} maxLength={500} className={field} /></label>
          <p className="sm:col-span-2">{t("Beskriv grunnlaget og legg ved dokumentasjon, for eksempel kortutskrift som ekstra bilde av bilaget.")}</p>
        </div>}
        {error && <p role="alert" className="text-neg">{t(error)}</p>}
        <button type="button" onClick={save} disabled={pending} className="min-h-9 rounded-md bg-secondary px-3 text-sm text-ink disabled:opacity-60">{t(pending ? "Lagrer…" : manual ? "Lagre NOK-grunnlag" : "Hent kurs og beregn NOK")}</button>
      </fieldset>
    </>}
  </details>;
}
