import { prisma } from "@/lib/db";
import { canAnalyzeSubmission } from "@/lib/submissionAnalysis";

/**
 * The submission for an access token while its receipts can still change
 * (DRAFT or REVIEW), with the ids of its receipts; null otherwise.
 */
export async function findEditableSubmission(token: string) {
  const submission = await prisma.submission.findUnique({
    where: { accessToken: token },
    select: { id: true, status: true, receipts: { select: { id: true } } },
  });
  if (!submission || !canAnalyzeSubmission(submission.status)) return null;
  return { id: submission.id, receiptIds: new Set(submission.receipts.map((r) => r.id)) };
}
