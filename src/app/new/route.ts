import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import crypto from "crypto";
import { ADMIN_SUBMITTER_COOKIE } from "@/lib/adminDefaults";

function generateSecureToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export async function GET(request: Request) {
  const accessToken = generateSecureToken();

  const submission = await prisma.submission.create({
    data: { accessToken },
    select: { accessToken: true },
  });

  const response = NextResponse.redirect(
    new URL(`/s/${submission.accessToken}`, request.url)
  );
  response.cookies.delete(ADMIN_SUBMITTER_COOKIE);
  return response;
}
