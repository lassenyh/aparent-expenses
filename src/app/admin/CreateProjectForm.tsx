"use client";

import { useActionState } from "react";
import { createProject, type CreateProjectState } from "./actions";
import { CopyLinkButton } from "./CopyLinkButton";

const inputClass =
  "h-9 w-full rounded-md border bg-field px-2.5 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-[3px] disabled:opacity-60";
const okBorder = "border-control hover:border-control-hover focus:border-ink focus:ring-ink/10";
const errBorder = "border-neg focus:border-neg focus:ring-neg/15";

export function CreateProjectForm() {
  const [state, action, pending] = useActionState<CreateProjectState, FormData>(createProject, {});
  const invalid = (field: "number" | "name") => state.field === field;

  return (
    <div className="space-y-4">
      {/* The key resets the fields after a project is created, and keeps them after an error. */}
      <form key={state.created?.url ?? "form"} action={action} className="grid gap-3 sm:grid-cols-[8rem_1fr_auto] sm:items-end">
        <div>
          <label htmlFor="project-number" className="mb-1.5 block text-[13px] text-muted">
            Prosjektnummer
          </label>
          <input
            id="project-number"
            name="number"
            inputMode="numeric"
            autoComplete="off"
            defaultValue={state.values?.number}
            disabled={pending}
            aria-invalid={invalid("number") || undefined}
            className={`${inputClass} ${invalid("number") ? errBorder : okBorder}`}
            placeholder="0101"
          />
        </div>
        <div>
          <label htmlFor="project-name" className="mb-1.5 block text-[13px] text-muted">
            Prosjektnavn <span className="text-muted">*</span>
          </label>
          <input
            id="project-name"
            name="name"
            autoComplete="off"
            defaultValue={state.values?.name}
            disabled={pending}
            aria-invalid={invalid("name") || undefined}
            aria-describedby={state.error ? "project-error" : undefined}
            className={`${inputClass} ${invalid("name") ? errBorder : okBorder}`}
            placeholder="Aftenposten"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover disabled:cursor-wait disabled:opacity-80"
        >
          {pending ? "Oppretter…" : "Opprett"}
        </button>
      </form>
      {state.error && (
        <p id="project-error" className="text-[13px] text-neg">
          {state.error}
        </p>
      )}
      {state.created && (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-md border border-line bg-raised px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 text-sm">
            <p className="text-ink">«{state.created.label}» er opprettet.</p>
            <p className="truncate text-muted">{state.created.url}</p>
          </div>
          <CopyLinkButton url={state.created.url} primary />
        </div>
      )}
    </div>
  );
}
