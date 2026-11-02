/**
 * Receipts the user chose to keep despite a duplicate warning. Kept per browser;
 * the warning is a hint, so losing the choice only shows it again.
 */
const key = (receiptId: string) => `aparent-duplicate-kept-${receiptId}`;

export function isDuplicateKept(receiptId: string): boolean {
  try {
    return localStorage.getItem(key(receiptId)) === "1";
  } catch {
    return false;
  }
}

export function keepDuplicate(receiptId: string): void {
  try {
    localStorage.setItem(key(receiptId), "1");
  } catch {
    // Storage blocked: the choice lasts until the page is reloaded.
  }
}
