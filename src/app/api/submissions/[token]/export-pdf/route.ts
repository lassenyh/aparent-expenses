export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { renderExpensePdfHtml } from "@/lib/pdf/renderExpensePdfHtml";
import { htmlToPdf } from "@/lib/pdf/htmlToPdf";
import { appendReceiptPages } from "@/lib/pdf/appendReceiptPages";

/** Maksimal størrelse for den eksporterte PDF-en (10 MB). */
const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024;

async function streamToBuffer(
  stream: ReadableStream<Uint8Array>
): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * POST /api/submissions/[token]/export-pdf
 * Genererer den samme kombinierte PDF-en som ved innsending, uten å lagre eller sende e-post.
 * Brukes for å teste/laste ned PDF fra gjennomgangssiden.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as {
      name?: string | null;
      projectNumber?: string | null;
      project?: string | null;
      workDate?: string | null;
      accountNumber?: string | null;
      productionCash?: number | null;
      receipts?: Array<{
        id: string;
        extractedSummary?: string | null;
        extractedTotalCents?: number | null;
        comment?: string | null;
      }>;
    };

    const submission = await prisma.submission.findUnique({
      where: { accessToken: token },
      include: { receipts: { orderBy: { createdAt: "asc" } } },
    });

    if (!submission) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 }
      );
    }

    if (submission.status !== "REVIEW") {
      return NextResponse.json(
        { error: "Kan bare eksportere PDF når utlegget er i gjennomgang" },
        { status: 400 }
      );
    }

    const productionCashCents =
      body.productionCash != null
        ? Math.round(Number(body.productionCash) * 100)
        : submission.productionCash != null
          ? submission.productionCash * 100
          : 0;

    const bodyReceiptsById = new Map(
      (body.receipts ?? []).map((r) => [r.id, r])
    );

    const mergedReceipts = submission.receipts.map((r) => {
      const fromBody = bodyReceiptsById.get(r.id);
      return {
        ...r,
        extractedSummary: fromBody?.extractedSummary ?? r.extractedSummary,
        extractedTotalCents:
          fromBody?.extractedTotalCents ?? r.extractedTotalCents,
        comment: fromBody?.comment !== undefined ? fromBody.comment : r.comment,
      };
    });

    for (const r of mergedReceipts) {
      if (r.extractedTotalCents == null) {
        return NextResponse.json(
          { error: "Alle kvitteringer må ha beløp (NOK) for å eksportere PDF" },
          { status: 400 }
        );
      }
    }

    const totalCents = mergedReceipts.reduce(
      (s, r) => s + (r.extractedTotalCents ?? 0),
      0
    );
    const diffCents = totalCents - productionCashCents;

    const workDate =
      body.workDate != null && body.workDate !== ""
        ? new Date(body.workDate)
        : submission.workDate;

    const pdfHtml = await renderExpensePdfHtml({
      submission: {
        name: body.name ?? submission.name,
        projectNumber: body.projectNumber ?? submission.projectNumber,
        project: body.project ?? submission.project,
        workDate: workDate?.toISOString() ?? null,
        accountNumber: body.accountNumber ?? submission.accountNumber,
        productionCashCents,
      },
      receipts: mergedReceipts.map((r) => ({
        summary: r.extractedSummary ?? "Kvittering",
        amountCents: r.extractedTotalCents ?? 0,
        date: workDate?.toISOString() ?? null,
        comment: r.comment ?? null,
        originalAmountCents: r.originalAmountCents ?? null,
        extractedCurrency: r.extractedCurrency ?? null,
      })),
      totals: {
        totalCents,
        productionCashCents,
        diffCents,
      },
    });
    const summaryPdfBytes = await htmlToPdf(pdfHtml);

    const receiptsForAppend = mergedReceipts.map((r) => ({
      blobUrl: r.blobUrl,
      mimeType: r.mimeType,
      summary: r.extractedSummary ?? "Kvittering",
    }));
    async function getReceiptBytes(url: string): Promise<Buffer> {
      const result = await get(url, { access: "private" });
      if (!result || result.statusCode !== 200 || !result.stream) {
        throw new Error("Failed to fetch blob");
      }
      return streamToBuffer(result.stream);
    }
    const pdfBytes = await appendReceiptPages(
      summaryPdfBytes,
      receiptsForAppend,
      getReceiptBytes
    );

    if (pdfBytes.length > MAX_PDF_SIZE_BYTES) {
      return NextResponse.json(
        {
          error:
            "PDF-en ble for stor (maks 10 MB). Fjern noen bilag eller bruk mindre filer og prøv igjen.",
        },
        { status: 400 }
      );
    }

    const projectPrefixForFilename = [
      (body.projectNumber ?? submission.projectNumber)?.trim(),
      (body.project ?? submission.project)?.trim(),
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/[/\\:*?"<>|]/g, "")
      .replace(/\s+/g, "_") || "utlegg";
    const filename = `${projectPrefixForFilename}_utlegg.pdf`;
    const pdfUint8 = new Uint8Array(pdfBytes);

    return new NextResponse(pdfUint8, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdfUint8.byteLength),
      },
    });
  } catch (error) {
    console.error("[export-pdf]", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
