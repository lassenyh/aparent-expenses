"use client";

import { useEffect, useState } from "react";
import { T } from "@/components/LanguageProvider";
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
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ground p-6">
        <p className="text-center text-muted">
          <T>{"Ingen forhåndsvisningsdata. Åpne forhåndsvisning fra gjennomgangssiden."}</T>
        </p>
        <button
          type="button"
          onClick={() => window.close()}
          className="h-9 rounded-md bg-secondary px-4 text-sm font-medium text-ink hover:bg-secondary-hover"
        >
          <T>{"Lukk vindu"}</T>
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ground">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-line bg-surface px-4 py-2.5 md:px-5">
        <h1 className="text-sm font-medium text-ink">
          <T>{"Forhåndsvis av utleggsskjema"}</T>
        </h1>
        <button
          type="button"
          onClick={() => window.close()}
          className="h-9 rounded-md bg-secondary px-4 text-sm font-medium text-ink hover:bg-secondary-hover"
        >
          <T>{"Lukk"}</T>
        </button>
      </div>
      <div className="overflow-auto p-4">
        <div className="mx-auto max-w-[760px] overflow-hidden rounded-md border border-line bg-white">
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
