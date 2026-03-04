import { NextResponse } from "next/server";
import sharp from "sharp";
import { renderExpensePdfHtml } from "@/lib/pdf/renderExpensePdfHtml";
import { htmlToPdf } from "@/lib/pdf/htmlToPdf";
import { appendReceiptPages } from "@/lib/pdf/appendReceiptPages";

/** Minimal placeholder image for demo receipt pages (gray rectangle). */
async function getDemoPlaceholderImage(): Promise<Buffer> {
  return sharp({
    create: {
      width: 400,
      height: 300,
      channels: 3,
      background: { r: 230, g: 230, b: 230 },
    },
  })
    .jpeg()
    .toBuffer();
}

/**
 * GET /api/demo-pdf
 * Genererer en demo-PDF med falske kvitteringslinjer og summer (samme layout som forhåndsvisning).
 * Inkluderer én placeholder-side per kvittering.
 */
export async function GET() {
  try {
    const fakeSubmission = {
      name: "Demo Bruker",
      projectNumber: "12345",
      project: "Demo Prosjekt",
      workDate: "2026-03-02T00:00:00.000Z",
      accountNumber: "12345678901",
      productionCashCents: 10000, // 100 kr
    };

    const fakeReceipts = [
      { summary: "USB-C kabel og laptopstativ", amountCents: 69980, date: null as string | null },
      { summary: "Parkering EasyPark februar 2026", amountCents: 56800, date: null as string | null },
      { summary: "Kaffe og lunsj", amountCents: 24500, date: null as string | null },
    ];

    const totalCents = fakeReceipts.reduce((s, r) => s + r.amountCents, 0);
    const productionCashCents = fakeSubmission.productionCashCents;
    const diffCents = totalCents - productionCashCents;

    const pdfHtml = await renderExpensePdfHtml({
      submission: fakeSubmission,
      receipts: fakeReceipts,
      totals: { totalCents, productionCashCents, diffCents },
    });
    const summaryPdfBytes = await htmlToPdf(pdfHtml);

    const receiptsForAppend = fakeReceipts.map((r) => ({
      blobUrl: "demo",
      mimeType: "image/jpeg",
      summary: r.summary,
    }));
    const placeholderImage = await getDemoPlaceholderImage();
    const pdfBuffer = await appendReceiptPages(
      summaryPdfBytes,
      receiptsForAppend,
      async () => placeholderImage
    );

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="utlegg-demo.pdf"',
      },
    });
  } catch (error) {
    console.error("[demo-pdf]", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
