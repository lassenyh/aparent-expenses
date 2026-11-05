/** Persisted per receipt. Rates always mean NOK for ONE unit of original currency. */
export type ForeignExchange = {
  version: 1;
  source: "NORGES_BANK" | "MANUAL";
  currency: string;
  originalAmountCents: number;
  nokAmountCents: number;
  rate: number;
  receiptDate: string;
  rateDate: string;
  retrievedAt: string;
  sourceUrl: string | null;
  note: string | null;
};
export function validReceiptDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value &&
    value <= new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
}
export function roundForeignCents(amount: number, rate: number): number {
  return Math.sign(amount) * Math.round(Math.abs(amount) * rate);
}
export function moneyCents(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && Math.abs(value) <= 2147483647;
}
export function readForeignExchange(value: unknown): ForeignExchange | null {
  if (!value || typeof value !== "object") return null;
  const f = value as ForeignExchange;
  if (f.version !== 1 || !["NORGES_BANK", "MANUAL"].includes(f.source) || !/^[A-Z]{3}$/.test(f.currency) ||
    !moneyCents(f.originalAmountCents) || !moneyCents(f.nokAmountCents) || !Number.isFinite(f.rate) || f.rate <= 0 ||
    !validReceiptDate(f.receiptDate) || !validReceiptDate(f.rateDate) || !Number.isFinite(Date.parse(f.retrievedAt))) return null;
  if (f.source === "MANUAL" && (typeof f.note !== "string" || f.note.trim().length < 3)) return null;
  if (f.source === "NORGES_BANK" && (f.rateDate > f.receiptDate || !(typeof f.sourceUrl === "string" && f.sourceUrl.startsWith("https://data.norges-bank.no/api/data/EXR/")))) return null;
  return f;
}
export function foreignExchangeProblem(receipt: { extractedCurrency?: string | null; originalAmountCents?: number | null; extractedTotalCents?: number | null; receiptDate?: string | null; foreignExchange?: unknown }): string | null {
  if (!receipt.extractedCurrency || receipt.extractedCurrency === "NOK") return null;
  const f = readForeignExchange(receipt.foreignExchange);
  if (!f) return "Valutaomregningen må dokumenteres før innsending.";
  if (f.currency !== receipt.extractedCurrency || f.originalAmountCents !== receipt.originalAmountCents ||
    f.receiptDate !== receipt.receiptDate || f.nokAmountCents !== receipt.extractedTotalCents ||
    Math.abs(roundForeignCents(f.originalAmountCents, f.rate) - f.nokAmountCents) > 1) return "Valutagrunnlaget stemmer ikke med beløpet. Beregn på nytt eller dokumenter faktisk NOK-beløp.";
  return null;
}
/** Norwegian text is shared by the browser preview and the accounting PDF. */
export function foreignExchangePdfLines(value: unknown): string[] {
  const f = readForeignExchange(value);
  if (!f) return ["Valutakurs ikke dokumentert (eldre bilag)"];
  if (f.source === "MANUAL") return [`Faktisk NOK-beløp / manuelt grunnlag: ${f.note}`, `Kjøpsdato: ${f.receiptDate}`];
  return [`Kurs: 1 ${f.currency} = ${f.rate.toFixed(8)} NOK`, `Norges Bank ${f.rateDate}; kjøpsdato ${f.receiptDate}`];
}
