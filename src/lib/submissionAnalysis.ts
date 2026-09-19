export function canAnalyzeSubmission(status: string): boolean {
  return status === "DRAFT" || status === "REVIEW";
}

export function receiptNeedsAnalysis(receipt: {
  extractedSummary: string | null;
}): boolean {
  return receipt.extractedSummary == null;
}
