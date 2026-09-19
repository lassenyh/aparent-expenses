export type AnalyzeReceiptResult = {
  summary: string;
  totalCents: number | null;
  currency: string;
  originalAmountCents: number | null;
  merchant: string | null;
  receiptDate: string | null;
  readable: boolean;
  issues: string[];
  vatBreakdown: { rate: number | null; amount: number | null }[];
  lineItems: {
    description: string;
    quantity: number | null;
    amount: number | null;
  }[];
  inputTokens: number;
  outputTokens: number;
  extractedText?: string;
};
