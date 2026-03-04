import { REPAYMENT_ACCOUNT_NUMBER } from "@/lib/constants";

/**
 * Shared layout for expense PDF. No "use client" so it can be rendered on the server
 * (renderToStaticMarkup in API routes) and in the print preview page.
 */
export type ExpensePdfSubmission = {
  name: string | null;
  projectNumber?: string | null;
  project: string | null;
  workDate: string | null;
  accountNumber: string | null;
  productionCashCents: number;
};

export type ExpensePdfReceipt = {
  summary: string;
  amountCents: number;
  date?: string | null;
  comment?: string | null;
  /** Original amount in foreign currency (cents). Shown next to description when not NOK. */
  originalAmountCents?: number | null;
  /** ISO currency code (e.g. SEK, EUR). Shown with original amount when not NOK. */
  extractedCurrency?: string | null;
};

export type ExpensePdfTotals = {
  totalCents: number;
  productionCashCents: number;
  diffCents: number;
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  } catch {
    return "—";
  }
}

function formatNok(cents: number): string {
  return `${(cents / 100).toFixed(2)} NOK`;
}

function diffLabel(diffCents: number): string {
  if (diffCents > 0) return "Til utbetaling (Aparent skylder deg)";
  if (diffCents < 0) return "Tilbakebetaling (du skylder Aparent)";
  return "I balanse";
}

type ExpensePdfLayoutProps = {
  submission: ExpensePdfSubmission;
  receipts: ExpensePdfReceipt[];
  totals: ExpensePdfTotals;
  /** Base64 data URL for logo (from public/logo-pdf.png). Falls back to /logo-pdf.png for browser. */
  logoDataUrl?: string;
};

