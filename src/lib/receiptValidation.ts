/** Integer cents only. Never infer a refund from a merchant or travel description. */
export function parseAmount(value: unknown): number | null {
  if (typeof value === "number")
    return Number.isFinite(value) && Math.abs(value) <= 20_000_000
      ? Math.round(value * 100)
      : null;
  if (typeof value !== "string") return null;
  let text = value.trim().replace(/[\s\u00a0]/g, "");
  if (text.includes(",")) {
    if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(text)) return null;
    text = text.replace(/\./g, "").replace(",", ".");
  }
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) return null;
  return parseAmount(Number(text));
}
export function ownsAllReceipts(ids: string[], ownedIds: string[]): boolean {
  return (
    new Set(ids).size === ids.length && ids.every((id) => ownedIds.includes(id))
  );
}
export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function isExpired(expiresAt: Date | null | undefined): boolean {
  return !!expiresAt && expiresAt.getTime() <= Date.now();
}
export function tokenExpiry(): Date {
  const days = Number(process.env.ACCESS_TOKEN_DAYS || 90);
  return new Date(
    Date.now() + (Number.isFinite(days) && days > 0 ? days : 90) * 86_400_000,
  );
}
