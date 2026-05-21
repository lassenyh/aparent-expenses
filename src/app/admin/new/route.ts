import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import {
  ADMIN_SUBMITTER_COOKIE,
  getAdminSubmitterDefaults,
} from "@/lib/adminDefaults";

function generateSecureToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export async function GET(request: Request) {
  const defaults = getAdminSubmitterDefaults();
  if (!defaults) {
    return NextResponse.json(
      {
        error:
          "Admin-modus er ikke konfigurert. Sett ADMIN_SUBMITTER_NAME og ADMIN_SUBMITTER_ACCOUNT (11 sifre) i miljøvariabler.",
      },
      { status: 503 }
    );
  }

  const accessToken = generateSecureToken();
  const submission = await prisma.submission.create({
    data: {
      accessToken,
      name: defaults.name,
      accountNumber: defaults.accountNumber,
      workDate: new Date(),
    },
    select: { accessToken: true },
  });

  const url = new URL(`/s/${submission.accessToken}`, request.url);
  const response = NextResponse.redirect(url);
  response.cookies.set(ADMIN_SUBMITTER_COOKIE, "1", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
