/** Run only against synthetic or explicitly approved receipts. Never used by the application. */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "dotenv";

const USAGE = `Usage: npm run benchmark:receipts -- manifest.json [options]

  --variants  Comma-separated list of model[:detail][:full|compact][:effort]
              e.g. gpt-4o:high:full,gpt-4.1-mini:high:compact,gpt-5.4-mini:auto:compact:low
              Default: the application's current setup (RECEIPT_MODEL, high, compact).
  --repeat    Runs per receipt and variant (default 1).
  --concurrency  Parallel requests per variant (default 2, as in the app).
  --price     Prices per million tokens, model=input/output, comma-separated,
              e.g. gpt-4o=2.5/10. Without a price the report shows tokens only.
  --out       Output file without extension (default receipt-benchmark).`;

type Expected = {
  totalCents?: number | null;
  originalAmountCents?: number | null;
  currency?: string;
  /** Case-insensitive substring of the extracted merchant. */
  merchant?: string;
  receiptDate?: string;
  readable?: boolean;
};
type Case = { file: string; mimeType: string; about?: string; expected: Expected };
type Variant = {
  label: string;
  model: string;
  imageDetail: "high" | "low" | "auto";
  compact: boolean;
  reasoningEffort?: string;
};
type Row = {
  variant: string;
  file: string;
  run: number;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  checks?: Record<string, boolean>;
  got?: Record<string, unknown>;
  error?: string;
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function parseVariant(spec: string): Variant {
  const [model, ...rest] = spec.split(":");
  const v: Variant = { label: spec, model, imageDetail: "high", compact: true };
  for (const part of rest) {
    if (part === "high" || part === "low" || part === "auto") v.imageDetail = part;
    else if (part === "compact") v.compact = true;
    else if (part === "full") v.compact = false;
    else if (part) v.reasoningEffort = part;
  }
  return v;
}

function parsePrices(spec = ""): Record<string, { input: number; output: number }> {
  return Object.fromEntries(
    spec
      .split(",")
      .filter(Boolean)
      .map((entry) => {
        const [model, prices] = entry.split("=");
        const [input, output] = prices.split("/").map(Number);
        return [model, { input, output }];
      }),
  );
}

function check(expected: Expected, result: Record<string, unknown>): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(expected).map(([key, want]) => {
      const got = result[key];
      if (key === "merchant")
        return [key, typeof got === "string" && got.toLowerCase().includes(String(want).toLowerCase())];
      return [key, got === want];
    }),
  );
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

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
  if (!manifestPath || manifestPath.startsWith("--")) throw new Error(USAGE);
  const cases: Case[] = JSON.parse(await readFile(manifestPath, "utf8"));
  const { analyzeReceipt, RECEIPT_MODEL, PROMPT_VERSION } = await import("../src/lib/analyzeReceipt");
  const variants = (arg("variants") ?? `${RECEIPT_MODEL}:high:compact`).split(",").map(parseVariant);
  const repeat = Number(arg("repeat") ?? 1);
  const concurrency = Number(arg("concurrency") ?? 2);
  const prices = parsePrices(arg("price"));
  const out = arg("out") ?? "receipt-benchmark";

  const files = new Map<string, Buffer>();
  for (const c of cases) files.set(c.file, await readFile(path.resolve(path.dirname(manifestPath), c.file)));

  const rows: Row[] = [];
  for (const v of variants) {
    const jobs = cases.flatMap((c) => Array.from({ length: repeat }, (_, run) => ({ c, run })));
    let next = 0;
    process.stdout.write(`${v.label}: `);
    await Promise.all(
      Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
        while (next < jobs.length) {
          const { c, run } = jobs[next++];
          const started = performance.now();
          try {
            const r = await analyzeReceipt(files.get(c.file)!, c.mimeType, {
              model: v.model,
              imageDetail: v.imageDetail,
              compact: v.compact,
              reasoningEffort: v.reasoningEffort as never,
            });
            const got = {
              totalCents: r.totalCents,
              originalAmountCents: r.originalAmountCents,
              currency: r.currency,
              merchant: r.merchant,
              receiptDate: r.receiptDate,
              readable: r.readable,
              summary: r.summary,
            };
            rows.push({ variant: v.label, file: c.file, run, durationMs: Math.round(performance.now() - started), inputTokens: r.inputTokens, outputTokens: r.outputTokens, checks: check(c.expected, got), got });
            process.stdout.write(".");
          } catch (e) {
            rows.push({ variant: v.label, file: c.file, run, durationMs: Math.round(performance.now() - started), error: (e as Error).message });
            process.stdout.write("x");
          }
        }
      }),
    );
    process.stdout.write("\n");
  }

  const fields = ["totalCents", "originalAmountCents", "currency", "merchant", "receiptDate", "readable"];
  const summary = variants.map((v) => {
    const mine = rows.filter((r) => r.variant === v.label);
    const ok = mine.filter((r) => !r.error);
    const fieldScores = Object.fromEntries(
      fields.map((f) => {
        const scored = ok.filter((r) => r.checks && f in r.checks);
        return [f, scored.length ? scored.filter((r) => r.checks![f]).length / scored.length : null];
      }),
    );
    const allCorrect = ok.filter((r) => r.checks && Object.values(r.checks).every(Boolean)).length;
    const avgIn = ok.reduce((a, r) => a + (r.inputTokens ?? 0), 0) / (ok.length || 1);
    const avgOut = ok.reduce((a, r) => a + (r.outputTokens ?? 0), 0) / (ok.length || 1);
    const price = prices[v.model];
    return {
      variant: v.label,
      runs: mine.length,
      errors: mine.length - ok.length,
      allCorrect: ok.length ? allCorrect / mine.length : 0,
      fields: fieldScores,
      medianMs: percentile(ok.map((r) => r.durationMs), 50),
      p90Ms: percentile(ok.map((r) => r.durationMs), 90),
      avgInputTokens: Math.round(avgIn),
      avgOutputTokens: Math.round(avgOut),
      usdPer1000Receipts: price ? Math.round(((avgIn * price.input + avgOut * price.output) / 1e6) * 1000 * 100) / 100 : null,
    };
  });

  const pct = (x: number | null) => (x == null ? "–" : `${Math.round(x * 100)} %`);
  const s = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
  const md = [
    `# Kvitteringsanalyse: sammenligning`,
    ``,
    `${new Date().toISOString()} · ${cases.length} kvitteringer × ${repeat} · samtidighet ${concurrency} · prompt ${PROMPT_VERSION}`,
    ``,
    `| Oppsett | Alt riktig | Total | Valuta | Butikk | Dato | Lesbar | Median | p90 | Tokens inn/ut | USD per 1000 | Feil |`,
    `|---|---|---|---|---|---|---|---|---|---|---|---|`,
    ...summary.map((r) => {
      const total = [r.fields.totalCents, r.fields.originalAmountCents].filter((x) => x != null) as number[];
      const totalScore = total.length ? total.reduce((a, b) => a + b, 0) / total.length : null;
      return `| ${r.variant} | ${pct(r.allCorrect)} | ${pct(totalScore)} | ${pct(r.fields.currency)} | ${pct(r.fields.merchant)} | ${pct(r.fields.receiptDate)} | ${pct(r.fields.readable)} | ${s(r.medianMs)} | ${s(r.p90Ms)} | ${r.avgInputTokens}/${r.avgOutputTokens} | ${r.usdPer1000Receipts ?? "–"} | ${r.errors} |`;
    }),
    ``,
    `## Avvik`,
    ``,
    ...rows
      .filter((r) => r.error || (r.checks && !Object.values(r.checks).every(Boolean)))
      .map((r) =>
        r.error
          ? `- ${r.variant} · ${r.file}: feil – ${r.error}`
          : `- ${r.variant} · ${r.file}: ${Object.entries(r.checks!)
              .filter(([, ok]) => !ok)
              .map(([k]) => `${k}=${JSON.stringify(r.got?.[k])}`)
              .join(", ")}`,
      ),
  ].join("\n");

  await writeFile(`${out}.json`, JSON.stringify({ date: new Date().toISOString(), promptVersion: PROMPT_VERSION, concurrency, repeat, runtime: process.version, variants, summary, rows }, null, 2));
  await writeFile(`${out}.md`, md + "\n");
  console.log(`\n${md}\n\nLagret ${out}.md og ${out}.json. Få kvitteringer gir usikre tall; bruk flere godkjente ekte bilag og --repeat for et sikrere bilde.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
