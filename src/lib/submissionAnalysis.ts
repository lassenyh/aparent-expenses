/**
 * Receipts analysed in parallel per request. Four keeps an 11-receipt upload
 * well inside the 60 s function limit and far below OpenAI rate limits.
 */
export const ANALYSIS_CONCURRENCY = 4;

export function canAnalyzeSubmission(status: string): boolean {
  return status === "DRAFT" || status === "REVIEW";
}

export function receiptNeedsAnalysis(receipt: {
  extractedSummary: string | null;
}): boolean {
  return receipt.extractedSummary == null;
}
