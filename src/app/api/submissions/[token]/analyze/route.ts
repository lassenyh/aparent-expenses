import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { analyzeReceipt } from "@/lib/analyzeReceipt";
import {
  canAnalyzeSubmission,
  receiptNeedsAnalysis,
} from "@/lib/submissionAnalysis";

export const runtime = "nodejs";
export const maxDuration = 60;
import {
  detectSmartComment,
  parseCommentFlags,
  stringifyCommentFlags,
} from "@/lib/receipts/smartComment";
import { SubmissionStatus } from "@prisma/client";

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

export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  try {
    const submission = await prisma.submission.findUnique({
      where: { accessToken: token },
      include: { receipts: true },
    });

    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    if (!canAnalyzeSubmission(submission.status)) {
      return NextResponse.json(
        { error: "Kan bare analysere bilag i DRAFT eller REVIEW" },
        { status: 400 }
      );
    }

    if (submission.receipts.length === 0) {
      return NextResponse.json(
        { error: "No receipts to analyze" },
        { status: 400 }
      );
    }

    const receiptsToAnalyze = submission.receipts.filter(receiptNeedsAnalysis);

    for (const receipt of receiptsToAnalyze) {
      let bytes: Buffer;
      try {
        const result = await get(receipt.blobUrl, { access: "private" });
        if (!result || result.statusCode !== 200 || !result.stream) {
          throw new Error(`Kunne ikke hente ${receipt.originalFileName}`);
        }
        bytes = await streamToBuffer(result.stream);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Kunne ikke analysere ${receipt.originalFileName}: ${reason}`
        );
      }

      const analyzed = await analyzeReceipt(bytes, receipt.mimeType);
      const { flags } = detectSmartComment({
        description: analyzed.summary,
        vendor: receipt.originalFileName,
        extractedText: analyzed.extractedText,
      });
      const dismissed = parseCommentFlags(receipt.dismissedCommentFlags);
      const activeFlags = flags.filter((f) => !dismissed.includes(f));

      await prisma.receipt.update({
        where: { id: receipt.id },
        data: {
          extractedSummary: analyzed.summary,
          extractedTotalCents: analyzed.totalCents,
          extractedCurrency: analyzed.currency ?? "NOK",
          originalAmountCents: analyzed.originalAmountCents ?? undefined,
          commentFlags: stringifyCommentFlags(activeFlags),
        },
      });
    }

    await prisma.submission.update({
      where: { id: submission.id },
      data: { status: SubmissionStatus.REVIEW },
    });

    const updated = await prisma.submission.findUnique({
      where: { id: submission.id },
      include: { receipts: true },
    });

    const serialized = updated
      ? {
          ...updated,
          workDate: updated.workDate?.toISOString() ?? null,
          receipts: updated.receipts,
        }
      : null;

    return NextResponse.json(serialized);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
