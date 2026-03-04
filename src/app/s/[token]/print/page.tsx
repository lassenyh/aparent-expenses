import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  ExpensePdfLayout,
  type ExpensePdfSubmission,
  type ExpensePdfReceipt,
  type ExpensePdfTotals,
} from "@/components/pdf/ExpensePdfLayout";

type Params = { token: string };
type PageProps = { params: Params | Promise<Params> };

export default async function PrintPreviewPage(props: PageProps) {
  const { token } = await props.params;

  if (!token) return notFound();

  const submission = await prisma.submission.findUnique({
    where: { accessToken: token },
    include: { receipts: { orderBy: { createdAt: "asc" } } },
  });

  if (!submission) return notFound();

  if (submission.status === "DRAFT") {
    return (
      <main className="min-h-screen bg-neutral-950 p-10 text-white">
        <p className="text-neutral-400">
          Fullfør gjennomgang og send inn utlegg først, eller bruk
          forhåndsvisning med demo-data.
        </p>
        <a
          href={`/s/${token}/review`}
          className="mt-4 inline-block text-neutral-300 underline"
        >
          Tilbake til gjennomgang
        </a>
      </main>
    );
  }

  const productionCashCents =
    (submission.productionCash ?? 0) * 100;
  const totalCents =
    submission.receipts.reduce(
      (s, r) => s + (r.extractedTotalCents ?? 0),
      0
    );
  const diffCents = totalCents - productionCashCents;

  const pdfSubmission: ExpensePdfSubmission = {
    name: submission.name,
    projectNumber: submission.projectNumber,
    project: submission.project,
    workDate: submission.workDate?.toISOString() ?? null,
    accountNumber: submission.accountNumber,
    productionCashCents,
  };

  const pdfReceipts: ExpensePdfReceipt[] = submission.receipts.map((r) => ({
    summary: r.extractedSummary ?? "Kvittering",
    amountCents: r.extractedTotalCents ?? 0,
    date: submission.workDate?.toISOString() ?? null,
    comment: r.comment ?? null,
  }));

  const pdfTotals: ExpensePdfTotals = {
    totalCents,
    productionCashCents,
    diffCents,
  };

  return (
    <main className="min-h-screen bg-white">
      <ExpensePdfLayout
        submission={pdfSubmission}
        receipts={pdfReceipts}
        totals={pdfTotals}
      />
    </main>
  );
}
