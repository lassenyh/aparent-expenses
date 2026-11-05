import { bankConversion, manualConversion } from "@/lib/currency";
import { foreignExchangeProblem } from "@/lib/foreignExchange";
import { receiptRowForClient } from "@/lib/receiptRows";
import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { deleteReceiptPreview } from "@/lib/receiptPreview";
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

    if (!token || receipt.submission.accessToken !== token) {
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
      fxMode?: "bank" | "manual";
      currency?: string;
      originalAmountCents?: number;
      receiptDate?: string;
      note?: string;
      comment?: string | null;
      dismissFlag?: SmartFlag;
      extractedTotalCents?: number | null;
    };
    if (body.fxMode) {
      if (body.fxMode !== "bank" && body.fxMode !== "manual") return NextResponse.json({ error: "Ugyldig valutametode." }, { status: 400 });
      try {
        const currency = String(body.currency ?? receipt.extractedCurrency ?? "").trim().toUpperCase();
        const original = body.originalAmountCents === undefined ? receipt.originalAmountCents : body.originalAmountCents;
        const date = body.receiptDate ?? receipt.receiptDate;
        if (typeof original !== "number" || typeof date !== "string") throw new Error("Kontroller valuta, originalbeløp og kjøpsdato.");
        const fx = body.fxMode === "manual"
          ? manualConversion(currency, original, body.extractedTotalCents as number, date, String(body.note ?? ""))
          : await bankConversion(currency, original, date);
        const saved = await prisma.receipt.updateMany({
          where: { id, submission: { status: { in: ["DRAFT", "REVIEW"] } } },
          data: { foreignExchange: fx, extractedCurrency: currency, originalAmountCents: original, receiptDate: date, extractedTotalCents: fx.nokAmountCents },
        });
        if (!saved.count) return NextResponse.json({ error: "Utlegget kan ikke lenger endres." }, { status: 409 });
        return NextResponse.json(await receiptRowForClient(id));
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Kunne ikke beregne valuta." }, { status: 400 });
      }
    }
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
    if (data.extractedTotalCents !== undefined) {
      const problem = foreignExchangeProblem({ ...receipt, extractedTotalCents: data.extractedTotalCents });
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
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

    if (!token || receipt.submission.accessToken !== token) {
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

    const parts = await prisma.receiptPart.findMany({ where: { receiptId: id } });
    await prisma.receipt.delete({ where: { id } });

    // TODO: Delete blob from Vercel Blob when credentials allow server-side delete.
    // For now we leave the blob; it can be cleaned up by lifecycle policy or manual process.
    try {
      await del(receipt.blobUrl);
    } catch {
      // Ignore blob delete errors (e.g. missing token or blob already gone)
    }
    await deleteReceiptPreview(id);
    for (const part of parts) {
      await del(part.blobUrl).catch(() => {});
      await deleteReceiptPreview(`part-${part.id}`);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
