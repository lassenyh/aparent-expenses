import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { analyzeReceipt } from "@/lib/analyzeReceipt";
import {
  detectSmartComment,
  parseCommentFlags,
  stringifyCommentFlags,
} from "@/lib/receipts/smartComment";

export const maxDuration = 60;

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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      token?: string;
      originalFileName?: string;
      mimeType?: string;
      sizeBytes?: number;
      blobUrl?: string;
      blobPath?: string;
    };

    const {
      token,
      originalFileName,
      mimeType,
      sizeBytes,
      blobUrl,
      blobPath,
    } = body;

    if (
      !token ||
      !originalFileName ||
      !mimeType ||
      typeof sizeBytes !== "number" ||
      !blobUrl ||
      !blobPath
    ) {
      return NextResponse.json(
        { error: "Missing required fields: token, originalFileName, mimeType, sizeBytes, blobUrl, blobPath" },
        { status: 400 }
      );
    }

    const submission = await prisma.submission.findUnique({
      where: { accessToken: token },
      select: { id: true, status: true },
    });

    if (
      !submission ||
      (submission.status !== "DRAFT" && submission.status !== "REVIEW")
    ) {
      return NextResponse.json(
        { error: "Submission not found or not in DRAFT/REVIEW" },
        { status: 404 }
      );
    }

    const receipt = await prisma.receipt.create({
      data: {
        submissionId: submission.id,
        originalFileName,
        mimeType,
        sizeBytes,
        blobUrl,
        blobPath,
      },
    });

    // Analyse kvitteringen med én gang så "Gå videre" blir rask
    try {
      const result = await get(blobUrl, { access: "private" });
      if (result?.statusCode === 200 && result.stream) {
        const bytes = await streamToBuffer(result.stream);
        const analyzed = await analyzeReceipt(bytes, mimeType);
        const { flags } = detectSmartComment({
          description: analyzed.summary,
          vendor: originalFileName,
          extractedText: analyzed.extractedText,
        });
        const dismissed = parseCommentFlags(null);
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
    } catch {
      // La kvitteringen stå uanalysert; /analyze tar den ved "Gå videre"
    }

    const receipts = await prisma.receipt.findMany({
      where: { submissionId: submission.id },
      select: {
        id: true,
        originalFileName: true,
        mimeType: true,
        sizeBytes: true,
        blobUrl: true,
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      receipt: {
        id: receipt.id,
        originalFileName: receipt.originalFileName,
        mimeType: receipt.mimeType,
        sizeBytes: receipt.sizeBytes,
        blobUrl: receipt.blobUrl,
      },
      receipts,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
