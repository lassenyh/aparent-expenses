import { type ForeignExchange, validReceiptDate, moneyCents, roundForeignCents } from "./foreignExchange";

// CSV cells can be quoted. Only the bank's fixed endpoint is contacted.
function csvCells(line: string): string[] {
  return (line.match(/(?:"(?:[^"]|"")*"|[^;]*)(?:;|$)/g) ?? []).filter((x, i, a) => i < a.length - 1 || x !== "").map(x => x.replace(/;$/, "").replace(/^"|"$/g, "").replaceAll('""', '"'));
}
export function parseBankRate(csv: string, currency: string, receiptDate: string) {
  const [header, ...lines] = csv.trim().replace(/^\uFEFF/, "").split(/\r?\n/).map(csvCells);
  const index = (key: string) => header.indexOf(key);
  const rows = lines.filter(row => row[index("BASE_CUR")] === currency && row[index("QUOTE_CUR")] === "NOK" && row[index("TIME_PERIOD")] <= receiptDate)
    .sort((a, b) => b[index("TIME_PERIOD")].localeCompare(a[index("TIME_PERIOD")]));
  for (const row of rows) {
    const rateDate = row[index("TIME_PERIOD")];
    const multiplier = Number(row[index("UNIT_MULT")]);
    const rate = Number(row[index("OBS_VALUE")]?.replace(",", ".")) / 10 ** multiplier;
    const ageDays = (Date.parse(receiptDate) - Date.parse(rateDate)) / 86400000;
    if (validReceiptDate(rateDate) && Number.isFinite(rate) && rate > 0 && ageDays >= 0 && ageDays <= 10 && /^-?\d+$/.test(row[index("UNIT_MULT")] ?? "") && Math.abs(multiplier) <= 12) return { rate, rateDate };
  }
  throw new Error("Fant ingen gyldig valutakurs for kjøpsdatoen.");
}
// Share in-flight and completed lookups for many receipts in the same currency/date.
const rates = new Map<string, { expires: number; promise: Promise<{ rate: number; rateDate: string; sourceUrl: string }> }>();
export async function bankConversion(currency: string, originalAmountCents: number, receiptDate: string): Promise<ForeignExchange> {
  if (!/^[A-Z]{3}$/.test(currency) || currency === "NOK" || currency === "UNKNOWN" || !moneyCents(originalAmountCents) || !validReceiptDate(receiptDate)) throw new Error("Kontroller valuta, originalbeløp og kjøpsdato.");
  const key = `${currency}:${receiptDate}`;
  let entry = rates.get(key);
  if (!entry || entry.expires <= Date.now()) {
    const start = new Date(Date.parse(receiptDate) - 10 * 86400000).toISOString().slice(0, 10);
    const sourceUrl = `https://data.norges-bank.no/api/data/EXR/B.${currency}.NOK.SP?format=csv&startPeriod=${start}&endPeriod=${receiptDate}&locale=en`;
    const promise = (async () => {
      const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(10000), cache: "no-store" });
      if (!response.ok) throw new Error("Kunne ikke hente kurs fra Norges Bank. Prøv igjen eller dokumenter faktisk NOK-beløp.");
      return { ...parseBankRate(await response.text(), currency, receiptDate), sourceUrl };
    })();
    if (rates.size > 200) rates.clear();
    entry = { expires: Date.now() + 15 * 60000, promise };
    rates.set(key, entry);
    promise.catch(() => { if (rates.get(key)?.promise === promise) rates.delete(key); });
  }
  const { rate, rateDate, sourceUrl } = await entry.promise;
  const nokAmountCents = roundForeignCents(originalAmountCents, rate);
  if (!moneyCents(nokAmountCents)) throw new Error("NOK-beløpet er for stort.");
  return { version: 1, source: "NORGES_BANK", currency, originalAmountCents, nokAmountCents, rate, receiptDate, rateDate, sourceUrl, retrievedAt: new Date().toISOString(), note: null };
}
export function manualConversion(currency: string, originalAmountCents: number, nokAmountCents: number, receiptDate: string, note: string): ForeignExchange {
  if (!/^[A-Z]{3}$/.test(currency) || currency === "NOK" || !moneyCents(originalAmountCents) || !moneyCents(nokAmountCents) || originalAmountCents === 0 || !validReceiptDate(receiptDate) || !note.trim() || note.trim().length < 3 || note.length > 500 || Math.sign(originalAmountCents) !== Math.sign(nokAmountCents)) throw new Error("Oppgi gyldig kjøpsdato, beløp og grunnlag for faktisk NOK-beløp.");
  return { version: 1, source: "MANUAL", currency, originalAmountCents, nokAmountCents, rate: nokAmountCents / originalAmountCents, receiptDate, rateDate: receiptDate, sourceUrl: null, retrievedAt: new Date().toISOString(), note: note.trim() };
}
