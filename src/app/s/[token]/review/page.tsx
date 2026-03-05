import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ReviewEditor } from "./ReviewEditor";

type Params = { token: string };
type PageProps = {
  params: Params | Promise<Params>;
};

export default async function ReviewPage(props: PageProps) {
  const { token } = await props.params;

  if (!token) return notFound();

  const submission = await prisma.submission.findUnique({
    where: { accessToken: token },
    include: { receipts: { orderBy: { createdAt: "asc" } } },
  });

  if (!submission) return notFound();

  if (submission.status === "DRAFT") {
    const draftBgImages = [
      "/background-1.jpg", "/background-2.jpg", "/background-3.jpg",
      "/background-4.jpg", "/background-5.jpg", "/background-6.jpg",
      "/background-7.jpg", "/background-8.jpg", "/background-9.jpg", "/background-10.jpg",
    ];
    const draftBg = draftBgImages[Math.floor(Math.random() * draftBgImages.length)] ?? draftBgImages[0];
    return (
      <main
        className="relative min-h-screen bg-neutral-950 bg-cover bg-center bg-no-repeat text-white p-10"
        style={{ backgroundImage: `url(${draftBg})` }}
      >
        <div className="absolute inset-0 bg-neutral-950/85" aria-hidden />
        <div className="relative z-10 mx-auto max-w-4xl">
          <h1 className="text-2xl font-semibold mb-6">Gjennomgang og innsending</h1>
          <p className="text-neutral-400">
            Last opp kvitteringer først og klikk «Opplast» for å gå videre.
          </p>
          <a
            href={`/s/${token}`}
            className="mt-4 inline-block rounded-lg bg-neutral-700 px-4 py-2 text-sm text-white hover:bg-neutral-600"
          >
            Tilbake til opplasting
          </a>
        </div>
      </main>
    );
  }

  if (submission.status === "SUBMITTED") {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-neutral-950 text-white p-10">
        {/* Videobakgrunn for siste side – fil: public/background-success.mp4 */}
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
          aria-hidden
        >
          <source src="/background-success.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-neutral-950/5" aria-hidden />
        <div className="relative z-10 flex w-full max-w-2xl flex-col items-center text-center">
          <img
            src="/logo.png"
            alt="Logo"
            className="-mt-4 mb-12 h-12 w-auto max-w-[180px] object-contain"
          />
          <p className="mb-6 text-xl font-semibold text-green-400">
            Utlegget er sendt inn. Vennligst last ned PDF for egen kopi.
          </p>
          <div className="mb-6 flex flex-wrap justify-center gap-3">
            <a
              href={`/api/submissions/${token}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-600"
            >
              Last ned PDF
            </a>
            <a
              href="/new"
              className="inline-block rounded-lg border border-neutral-600 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-700"
            >
              Nytt oppgjør
            </a>
          </div>
          <p className="text-sm text-neutral-400">
            Har du spørsmål vedrørende utlegg, kan disse rettes til{" "}
            <a
              href="mailto:utlegg@aparent.tv"
              className="text-neutral-300 underline hover:text-white"
            >
              utlegg@aparent.tv
            </a>
          </p>
        </div>
      </main>
    );
  }

  const backgroundImages = [
    "/background-1.jpg",
    "/background-2.jpg",
    "/background-3.jpg",
    "/background-4.jpg",
    "/background-5.jpg",
    "/background-6.jpg",
    "/background-7.jpg",
    "/background-8.jpg",
    "/background-9.jpg",
    "/background-10.jpg",
  ];
  const randomBg =
    backgroundImages[Math.floor(Math.random() * backgroundImages.length)] ?? backgroundImages[0];

  const initialData = {
    status: submission.status,
    name: submission.name,
    projectNumber: submission.projectNumber,
    project: submission.project,
    workDate: submission.workDate?.toISOString() ?? null,
    accountNumber: submission.accountNumber,
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
    })),
  };

  return (
    <main
      className="relative min-h-screen bg-neutral-950 bg-cover bg-center bg-no-repeat text-white p-10"
      style={{ backgroundImage: `url(${randomBg})` }}
    >
      <div className="absolute inset-0 bg-neutral-950/85" aria-hidden />
      <div className="relative z-10 mx-auto max-w-4xl">
        <div className="mb-6 flex flex-col items-center gap-2 md:flex-row md:items-start md:justify-between md:gap-4">
          <img
            src="/logo.png"
            alt="Logo"
            className="h-10 w-auto max-w-[140px] shrink-0 object-contain"
          />
          <h1 className="text-xl font-semibold text-center whitespace-nowrap md:text-2xl md:text-left">
            Gjennomgang og innsending
          </h1>
        </div>
        <ReviewEditor initialData={initialData} token={token} />
      </div>
    </main>
  );
}
