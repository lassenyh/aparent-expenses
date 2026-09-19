import { expensePdfStyles } from "./expensePdfStyles";
import { expensePdfFonts } from "./expensePdfFonts";
import fs from "fs";
import path from "path";
import React from "react";
import {
  ExpensePdfLayout,
  type ExpensePdfSubmission,
  type ExpensePdfReceipt,
  type ExpensePdfTotals,
} from "@/components/pdf/ExpensePdfLayout";

export type RenderExpensePdfHtmlParams = {
  submission: ExpensePdfSubmission;
  receipts: ExpensePdfReceipt[];
  totals: ExpensePdfTotals;
};

function getLogoDataUrl(): string | undefined {
  try {
    const logoPath = path.join(process.cwd(), "public", "logo-pdf.png");
    const buf = fs.readFileSync(logoPath);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return undefined;
  }
}

/**
 * Renders the expense PDF layout (same component as preview) to a full HTML document string.
 * Local CSS and embedded logo make PDF generation independent of external CDNs.
 * Uses dynamic import of react-dom/server to avoid Next.js App Router build error.
 */
export async function renderExpensePdfHtml({
  submission,
  receipts,
  totals,
}: RenderExpensePdfHtmlParams): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const logoDataUrl = getLogoDataUrl();
  const body = renderToStaticMarkup(
    React.createElement(ExpensePdfLayout, {
      submission,
      receipts,
      totals,
      logoDataUrl,
    }),
  );

  return `<!DOCTYPE html>
<html lang="nb">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Utlegg</title>
  <style>${expensePdfFonts}${expensePdfStyles}</style>
</head>
<body class="bg-white">
  ${body}
</body>
</html>`;
}
