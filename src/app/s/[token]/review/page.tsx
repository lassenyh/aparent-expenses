import { AppHeader } from "@/components/AppHeader";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminSubmitterDefaults } from "@/lib/adminDefaults";
import { isAdminSubmitterFlow } from "@/lib/adminSubmitterCookie";
import { ReviewEditor } from "./ReviewEditor";

type Params = { token: string };

function formatNok(cents: number): string {
  return `${new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100)} kr`;
}

function diffLabel(diffCents: number): string {
  if (diffCents > 0) return "Til utbetaling (Aparent skylder deg)";
  if (diffCents < 0) return "Tilbakebetaling (du skylder Aparent)";
  return "I balanse";
}

function formatSentAt(date: Date): string {
  const day = date.toLocaleDateString("nb-NO", { timeZone: "Europe/Oslo", day: "numeric", month: "long", year: "numeric" });
  const time = date.toLocaleTimeString("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" });
  return `${day} kl. ${time}`;
}
type PageProps = {
  params: Promise<Params>;
};

export default async function ReviewPage(props: PageProps) {
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

  if (submission.status === "DRAFT") {
    return (
      <main className="flex flex-col">
        <AppHeader />
        <div className="px-4 pb-12 pt-2 md:px-8 md:pt-6">
          <section className="mx-auto w-full max-w-[640px] rounded-lg border border-line bg-surface p-6">
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">Gjennomgang og innsending</h1>
            <p className="mt-2 text-sm text-muted">
              Last opp kvitteringer først og klikk «Opplast» for å gå videre.
            </p>
            <a
              href={`/s/${token}`}
              className="mt-4 inline-flex h-9 items-center rounded-md bg-secondary px-4 text-sm font-medium text-ink hover:bg-secondary-hover"
            >
              Tilbake til opplasting
            </a>
          </section>
        </div>
      </main>
    );
  }

  if (submission.status === "SUBMITTED") {
    const adminFlow = await isAdminSubmitterFlow();
    const newSubmissionHref = adminFlow ? "/admin/new" : "/new";
    const totalCents = submission.receipts.reduce((sum, r) => sum + (r.extractedTotalCents ?? 0), 0);
    const cashCents = submission.productionCashCents ?? (submission.productionCash ?? 0) * 100;
    const diffCents = totalCents - cashCents;
    const sentAt = submission.deliveryStartedAt ?? submission.submissionStartedAt;
    const project = [submission.projectNumber?.trim(), submission.project?.trim()].filter(Boolean).join(" – ");
    return (
      <main className="flex flex-col">
        <AppHeader />
        <div className="px-4 pb-12 pt-2 md:px-8 md:pt-6">
          <div className="mx-auto w-full max-w-[640px] space-y-4">
            <section className="grid gap-5 rounded-lg border border-line bg-surface p-7" aria-labelledby="done-title">
              {sentAt && (
                <p className="flex items-center gap-2 text-[13px] font-medium text-pos">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
                    <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
                  </svg>
                  Sendt inn {formatSentAt(sentAt)}
                </p>
              )}
              <div>
                <h1 id="done-title" className="text-[28px] font-semibold tracking-[-0.02em] text-ink">
                  Utlegget er sendt inn
                </h1>
                <p className="mt-1.5 text-sm text-muted">Vennligst last ned PDF for egen kopi.</p>
              </div>
              <dl className="grid gap-2 rounded-lg bg-ground p-4 text-sm">
                {project && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Prosjekt</dt>
                    <dd className="text-right text-ink">{project}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Bilag</dt>
                  <dd className="text-ink">{submission.receipts.length}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Total</dt>
                  <dd className="text-ink">{formatNok(totalCents)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Produksjonskasse</dt>
                  <dd className="text-ink">{formatNok(cashCents)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-t border-rule pt-2">
                  <dt className="text-muted">{diffLabel(diffCents)}</dt>
                  <dd className={`whitespace-nowrap text-[26px] font-bold tracking-[-0.02em] ${diffCents < 0 ? "text-neg" : "text-data"}`}>
                    {formatNok(diffCents)}
                  </dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`/api/submissions/${token}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover"
                >
                  Last ned PDF
                </a>
                <a
                  href={newSubmissionHref}
                  className="inline-flex h-9 items-center rounded-md bg-secondary px-4 text-sm font-medium text-ink hover:bg-secondary-hover"
                >
                  Nytt oppgjør
                </a>
              </div>
            </section>
            <p className="text-[13px] text-muted">
              Har du spørsmål vedrørende utlegg, kan disse rettes til{" "}
              <a href="mailto:utlegg@aparent.tv" className="text-ink underline underline-offset-2">
                utlegg@aparent.tv
              </a>
            </p>
          </div>
        </div>
      </main>
    );
  }

  const adminFlow = await isAdminSubmitterFlow();
  const adminDefaults = adminFlow ? getAdminSubmitterDefaults() : null;

  const initialData = {
    status: submission.status,
    name: submission.name ?? adminDefaults?.name ?? null,
    projectNumber: submission.projectNumber,
    project: submission.project,
    projectLocked: submission.projectId != null,
    workDate: submission.workDate?.toISOString() ?? null,
    accountNumber: submission.accountNumber ?? adminDefaults?.accountNumber ?? null,
    productionCash: submission.productionCash,
    combinedPdfUrl: submission.combinedPdfUrl,
    receipts: submission.receipts.map((r) => ({
      id: r.id,
      originalFileName: r.originalFileName,
      extractedSummary: r.extractedSummary,
      extractedTotalCents: r.extractedTotalCents,
      extractedCurrency: r.extractedCurrency ?? null,
      originalAmountCents: r.originalAmountCents ?? null,
      blobUrl: r.blobUrl,
      mimeType: r.mimeType,
      comment: r.comment,
      commentFlags: r.commentFlags ?? null,
      dismissedCommentFlags: r.dismissedCommentFlags ?? null,
      merchant: r.merchant ?? null,
      receiptDate: r.receiptDate ?? null,
      contentHash: r.contentHash ?? null,
      parts: r.parts,
    })),
  };

  return (
    <main className="flex flex-col">
      <AppHeader logoHref={`/s/${token}/upload`} step="Steg 2 av 2" />
      <div className="px-4 pt-2 md:px-8 md:pt-4">
        <div className="mx-auto w-full max-w-6xl">
          <div className="mb-5">
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">Gjennomgang og innsending</h1>
            {adminFlow && (
              <p className="mt-1.5 inline-block rounded-full bg-pill px-2 py-px text-[12.5px] text-pill-ink">
                Admin-modus (navn og konto forhåndsutfylt)
              </p>
            )}
          </div>
          <ReviewEditor initialData={initialData} token={token} />
        </div>
      </div>
    </main>
  );
}
