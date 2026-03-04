import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { prisma } from "@/lib/db";

/**
 * GET /api/submissions/[token]/receipts/[receiptId]/blob
 * Streamer et enkelt bilag (bilde eller PDF) for forhåndsvisning.
 * Blob er private – direkte blob-URL gir Forbidden, derfor proxy her.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string; receiptId: string }> }
) {
  const { token, receiptId } = await context.params;
  if (!token || !receiptId) {
    return NextResponse.json({ error: "Missing token or receiptId" }, { status: 400 });
  }

  const submission = await prisma.submission.findUnique({
    where: { accessToken: token },
    include: { receipts: true },
  });

  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  const receipt = submission.receipts.find((r) => r.id === receiptId);
  if (!receipt) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  try {
    const result = await get(receipt.blobUrl, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return NextResponse.json(
        { error: "Kunne ikke hente bilag" },
        { status: 502 }
      );
    }

    const contentType = receipt.mimeType || "application/octet-stream";
    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": "inline",
      },
    });
  } catch (error) {
    console.error("[receipt blob]", error);
    return NextResponse.json(
      { error: "Kunne ikke hente bilag" },
      { status: 500 }
    );
  }
}
