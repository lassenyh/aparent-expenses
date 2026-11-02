import { NextResponse } from "next/server";
import { findEditableSubmission } from "@/lib/editableSubmission";
import { splitReceipt } from "@/lib/receiptParts";
import { uploadListForClient } from "@/lib/receiptRows";

/**
 * POST /api/submissions/[token]/receipts/[receiptId]/split
 * Gjør hvert ekstra bilde av en kvittering til en egen kvittering igjen.
 * Alle de berørte kvitteringene må analyseres på nytt etterpå.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string; receiptId: string }> }
) {
  const { token, receiptId } = await context.params;
  const submission = await findEditableSubmission(token);
  if (!submission || !submission.receiptIds.has(receiptId)) {
    return NextResponse.json({ error: "Kvitteringen finnes ikke eller kan ikke endres" }, { status: 404 });
  }
  try {
    await splitReceipt(receiptId);
    return NextResponse.json({ receipts: await uploadListForClient(submission.id) });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
