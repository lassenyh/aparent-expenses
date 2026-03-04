import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { prisma } from "@/lib/db";

/**
 * GET /api/submissions/[token]/pdf
 * Streamer den kombinierte PDF-en for et innsendt utlegg.
 * Brukes fordi blob er lastet opp som private – direkte blob-URL gir Forbidden.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const submission = await prisma.submission.findUnique({
    where: { accessToken: token },
    select: { combinedPdfUrl: true, status: true, projectNumber: true, project: true },
  });

  if (!submission?.combinedPdfUrl) {
    return NextResponse.json(
      { error: "PDF ikke funnet eller utlegg ikke sendt inn" },
      { status: 404 }
    );
  }

  const projectPrefixForFilename = [submission.projectNumber?.trim(), submission.project?.trim()]
    .filter(Boolean)
    .join(" ")
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/\s+/g, "_") || "utlegg";
  const pdfFilename = `${projectPrefixForFilename}_utlegg.pdf`;

  try {
    const result = await get(submission.combinedPdfUrl, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return NextResponse.json(
        { error: "Kunne ikke hente PDF" },
        { status: 502 }
      );
    }

    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${pdfFilename}"`,
      },
    });
  } catch (error) {
    console.error("[pdf download]", error);
    return NextResponse.json(
      { error: "Kunne ikke hente PDF" },
      { status: 500 }
    );
  }
}
