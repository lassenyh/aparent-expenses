import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { isAdminSubmitterConfigured } from "@/lib/adminDefaults";
import { requireAdmin } from "@/lib/adminAuth";
import { prisma } from "@/lib/db";
import { requestOrigin } from "@/lib/requestOrigin";
import { signOut } from "./login/actions";
import { setProjectClosed } from "./actions";
import { CopyLinkButton } from "./CopyLinkButton";
import { CreateProjectForm } from "./CreateProjectForm";

export const metadata = { title: "Prosjekter – Aparent Utlegg" };

type ProjectRow = {
  id: string;
  code: string;
  number: string | null;
  name: string;
  closedAt: Date | null;
  _count: { submissions: number };
};

function ProjectItem({ project, origin }: { project: ProjectRow; origin: string }) {
  const url = `${origin}/p/${project.code}`;
  const closed = project.closedAt != null;
  const submitted = project._count.submissions;
  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${closed ? "text-muted" : "text-ink"}`}>
          {project.number && <span className="tabular-nums text-muted">{project.number}</span>}
          {project.number && " – "}
          {project.name}
        </p>
        <p className="mt-0.5 text-[13px] text-muted">
          {submitted === 0 ? "Ingen innsendt ennå" : `${submitted} innsendt`}
          {!closed && (
            <>
              {" · "}
              <span className="break-all">{url.replace(/^https?:\/\//, "")}</span>
            </>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!closed && <CopyLinkButton url={url} />}
        <form action={setProjectClosed.bind(null, project.id, !closed)}>
          <button
            type="submit"
            className="h-8 rounded-md px-3 text-[13px] text-muted hover:bg-secondary hover:text-ink"
          >
            {closed ? "Gjenåpne" : "Avslutt"}
          </button>
        </form>
      </div>
    </li>
  );
}

export default async function AdminPage() {
  const email = await requireAdmin();
  const [projects, origin] = await Promise.all([
    prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        code: true,
        number: true,
        name: true,
        closedAt: true,
        _count: { select: { submissions: { where: { status: "SUBMITTED" } } } },
      },
    }),
    requestOrigin(),
  ]);
  const open = projects.filter((p) => !p.closedAt);
  const closed = projects.filter((p) => p.closedAt);

  return (
    <main className="flex flex-col">
      <AppHeader />
      <div className="px-4 pb-16 pt-2 md:px-8 md:pt-6">
        <div className="mx-auto grid w-full max-w-[760px] gap-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">Prosjekter</h1>
              <p className="text-sm leading-relaxed text-muted">
                Send prosjektets lenke til frilanserne. Prosjektnummer og -navn er da fylt ut for dem.
              </p>
            </div>
            <form action={signOut} className="flex items-center gap-3 text-[13px] text-muted">
              <span className="truncate">{email}</span>
              <button type="submit" className="underline underline-offset-2 hover:text-ink">
                Logg ut
              </button>
            </form>
          </div>

          <section className="grid gap-4 rounded-lg border border-line bg-surface p-5 sm:p-6">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.04em] text-ink">Nytt prosjekt</h2>
            <CreateProjectForm />
          </section>

          <section className="overflow-hidden rounded-lg border border-line bg-surface">
            <h2 className="border-b border-line px-5 py-4 text-[13px] font-semibold uppercase tracking-[0.04em] text-ink">
              Aktive prosjekter
            </h2>
            {open.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">Ingen aktive prosjekter. Opprett det første over.</p>
            ) : (
              <ul className="divide-y divide-line">
                {open.map((project) => (
                  <ProjectItem key={project.id} project={project} origin={origin} />
                ))}
              </ul>
            )}
          </section>

          {closed.length > 0 && (
            <details className="group overflow-hidden rounded-lg border border-line bg-surface">
              <summary className="cursor-pointer list-none px-5 py-4 text-[13px] text-muted hover:text-ink">
                Avsluttede prosjekter ({closed.length})
                <span className="ml-1 inline-block transition-transform group-open:rotate-90" aria-hidden>
                  ›
                </span>
              </summary>
              <p className="border-t border-line px-5 pt-3 text-[13px] text-muted">
                Lenkene til avsluttede prosjekter starter vanlige utlegg, der prosjektet fylles inn for hånd.
              </p>
              <ul className="divide-y divide-line">
                {closed.map((project) => (
                  <ProjectItem key={project.id} project={project} origin={origin} />
                ))}
              </ul>
            </details>
          )}

          <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="space-y-1">
              <h2 className="text-sm font-medium text-ink">Eget utlegg</h2>
              <p className="text-[13px] leading-relaxed text-muted">
                Navn og kontonummer er fylt ut, og skjemaet sendes til eBilag.
              </p>
            </div>
            {isAdminSubmitterConfigured() ? (
              <Link
                href="/admin/new"
                className="inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-secondary px-4 text-sm font-medium text-ink hover:bg-secondary-hover"
              >
                Start eget utlegg
              </Link>
            ) : (
              <p className="text-[13px] text-warn-ink">
                Sett ADMIN_SUBMITTER_NAME og ADMIN_SUBMITTER_ACCOUNT for å bruke dette.
              </p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
