export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { get, put } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { SubmissionStatus } from "@prisma/client";
import { Resend } from "resend";
import { renderExpensePdfHtml } from "@/lib/pdf/renderExpensePdfHtml";
import { htmlToPdf } from "@/lib/pdf/htmlToPdf";
import { appendReceiptPages } from "@/lib/pdf/appendReceiptPages";

const ACCOUNT_NUMBER_LENGTH = 11;

/** Maksimal størrelse for den endelige PDF-en (10 MB). */
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

function sanitizeAccountNumber(value: string | undefined | null): string | null {
  if (value == null || value === "") return null;
  const digits = value.replace(/\D/g, "");
  return digits.length === ACCOUNT_NUMBER_LENGTH ? digits : null;
}

function getBaseUrl(request: Request): string {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  try {
    const url = new URL(request.url);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "http://localhost:3000";
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    return NextResponse.json(
      { error: "ADMIN_EMAIL not configured" },
      { status: 500 }
    );
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
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    if (submission.status !== "REVIEW") {
      return NextResponse.json(
        { error: "Submission is not in REVIEW" },
        { status: 400 }
      );
    }

    const accountNumber = sanitizeAccountNumber(body.accountNumber);
    if (body.accountNumber != null && body.accountNumber !== "" && !accountNumber) {
      return NextResponse.json(
        { error: "Kontonummer må være 11 sifre" },
        { status: 400 }
      );
    }

    const productionCashCents =
      body.productionCash != null
        ? Math.round(Number(body.productionCash) * 100)
        : submission.productionCash != null
          ? submission.productionCash * 100
          : 0;

    if (body.receipts?.length) {
      for (const r of body.receipts) {
        if (r.extractedTotalCents == null) {
          return NextResponse.json(
            { error: `Kvittering må ha beløp: ${r.id}` },
            { status: 400 }
          );
        }
        await prisma.receipt.update({
          where: { id: r.id },
          data: {
            extractedSummary: r.extractedSummary ?? undefined,
            extractedTotalCents: r.extractedTotalCents,
            comment: r.comment !== undefined ? r.comment : undefined,
          },
        });
      }
    }

    await prisma.submission.update({
      where: { id: submission.id },
      data: {
        name: body.name ?? submission.name,
        projectNumber: body.projectNumber ?? submission.projectNumber,
        project: body.project ?? submission.project,
        workDate: body.workDate
          ? new Date(body.workDate)
          : submission.workDate,
        accountNumber: accountNumber ?? submission.accountNumber,
        productionCash: Math.round(productionCashCents / 100),
      },
    });

    const updated = await prisma.submission.findUnique({
      where: { id: submission.id },
      include: { receipts: { orderBy: { createdAt: "asc" } } },
    });

    if (!updated || updated.receipts.length === 0) {
      return NextResponse.json(
        { error: "No receipts" },
        { status: 400 }
      );
    }

    const totalCents = updated.receipts.reduce(
      (s, r) => s + (r.extractedTotalCents ?? 0),
      0
    );
    const diffCents = totalCents - productionCashCents;

    const pdfHtml = await renderExpensePdfHtml({
      submission: {
        name: updated.name,
        projectNumber: updated.projectNumber,
        project: updated.project,
        workDate: updated.workDate?.toISOString() ?? null,
        accountNumber: updated.accountNumber,
        productionCashCents,
      },
      receipts: updated.receipts.map((r) => ({
        summary: r.extractedSummary ?? "Kvittering",
        amountCents: r.extractedTotalCents ?? 0,
        date: updated.workDate?.toISOString() ?? null,
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

    const receiptsForAppend = updated.receipts.map((r) => ({
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

    const pathname = `submissions/${updated.id}/combined.pdf`;
    const blob = await put(pathname, Buffer.from(pdfBytes), {
      access: "private",
      contentType: "application/pdf",
      addRandomSuffix: false,
    });

    await prisma.submission.update({
      where: { id: updated.id },
      data: {
        combinedPdfUrl: blob.url,
        status: SubmissionStatus.SUBMITTED,
      },
    });

    const baseUrl = getBaseUrl(request);
    const pdfDownloadUrl = `${baseUrl}/api/submissions/${token}/pdf`;

    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        const resend = new Resend(resendKey);
        const diffLabel =
          diffCents > 0
            ? "Til utbetaling (Aparent skylder deg)"
            : diffCents < 0
              ? "Tilbakebetaling (du skylder Aparent)"
              : "I balanse";
        const fromAddress =
          process.env.RESEND_FROM ?? "Utlegg <onboarding@resend.dev>";
        const projectPrefix = [updated.projectNumber?.trim(), updated.project?.trim()]
          .filter(Boolean)
          .join(" – ");
        const projectPrefixForFilename = [updated.projectNumber?.trim(), updated.project?.trim()]
          .filter(Boolean)
          .join(" ")
          .replace(/[/\\:*?"<>|]/g, "")
          .replace(/\s+/g, "_") || "utlegg";
        const subjectParts = projectPrefix ? [projectPrefix, updated.name?.trim()].filter(Boolean) : [updated.name?.trim()].filter(Boolean);
        const subject = subjectParts.length > 0 ? subjectParts.join(" – ") : "Utlegg";
        const pdfAttachment = {
          filename: `${projectPrefixForFilename}_utlegg.pdf`,
          content: Buffer.from(pdfBytes).toString("base64"),
        };
        const { data, error } = await resend.emails.send({
          from: fromAddress,
          to: adminEmail,
          subject,
          html: `
          <p><strong>Navn:</strong> ${updated.name ?? "—"}</p>
          <p><strong>Prosjekt:</strong> ${projectPrefix || "—"}</p>
          <p><strong>Total:</strong> ${(totalCents / 100).toFixed(2)} kr</p>
          <p><strong>Produksjonskasse:</strong> ${(productionCashCents / 100).toFixed(2)} kr</p>
          <p><strong>${diffLabel}:</strong> ${(diffCents / 100).toFixed(2)} kr</p>
          <p>PDF er vedlagt. Du kan også <a href="${pdfDownloadUrl}">laste ned her</a>.</p>
        `,
          attachments: [pdfAttachment],
        });
        if (error) {
          console.error("[submit] Resend e-post feilet:", error);
        } else {
          console.log("[submit] E-post sendt til", adminEmail, "id:", data?.id);
        }
      } catch (emailErr) {
        console.error("[submit] E-post send kastet:", emailErr);
      }
    } else {
      console.warn("[submit] RESEND_API_KEY er ikke satt – e-post ble ikke sendt.");
    }

    return NextResponse.json({ combinedPdfUrl: pdfDownloadUrl });
  } catch (error) {
    console.error("[submit]", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
