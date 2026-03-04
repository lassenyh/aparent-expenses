import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { prisma } from "@/lib/db";
import {
  parseCommentFlags,
  stringifyCommentFlags,
  type SmartFlag,
} from "@/lib/receipts/smartComment";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const token = new URL(request.url).searchParams.get("token");

  try {
    const receipt = await prisma.receipt.findUnique({
      where: { id },
      include: {
        submission: { select: { status: true, accessToken: true } },
      },
    });

    if (!receipt) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    if (token && receipt.submission.accessToken !== token) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (
      receipt.submission.status !== "DRAFT" &&
      receipt.submission.status !== "REVIEW"
    ) {
      return NextResponse.json(
        { error: "Cannot update receipt when submission is not DRAFT or REVIEW" },
        { status: 400 }
      );
    }

    const body = (await request.json()) as {
      comment?: string | null;
      dismissFlag?: SmartFlag;
      extractedTotalCents?: number | null;
    };
    const data: {
      comment?: string | null;
      commentFlags?: string;
      dismissedCommentFlags?: string;
      extractedTotalCents?: number | null;
    } = {};
    if (typeof body.comment === "string") {
      data.comment = body.comment.trim() || null;
    } else if (body.comment === null) {
      data.comment = null;
    }
    if (typeof body.extractedTotalCents === "number" && Number.isFinite(body.extractedTotalCents)) {
      data.extractedTotalCents = Math.round(body.extractedTotalCents);
    } else if (body.extractedTotalCents === null) {
      data.extractedTotalCents = null;
    }
    if (body.dismissFlag === "MEAL" || body.dismissFlag === "TRANSPORT") {
      const flags = parseCommentFlags(receipt.commentFlags);
      const dismissed = parseCommentFlags(receipt.dismissedCommentFlags);
      if (!dismissed.includes(body.dismissFlag)) {
        data.dismissedCommentFlags = stringifyCommentFlags([
          ...dismissed,
          body.dismissFlag,
        ]);
      }
      data.commentFlags = stringifyCommentFlags(
        flags.filter((f) => f !== body.dismissFlag)
      );
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(receipt);
    }

    const updated = await prisma.receipt.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const token = new URL(request.url).searchParams.get("token");

  try {
    const receipt = await prisma.receipt.findUnique({
      where: { id },
      include: {
        submission: { select: { status: true, accessToken: true } },
      },
    });

    if (!receipt) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    if (token && receipt.submission.accessToken !== token) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (
      receipt.submission.status !== "DRAFT" &&
      receipt.submission.status !== "REVIEW"
    ) {
      return NextResponse.json(
        { error: "Cannot delete receipt when submission is not DRAFT or REVIEW" },
        { status: 400 }
      );
    }

    await prisma.receipt.delete({ where: { id } });

    // TODO: Delete blob from Vercel Blob when credentials allow server-side delete.
    // For now we leave the blob; it can be cleaned up by lifecycle policy or manual process.
    try {
      await del(receipt.blobUrl);
    } catch {
      // Ignore blob delete errors (e.g. missing token or blob already gone)
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
