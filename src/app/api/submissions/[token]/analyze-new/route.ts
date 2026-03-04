import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { analyzeReceipt } from "@/lib/analyzeReceipt";
import {
  detectSmartComment,
  parseCommentFlags,
  stringifyCommentFlags,
} from "@/lib/receipts/smartComment";

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

    for (const receipt of toAnalyze) {
      let bytes: Buffer;
      try {
        const result = await get(receipt.blobUrl, { access: "private" });
        if (!result || result.statusCode !== 200 || !result.stream) {
          continue;
        }
        bytes = await streamToBuffer(result.stream);
      } catch {
        continue;
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
