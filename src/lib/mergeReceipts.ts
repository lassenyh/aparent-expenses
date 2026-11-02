/**
 * Merges a server snapshot of receipts into the client list. Parallel uploads
 * return snapshots in any order, so an older snapshot must not drop a receipt
 * a newer one added, nor bring back one the user has deleted since.
 */
export function mergeReceipts<T extends { id: string }>(
  current: readonly T[],
  snapshot: readonly T[],
  deletedIds: ReadonlySet<string>,
): T[] {
  const byId = new Map(current.map((r) => [r.id, r]));
  for (const r of snapshot) byId.set(r.id, r);
  const order = [...snapshot.map((r) => r.id), ...current.map((r) => r.id)];
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const id of order) {
    if (seen.has(id) || deletedIds.has(id)) continue;
    seen.add(id);
    merged.push(byId.get(id)!);
  }
  return merged;
}
