import { forEachConcurrent } from "@/lib/forEachConcurrent";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ANALYSIS_CONCURRENCY } from "@/lib/submissionAnalysis";
import { analyzeAndStoreReceipt, loadReceiptFiles } from "@/lib/analyzeStoredReceipt";

/**
 * POST /api/submissions/[token]/analyze-new
 * Analyser kun kvitteringer som mangler extractedSummary (nye bilag lagt til på gjennomgangssiden).
 * Endrer ikke status. Returnerer oppdatert submission med alle receipts.
 */
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
      include: { receipts: { orderBy: { createdAt: "asc" } } },
    });

    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    if (submission.status !== "REVIEW" && submission.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Kan bare analysere nye bilag i DRAFT eller REVIEW" },
        { status: 400 }
      );
    }

    const toAnalyze = submission.receipts.filter(
      (r) => r.extractedSummary == null
    );
    if (toAnalyze.length === 0) {
      const updated = await prisma.submission.findUnique({
        where: { id: submission.id },
        include: { receipts: { orderBy: { createdAt: "asc" } } },
      });
      return NextResponse.json(
        updated
          ? {
              ...updated,
              workDate: updated.workDate?.toISOString() ?? null,
              receipts: updated.receipts,
            }
          : null
      );
    }

    await forEachConcurrent(toAnalyze, ANALYSIS_CONCURRENCY, async (receipt) => {
      let files: Awaited<ReturnType<typeof loadReceiptFiles>>;
      try {
        files = await loadReceiptFiles(receipt);
      } catch {
        return;
      }
      if (!files) return;
      await analyzeAndStoreReceipt(receipt, files);
    });

    const updated = await prisma.submission.findUnique({
      where: { id: submission.id },
      include: { receipts: { orderBy: { createdAt: "asc" } } },
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
