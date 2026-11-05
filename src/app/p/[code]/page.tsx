
import { T } from "@/components/LanguageProvider";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { prisma } from "@/lib/db";
import { projectLabel } from "@/lib/projects";
import { startProjectClaim } from "./actions";
import { UploadSteps } from "@/app/s/[token]/UploadSteps";
import { StartButton } from "./StartButton";

export const metadata = { title: "Aparent Utlegg" };

/**
 * The project link sent to freelancers, with the same steps as the upload intro (so the intro
 * is not shown again). A claim is only created when they press the button, so link previews
 * in Slack, Messages or e-mail do not leave empty claims behind.
 */
export default async function ProjectLinkPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const project = await prisma.project.findUnique({
    where: { code },
    select: { number: true, name: true, closedAt: true },
  });
  if (!project) notFound();
  // A closed project's link still works, as an ordinary claim where the project is typed in.
  const open = !project.closedAt;

  return (
    <main className="flex flex-col">
      <AppHeader />
      <div className="px-4 pb-12 pt-2 md:px-8 md:pt-10">
        <section className="mx-auto grid w-full max-w-[480px] gap-5 rounded-lg border border-line bg-surface p-7">
          <div className="space-y-1">
            {open ? (
              <>
                <p className="text-[13px] text-muted"><T>{"Utlegg for"}</T></p>
                <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">{projectLabel(project)}</h1>
              </>
            ) : (
              <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink"><T>{"Send inn utlegg"}</T></h1>
            )}
            <p className="pt-1 text-sm text-muted"><T>{"Det tar et par minutter, og vi fyller ut skjemaet for deg."}</T>{open && " Prosjektet er allerede fylt ut."}
            </p>
          </div>
          <UploadSteps projectFilled={open} />
          <form action={startProjectClaim.bind(null, code)}>
            <StartButton />
          </form>
        </section>
      </div>
    </main>
  );
}
