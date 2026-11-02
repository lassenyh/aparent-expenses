"use server";

import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_SUBMITTER_COOKIE } from "@/lib/adminDefaults";
import { prisma } from "@/lib/db";

/**
 * Starts a claim for the project, with its number and name filled in and fixed. A closed
 * project starts an ordinary claim instead, where the freelancer types the project in.
 */
export async function startProjectClaim(code: string) {
  const project = await prisma.project.findUnique({ where: { code } });
  if (!project) redirect(`/p/${code}`);

  const accessToken = crypto.randomBytes(32).toString("base64url");
  const submission = await prisma.submission.create({
    data: project.closedAt
      ? { accessToken }
      : { accessToken, projectId: project.id, projectNumber: project.number, project: project.name },
    select: { accessToken: true },
  });
  // As /new: a freelancer's claim must not pick up the admin's own-claim defaults.
  (await cookies()).delete(ADMIN_SUBMITTER_COOKIE);
  redirect(`/s/${submission.accessToken}`);
}
