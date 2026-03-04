"use client";

import { useEffect, useState } from "react";
import {
  ExpensePdfLayout,
  type ExpensePdfSubmission,
  type ExpensePdfReceipt,
  type ExpensePdfTotals,
} from "@/components/pdf/ExpensePdfLayout";

const PREVIEW_STORAGE_KEY = "expense-preview";

type PreviewPayload = {
  submission: ExpensePdfSubmission;
  receipts: ExpensePdfReceipt[];
  totals: ExpensePdfTotals;
};

export function PreviewPopup({ token }: { token: string }) {
  const [data, setData] = useState<PreviewPayload | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`${PREVIEW_STORAGE_KEY}-${token}`);
      if (raw) {
        const parsed = JSON.parse(raw) as PreviewPayload;
        setData(parsed);
      }
    } catch {
      setData(null);
    }
  }, [token]);

  if (data === null) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-100 p-6">
        <p className="text-center text-neutral-600">
          Ingen forhåndsvisningsdata. Åpne forhåndsvisning fra gjennomgangssiden.
        </p>
        <button
          type="button"
          onClick={() => window.close()}
          className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Lukk vindu
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-100">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-neutral-200 bg-white px-4 py-2 shadow-sm">
        <h1 className="text-sm font-medium text-neutral-700">
          Forhåndsvis av utleggsskjema
        </h1>
        <button
          type="button"
          onClick={() => window.close()}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Lukk
        </button>
      </div>
      <div className="overflow-auto p-4">
        <div className="mx-auto max-w-[720px] rounded-lg bg-white shadow">
          <ExpensePdfLayout
            submission={data.submission}
            receipts={data.receipts}
            totals={data.totals}
          />
        </div>
      </div>
    </main>
  );
}
