import { projectLabel } from "@/lib/projects";

type ProjectOption = { id: string; number: string | null; name: string };

export function StartOwnClaimForm({ projects }: { projects: ProjectOption[] }) {
  return (
    <form action="/admin/new" method="get" className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <div className="min-w-0">
        <label htmlFor="own-claim-project" className="mb-1.5 block text-[13px] text-muted">Prosjekt</label>
        <select id="own-claim-project" name="projectId" defaultValue=""
          className="h-10 w-full min-w-0 rounded-md border border-control bg-field px-2.5 text-sm text-ink focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/10">
          <option value="">Fyll inn prosjekt selv</option>
          {projects.length > 0 && <optgroup label="Aktive prosjekter">
            {projects.map(project => <option key={project.id} value={project.id}>{projectLabel(project)}</option>)}
          </optgroup>}
        </select>
      </div>
      <button type="submit" className="inline-flex h-10 items-center justify-center rounded-md bg-secondary px-4 text-sm font-medium text-ink hover:bg-secondary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
        Start eget utlegg
      </button>
      {projects.length === 0 && <p className="text-[13px] text-muted sm:col-span-2">Ingen aktive prosjekter. Du kan fylle inn prosjektet i utlegget.</p>}
    </form>
  );
}
