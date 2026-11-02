import { NextResponse } from "next/server";
import { findEditableSubmission } from "@/lib/editableSubmission";
import { combineReceipts } from "@/lib/receiptParts";
import { receiptRowForClient, uploadListForClient } from "@/lib/receiptRows";

/**
 * POST /api/submissions/[token]/receipts/merge  { targetId, sourceIds }
 * Slår sammen kvitteringer til én: bildene fra sourceIds legges etter targetId i rekkefølge.
 * Kvitteringen må analyseres på nytt etterpå.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const submission = await findEditableSubmission(token);
  if (!submission) {
    return NextResponse.json({ error: "Utlegget finnes ikke eller kan ikke endres" }, { status: 404 });
  }
  const body = (await request.json().catch(() => ({}))) as { targetId?: string; sourceIds?: string[] };
  const sourceIds = Array.isArray(body.sourceIds) ? [...new Set(body.sourceIds)].filter((id) => id !== body.targetId) : [];
  if (!body.targetId || sourceIds.length === 0) {
    return NextResponse.json({ error: "Velg minst to kvitteringer" }, { status: 400 });
  }
  if (![body.targetId, ...sourceIds].every((id) => submission.receiptIds.has(id))) {
    return NextResponse.json({ error: "Kvitteringen finnes ikke i dette utlegget" }, { status: 404 });
  }
  try {
    await combineReceipts(body.targetId, sourceIds);
    return NextResponse.json({
      receipts: await uploadListForClient(submission.id),
      receipt: await receiptRowForClient(body.targetId),
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