export function ExpensePdfLayout({
  submission,
  receipts,
  totals,
  logoDataUrl,
}: ExpensePdfLayoutProps) {
  const { totalCents, productionCashCents, diffCents } = totals;
  const resultPositive = diffCents > 0;
  const resultNegative = diffCents < 0;
  const resultZero = diffCents === 0;

  return (
    <div
      className="min-h-screen bg-white p-10 print:p-10 print:bg-white"
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
      }}
    >
      <div className="mx-auto max-w-[720px] space-y-8 break-inside-avoid print:text-black print:bg-white">
        {/* HEADER */}
        <header className="break-inside-avoid">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 print:text-black">
                Utleggsskjema
              </h1>
              {(submission.projectNumber?.trim() || submission.project?.trim()) && (
                <p className="mt-1 text-sm font-medium text-gray-500 print:text-gray-600">
                  {[submission.projectNumber?.trim(), submission.project?.trim()]
                    .filter(Boolean)
                    .join(" – ")}
                </p>
              )}
            </div>
            <img
              src={logoDataUrl ?? "/logo-pdf.png"}
              alt="Logo"
              className="h-12 w-auto max-w-[140px] object-contain object-right"
            />
          </div>
          <div className="mt-4 border-b border-gray-200" />
        </header>

        {/* PERSON INFO CARD */}
        <section
          className="break-inside-avoid rounded-xl border border-gray-200 bg-gray-50/40 p-6 print:bg-white print:border-gray-200"
          role="region"
          aria-label="Person- og prosjektinfo"
        >
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500 print:text-black">
            Person- og prosjektinfo
          </h2>
          <dl className="grid gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500 print:text-gray-700">Navn</dt>
              <dd className="text-right font-medium text-gray-900 print:text-black">
                {submission.name ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500 print:text-gray-700">Prosjektnummer</dt>
              <dd className="text-right font-medium text-gray-900 print:text-black">
                {submission.projectNumber?.trim() ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500 print:text-gray-700">Prosjektnavn</dt>
              <dd className="text-right font-medium text-gray-900 print:text-black">
                {submission.project ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500 print:text-gray-700">Dato</dt>
              <dd className="text-right font-medium text-gray-900 print:text-black">
                {formatDate(submission.workDate)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500 print:text-gray-700">
                Kontonummer
              </dt>
              <dd className="text-right font-mono font-medium text-gray-900 print:text-black">
                {submission.accountNumber ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500 print:text-gray-700">
                Produksjonskasse
              </dt>
              <dd className="text-right font-mono font-medium text-gray-900 print:text-black">
                {formatNok(submission.productionCashCents)}
              </dd>
            </div>
          </dl>
        </section>

        {/* RECEIPT LIST */}
        <section
          className="break-inside-avoid rounded-xl border border-gray-200 bg-gray-50/40 p-6 print:bg-white print:border-gray-200"
          role="region"
          aria-label="Kvitteringer"
        >
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500 print:text-black">
            Kvitteringer
          </h2>
          <div className="overflow-hidden rounded-lg border border-gray-200 print:border-gray-200">
            <table className="w-full text-sm text-gray-900 print:text-black">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/60 print:bg-gray-50">
                  <th
                    className="w-12 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 print:text-black"
                    scope="col"
                  >
                    Nr.
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 print:text-black"
                    scope="col"
                  >
                    Beskrivelse
                  </th>
                  <th
                    className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 print:text-black"
                    scope="col"
                  >
                    Beløp
                  </th>
                </tr>
              </thead>
              <tbody>
                {receipts.flatMap((r, i) => [
                  <tr
                    key={i}
                    className="border-b border-gray-200 last:border-b-0 print:border-gray-200"
                  >
                    <td className="px-4 py-3 font-medium text-gray-600 print:text-black">
                      {i + 1}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 print:text-black">
                      <span>{r.summary || "Kvittering"}</span>
                      {r.originalAmountCents != null &&
                        r.extractedCurrency &&
                        r.extractedCurrency.toUpperCase() !== "NOK" && (
                          <span className="ml-2 text-gray-500 print:text-gray-600">
                            {(r.originalAmountCents / 100).toFixed(2)} {r.extractedCurrency}
                          </span>
                        )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-gray-900 print:text-black">
                      {formatNok(r.amountCents)}
                    </td>
                  </tr>,
                  r.comment?.trim() ? (
                    <tr key={`${i}-comment`}>
                      <td colSpan={3} className="border-b border-gray-200 px-4 py-3 pl-8 text-sm text-gray-600 print:text-black align-middle">
                        Kommentar: {r.comment.trim()}
                      </td>
                    </tr>
                  ) : null,
                ])}
              </tbody>
            </table>
          </div>
        </section>

        {/* SUMMARY CARD */}
        <section
          className="break-inside-avoid rounded-xl border border-gray-200 bg-gray-50/40 p-6 print:bg-white print:border-gray-200"
          role="region"
          aria-label="Oppsummering"
        >
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500 print:text-black">
            Oppsummering
          </h2>
          <dl className="space-y-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500 print:text-gray-700">Total</dt>
              <dd className="font-mono tabular-nums font-medium text-gray-900 print:text-black">
                {formatNok(totalCents)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500 print:text-gray-700">
                Produksjonskasse
              </dt>
              <dd className="font-mono tabular-nums font-medium text-gray-900 print:text-black">
                {formatNok(productionCashCents)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-gray-200 pt-4 print:border-gray-200">
              <dt className="font-medium text-gray-900 print:text-black">
                {diffLabel(diffCents)}
              </dt>
              <dd
                className={`font-mono tabular-nums font-semibold print:text-black ${
                  resultPositive
                    ? "text-green-600 print:text-green-700"
                    : resultNegative
                      ? "text-red-600 print:text-red-700"
                      : "text-gray-900 print:text-black"
                }`}
              >
                {formatNok(diffCents)}
              </dd>
            </div>
            {resultNegative && (
              <div className="flex justify-between gap-4 pt-2">
                <dt className="text-gray-500 print:text-gray-700">
                  Kontonummer for tilbakebetaling
                </dt>
                <dd className="font-mono tabular-nums text-gray-900 print:text-black">
                  {REPAYMENT_ACCOUNT_NUMBER}
                </dd>
              </div>
            )}
          </dl>
        </section>
      </div>
    </div>
  );
}
