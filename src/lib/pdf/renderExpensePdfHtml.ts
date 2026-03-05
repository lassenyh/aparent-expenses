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
 * Tailwind is loaded via CDN so the markup renders with the same styles when converted to PDF.
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
    })
  );

  return `<!DOCTYPE html>
<html lang="no">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Utlegg</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-white">
  ${body}
</body>
</html>`;
}
