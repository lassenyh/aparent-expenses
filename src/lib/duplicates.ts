export type DuplicateCandidate = {
  id: string;
  contentHash?: string | null;
  merchant?: string | null;
  receiptDate?: string | null;
  extractedTotalCents?: number | null;
};

function normalizeMerchant(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9æøå]/g, "");
}

function sameMerchant(a: string, b: string): boolean {
  const na = normalizeMerchant(a);
  const nb = normalizeMerchant(b);
  if (na.length < 3 || nb.length < 3) return na === nb;
  return na.includes(nb) || nb.includes(na);
}

/**
 * Possible duplicates within one claim: the same file uploaded twice, or two
 * receipts with the same shop, purchase date and amount (the same purchase
 * photographed twice). Returns, for each later receipt in list order, the id
 * of the earlier receipt it repeats. Receipts that are not analysed yet, or
 * miss the shop, date or amount, are only matched on the file itself.
 */
export function findDuplicates(rows: readonly DuplicateCandidate[]): Map<string, string> {
  const result = new Map<string, string>();
  rows.forEach((row, j) => {
    for (let i = 0; i < j; i++) {
      const earlier = rows[i];
      const sameFile = !!row.contentHash && row.contentHash === earlier.contentHash;
      const samePurchase =
        row.extractedTotalCents != null &&
        row.extractedTotalCents !== 0 &&
        row.extractedTotalCents === earlier.extractedTotalCents &&
        !!row.receiptDate &&
        row.receiptDate === earlier.receiptDate &&
        !!row.merchant &&
        !!earlier.merchant &&
        sameMerchant(row.merchant, earlier.merchant);
      if (sameFile || samePurchase) {
        result.set(row.id, earlier.id);
        break;
      }
    }
  });
  return result;
}
