import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzeAndStoreReceipt, loadReceiptFiles } from "@/lib/analyzeStoredReceipt";
import { receiptRowForClient } from "@/lib/receiptRows";
import {
  canAnalyzeSubmission,
  receiptNeedsAnalysis,
} from "@/lib/submissionAnalysis";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/submissions/[token]/receipts/[receiptId]/analyze
 * Analyserer én kvittering rett etter opplasting, mens brukeren fortsatt er på
 * opplastingssiden. Gjør ingenting hvis kvitteringen allerede er analysert, og
 * endrer ikke status; det gjør /analyze når brukeren går videre.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string; receiptId: string }> }
) {
  const { token, receiptId } = await context.params;

  try {
    const receipt = await prisma.receipt.findUnique({
      where: { id: receiptId },
      include: { submission: { select: { accessToken: true, status: true } } },
    });
    if (!receipt || receipt.submission.accessToken !== token) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }
    if (!canAnalyzeSubmission(receipt.submission.status)) {
      return NextResponse.json(
        { error: "Kan bare analysere bilag i DRAFT eller REVIEW" },
        { status: 400 }
      );
    }
    if (receiptNeedsAnalysis(receipt)) {
      const files = await loadReceiptFiles(receipt);
      if (!files) {
        return NextResponse.json(
          { error: `Kunne ikke hente ${receipt.originalFileName}` },
          { status: 502 }
        );
      }
      await analyzeAndStoreReceipt(receipt, files);
    }
    const row = await receiptRowForClient(receipt.id);
    if (!row) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    return NextResponse.json({ id: receipt.id, analyzed: row.extractedSummary != null, receipt: row });
  } catch (error) {
    // The receipt may have been deleted while it was being analysed.
    const stillExists = await prisma.receipt
      .count({ where: { id: receiptId } })
      .catch(() => 1);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: stillExists ? 500 : 404 }
    );
  }
}
