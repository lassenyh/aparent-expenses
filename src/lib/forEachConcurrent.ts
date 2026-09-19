/** Complete all items with bounded concurrency, retaining the caller's one-request flow. */
export async function forEachConcurrent<T>(
  items: readonly T[],
  concurrency: number,
  action: (item: T) => Promise<void>,
): Promise<void> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("Concurrency must be a positive integer");
  }
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await action(item);
    }
  });
  // Wait for all workers before reporting failure; don't leave mutations running after response.
  const results = await Promise.allSettled(workers);
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}
