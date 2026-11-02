import { forEachConcurrent } from "@/lib/forEachConcurrent";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzeAndStoreReceipt, readReceiptBlob } from "@/lib/analyzeStoredReceipt";
import {
  ANALYSIS_CONCURRENCY,
  canAnalyzeSubmission,
  receiptNeedsAnalysis,
} from "@/lib/submissionAnalysis";
import { SubmissionStatus } from "@prisma/client";

export const runtime = "nodejs";
export const maxDuration = 60;

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

    await forEachConcurrent(receiptsToAnalyze, ANALYSIS_CONCURRENCY, async (receipt) => {
      let bytes: Buffer | null;
      try {
        bytes = await readReceiptBlob(receipt.blobUrl);
        if (!bytes) throw new Error(`Kunne ikke hente ${receipt.originalFileName}`);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Kunne ikke analysere ${receipt.originalFileName}: ${reason}`
        );
      }
      await analyzeAndStoreReceipt(receipt, bytes);
    });

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
