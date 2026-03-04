/**
 * Default exchange rates (1 unit of foreign = X NOK).
 * Used when EXCHANGE_RATE_* is not set in env. Safe to import on client.
 */
export const DEFAULT_RATES: Record<string, number> = {
  SEK: 0.95,
  EUR: 11.5,
  DKK: 1.4,
  USD: 10.8,
  GBP: 13.5,
  CHF: 12.2,
};

/** Convert amount in foreign currency (cents) to NOK cents using default rates. */
export function convertToNokCentsClient(
  amountCents: number,
  currencyCode: string
): number | null {
  const code = normalizeCurrencyCode(currencyCode);
  if (!code || code === "NOK") return amountCents;
  const rate = DEFAULT_RATES[code] ?? null;
  if (rate == null) return null;
  return Math.round((amountCents / 100) * rate * 100);
}

/** Map various currency labels to ISO code for rate lookup. */
function normalizeCurrencyCode(raw: string): string | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim().toUpperCase().slice(0, 10);
  if (!s) return null;
  if (s === "NOK" || s === "KR" || s === "NOKR") return "NOK";
  if (s === "SEK" || s.startsWith("SVENSKA") || s === "SVK") return "SEK";
  if (s === "DKK" || s.startsWith("DANSKA")) return "DKK";
  if (s === "EUR" || s === "€" || s.startsWith("EURO")) return "EUR";
  if (s === "USD" || s === "$") return "USD";
  if (s === "GBP" || s.startsWith("POUND")) return "GBP";
  if (s === "CHF") return "CHF";
  if (DEFAULT_RATES[s]) return s;
  return s;
}
