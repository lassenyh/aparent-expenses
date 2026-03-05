import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { UploadStep } from "./UploadStep";

type Params = { token: string };
type PageProps = {
  params: Params | Promise<Params>;
};

export default async function SubmissionPage(props: PageProps) {
  const { token } = await props.params;

  if (!token) return notFound();

  const submission = await prisma.submission.findUnique({
    where: { accessToken: token },
    include: { receipts: { orderBy: { createdAt: "asc" } } },
  });

  if (!submission) return notFound();

  const receipts = submission.receipts.map((r) => ({
    id: r.id,
    originalFileName: r.originalFileName,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    blobUrl: r.blobUrl,
  }));

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
    submission.status === "DRAFT"
      ? (backgroundImages[
          Math.floor(Math.random() * backgroundImages.length)
        ] ?? backgroundImages[0])
      : null;

  return (
    <main
      className={`relative min-h-screen text-white p-10 ${submission.status === "DRAFT" ? "bg-neutral-950 bg-cover bg-center bg-no-repeat" : "bg-neutral-950"}`}
      style={
        randomBg
          ? { backgroundImage: `url(${randomBg})` }
          : undefined
      }
    >
      {submission.status === "DRAFT" && (
        <>
          <div className="absolute inset-0 bg-neutral-950/70" aria-hidden />
          <div className="relative z-10 flex min-h-screen w-full flex-col items-center justify-center px-4 pt-10 pb-10 md:px-10">
            <div className="mx-auto flex w-full max-w-2xl flex-col items-center -mt-16 min-w-0">
            <div className="flex justify-center pb-16">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt="Logo"
                className="h-[52px] w-auto max-w-[208px] object-contain"
              />
            </div>
            <section className="mb-8 w-full max-w-[480px] text-center">
              <h2 className="text-xl font-semibold text-white">
                Last opp dine kvitteringer
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-neutral-400">
                Utleggsskjemaet fylles ut automatisk før det sendes til produsent.
              </p>
              <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-gray-500">
                Sørg for at beskrivelsen av kvitteringen matcher kjøpet før du sender inn.
              </p>
            </section>
            <UploadStep token={token} receipts={receipts} />
            </div>
          </div>
        </>
      )}

      {(submission.status === "REVIEW" || submission.status === "SUBMITTED") && (
        <div className="mx-auto max-w-4xl space-y-4">
          <p className="text-neutral-400">
            {submission.status === "REVIEW"
              ? "Kvitteringene er lastet opp. Gå videre til gjennomgang."
              : "Utlegget er sendt inn. Vennligst last ned PDF for egen kopi."}
          </p>
          <Link
            href={`/s/${token}/review`}
            className="inline-block rounded-lg bg-neutral-700 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-600"
          >
            {submission.status === "REVIEW"
              ? "Gå til gjennomgang"
              : "Se gjennomgang"}
          </Link>
        </div>
      )}
    </main>
  );
}
