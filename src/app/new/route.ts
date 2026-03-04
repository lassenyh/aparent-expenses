import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import crypto from "crypto";

function generateSecureToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export async function GET() {
  const accessToken = generateSecureToken();

  const submission = await prisma.submission.create({
    data: { accessToken },
    select: { accessToken: true },
  });

  redirect(`/s/${submission.accessToken}`);
}
