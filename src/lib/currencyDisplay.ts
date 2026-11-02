/** Text for a stored currency code. The analysis stores "UNKNOWN" when it cannot tell. */
export function currencyDisplay(code: string): string {
  return code.toUpperCase() === "UNKNOWN" ? "ukjent valuta" : code;
}
