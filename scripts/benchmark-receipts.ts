/** Run only against synthetic or explicitly approved receipts. Never used by the application. */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "dotenv";
async function main() {
  for (const name of [".env", ".env.local"]) {
    try {
      const values = parse(await readFile(name));
      for (const [key, value] of Object.entries(values))
        if (process.env[key] === undefined) process.env[key] = value;
    } catch {
      /* Optional local configuration. */
    }
  }
  const manifestPath = process.argv[2];
  if (!manifestPath)
    throw new Error(
      "Usage: npm run benchmark:receipts -- manifest.json [output.json]",
    );
  type Case = {
    file: string;
    mimeType: string;
    expected: {
      totalCents?: number | null;
      currency?: string;
      merchant?: string;
      receiptDate?: string;
      readable?: boolean;
    };
  };
  const cases: Case[] = JSON.parse(await readFile(manifestPath, "utf8"));
  const { analyzeReceipt, RECEIPT_MODEL, PROMPT_VERSION } = await import(
    "../src/lib/analyzeReceipt"
  );
  const results: unknown[] = [];
  const batches: unknown[] = [];
  for (const size of [1, 5, 10]) {
    const batchStart = performance.now();
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(2, size) }, async () => {
        while (next < size) {
          const index = next++;
          const entry = cases[index % cases.length];
          const started = performance.now();
          try {
            const result = await analyzeReceipt(
              await readFile(
                path.resolve(path.dirname(manifestPath), entry.file),
              ),
              entry.mimeType,
            );
            const checks = Object.fromEntries(
              Object.entries(entry.expected).map(([key, expected]) => [
                key,
                result[key as keyof typeof result] === expected,
              ]),
            );
            results.push({
              batchSize: size,
              index,
              file: entry.file,
              durationMs: Math.round(performance.now() - started),
              checks,
              result,
            });
          } catch (e) {
            results.push({
              batchSize: size,
              index,
              file: entry.file,
              durationMs: Math.round(performance.now() - started),
              error: (e as Error).message,
            });
          }
        }
      }),
    );
    batches.push({
      size,
      durationMs: Math.round(performance.now() - batchStart),
    });
  }
  const output = process.argv[3] || "receipt-benchmark.json";
  await writeFile(
    output,
    JSON.stringify(
      {
        date: new Date().toISOString(),
        model: RECEIPT_MODEL,
        promptVersion: PROMPT_VERSION,
        concurrency: 2,
        runtime: process.version,
        batches,
        results,
      },
      null,
      2,
    ),
  );
  console.log(
    `Benchmark saved to ${output}. Compare models using the same manifest; this is not a representative accuracy estimate.`,
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
