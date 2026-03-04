export type AnalyzeReceiptResult = {
  summary: string;
  /** Amount in NOK (for totals). When currency is not NOK, this is the converted value. */
  totalCents: number | null;
  /** ISO currency code from receipt (e.g. NOK, SEK, EUR). */
  currency: string;
  /** Amount in original currency (cents). Set when currency !== NOK for display. */
  originalAmountCents: number | null;
  /** Raw extracted text (e.g. from PDF). Used for meal/drink detection when summary is short. */
  extractedText?: string;
};
