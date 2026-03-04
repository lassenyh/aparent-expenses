/**
 * Exchange rates from foreign currency to NOK (1 unit of foreign = X NOK).
 * Set in .env e.g. EXCHANGE_RATE_SEK=0.95 to override defaults.
 */
import { DEFAULT_RATES } from "./currencyRates";

const RATE_ENV_PREFIX = "EXCHANGE_RATE_";

function normalizeCurrencyCode(raw: string): string | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim().toUpperCase();
  if (!s) return null;
  if (s === "NOK" || s === "KR" || s === "NOKR") return "NOK";
  if (s === "SEK" || s === "SVENSKA" || s === "SVK") return "SEK";
  if (s === "DKK" || s === "DANSKA") return "DKK";
  if (s === "EUR" || s === "€" || s === "EURO") return "EUR";
  if (s === "USD" || s === "$") return "USD";
  if (s === "GBP" || s === "POUND") return "GBP";
  if (s === "CHF") return "CHF";
  if (DEFAULT_RATES[s]) return s;
  return s;
}

export function getRateToNok(currencyCode: string): number | null {
  const code = normalizeCurrencyCode(currencyCode);
  if (!code || code === "NOK") return 1;
  const key = `${RATE_ENV_PREFIX}${code}`;
  const raw = process.env[key];
  if (raw != null && raw !== "") {
    const rate = parseFloat(raw);
    if (Number.isFinite(rate) && rate > 0) return rate;
  }
  return DEFAULT_RATES[code] ?? null;
}

/** Convert amount in foreign currency (cents) to NOK cents. Returns null if no rate. */
export function convertToNokCents(
  amountCents: number,
  currencyCode: string
): number | null {
  const code = normalizeCurrencyCode(currencyCode);
  if (!code) return null;
  const rate = getRateToNok(currencyCode);
  if (rate == null) return null;
  if (code === "NOK") return amountCents;
  return Math.round((amountCents / 100) * rate * 100);
}
