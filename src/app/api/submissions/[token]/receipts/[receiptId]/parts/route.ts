import { NextResponse } from "next/server";
import { findEditableSubmission } from "@/lib/editableSubmission";
import { addReceiptPart } from "@/lib/receiptParts";
import { receiptRowForClient, uploadListForClient } from "@/lib/receiptRows";

/**
 * POST /api/submissions/[token]/receipts/[receiptId]/parts
 * Legger et opplastet bilde til på slutten av en kvittering (lange kvitteringer i flere bilder).
 * Kvitteringen må analyseres på nytt etterpå.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ token: string; receiptId: string }> }
) {
  const { token, receiptId } = await context.params;
  const submission = await findEditableSubmission(token);
  if (!submission || !submission.receiptIds.has(receiptId)) {
    return NextResponse.json({ error: "Kvitteringen finnes ikke eller kan ikke endres" }, { status: 404 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    originalFileName?: string;
    mimeType?: string;
    sizeBytes?: number;
    blobUrl?: string;
    blobPath?: string;
  };
  if (!body.originalFileName || !body.mimeType || typeof body.sizeBytes !== "number" || !body.blobUrl || !body.blobPath) {
    return NextResponse.json({ error: "Mangler filinformasjon" }, { status: 400 });
  }
  if (!/^(image\/|application\/pdf)/i.test(body.mimeType)) {
    return NextResponse.json({ error: "Bare bilder og PDF kan legges til" }, { status: 400 });
  }
  try {
    await addReceiptPart(receiptId, {
      originalFileName: body.originalFileName,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
      blobUrl: body.blobUrl,
      blobPath: body.blobPath,
    });
    return NextResponse.json({
      receipts: await uploadListForClient(submission.id),
      receipt: await receiptRowForClient(receiptId),
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
