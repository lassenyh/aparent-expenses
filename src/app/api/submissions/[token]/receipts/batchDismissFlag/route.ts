import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  parseCommentFlags,
  stringifyCommentFlags,
  type SmartFlag,
} from "@/lib/receipts/smartComment";

/**
 * POST /api/submissions/[token]/receipts/batchDismissFlag
 * Dismiss a flag for all receipts in the submission that have it.
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
    const submission = await prisma.submission.findUnique({
      where: { accessToken: token },
      include: { receipts: true },
    });

    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    if (submission.status !== "DRAFT" && submission.status !== "REVIEW") {
      return NextResponse.json(
        { error: "Cannot update when submission is not DRAFT or REVIEW" },
        { status: 400 }
      );
    }

    const body = (await request.json()) as { flag?: SmartFlag };
    const flag = body.flag;
    if (flag !== "MEAL" && flag !== "TRANSPORT") {
      return NextResponse.json(
        { error: "Invalid flag; use MEAL or TRANSPORT" },
        { status: 400 }
      );
    }

    let updated = 0;
    for (const receipt of submission.receipts) {
      const flags = parseCommentFlags(receipt.commentFlags);
      if (!flags.includes(flag)) continue;
      const dismissed = parseCommentFlags(receipt.dismissedCommentFlags);
      if (dismissed.includes(flag)) continue;
      await prisma.receipt.update({
        where: { id: receipt.id },
        data: {
          commentFlags: stringifyCommentFlags(flags.filter((f) => f !== flag)),
          dismissedCommentFlags: stringifyCommentFlags([...dismissed, flag]),
        },
      });
      updated++;
    }

    return NextResponse.json({ updated });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
