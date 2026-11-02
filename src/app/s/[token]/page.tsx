
import { T } from "@/components/LanguageProvider";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getInitialSubmissionInfo } from "@/lib/submissionInfo";
import { AppHeader } from "@/components/AppHeader";
import { UploadStep } from "./UploadStep";

type Params = { token: string };
type PageProps = {
  params: Promise<Params>;
};

export default async function SubmissionPage(props: PageProps) {
  const { token } = await props.params;

  if (!token) return notFound();

  const submission = await prisma.submission.findUnique({
    where: { accessToken: token },
    include: {
      receipts: {
        orderBy: { createdAt: "asc" },
        include: {
          parts: {
            orderBy: { position: "asc" },
            select: { id: true, mimeType: true, originalFileName: true },
          },
        },
      },
    },
  });

  if (!submission) return notFound();

  if (submission.status === "REVIEW" || submission.status === "SUBMITTED") {
    redirect(`/s/${token}/review`);
  }

  const receipts = submission.receipts.map((r) => ({
    id: r.id,
    originalFileName: r.originalFileName,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    blobUrl: r.blobUrl,
    analyzed: r.extractedSummary != null,
    contentHash: r.contentHash,
    merchant: r.merchant,
    receiptDate: r.receiptDate,
    extractedTotalCents: r.extractedTotalCents,
    parts: r.parts,
  }));

  const initialInfo = await getInitialSubmissionInfo(submission);

  return (
    <main className="flex flex-col">
      <AppHeader step="Steg 1 av 2" />
      <div className="px-4 pb-12 pt-2 md:px-8 md:pt-6">
        <div className="mx-auto w-full max-w-[640px] min-w-0">
          <div className="mb-5">
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink"><T>{"Last opp dine kvitteringer"}</T></h1>
            <p className="mt-1 text-sm text-muted"><T>{"Utleggsskjemaet fylles ut automatisk før det sendes til produsent."}</T></p>
            <p className="mt-1 text-[13px] text-muted"><T>{"Sørg for at beskrivelsen av kvitteringen matcher kjøpet før du sender inn."}</T></p>
          </div>
          <UploadStep
            token={token}
            receipts={receipts}
            initialInfo={initialInfo}
            projectLocked={submission.projectId != null}
          />
        </div>
      </div>
    </main>
  );
}
