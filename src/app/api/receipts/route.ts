import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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
