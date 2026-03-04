import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const ALLOWED_MIME_PREFIXES = ["image/", "application/pdf"];
const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIME_PREFIXES.some((p) => mime.toLowerCase().startsWith(p));
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let token: string | null = null;
        let originalFileName = pathname;
        let mimeType = "application/octet-stream";
        let sizeBytes = 0;

        if (clientPayload) {
          try {
            const payload = JSON.parse(clientPayload) as {
              token?: string;
              originalFileName?: string;
              mimeType?: string;
              sizeBytes?: number;
            };
            token = payload.token ?? null;
            if (payload.originalFileName) originalFileName = payload.originalFileName;
            if (payload.mimeType) mimeType = payload.mimeType;
            if (typeof payload.sizeBytes === "number") sizeBytes = payload.sizeBytes;
          } catch {
            return { allowedContentTypes: [] };
          }
        }

        if (!token) {
          return { allowedContentTypes: [] };
        }

        const submission = await prisma.submission.findUnique({
          where: { accessToken: token },
          select: { id: true, status: true },
        });

        if (
          !submission ||
          (submission.status !== "DRAFT" && submission.status !== "REVIEW")
        ) {
          return { allowedContentTypes: [] };
        }

        if (!isAllowedMime(mimeType)) {
          return { allowedContentTypes: [] };
        }

        if (sizeBytes > MAX_SIZE_BYTES) {
          return { allowedContentTypes: [], maximumSizeInBytes: 0 };
        }

        return {
          allowedContentTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "image/heic",
            "application/pdf",
          ],
          maximumSizeInBytes: MAX_SIZE_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            token,
            originalFileName,
            mimeType,
            sizeBytes,
          }),
        };
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
