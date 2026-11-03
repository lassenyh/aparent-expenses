"use client";

import { useActionState, useRef, useState } from "react";
import { deleteProject, type DeleteProjectState } from "./actions";

export function DeleteProjectButton({ projectId, label }: { projectId: string; label: string }) {
  const [state, action, pending] = useActionState<DeleteProjectState>(deleteProject.bind(null, projectId), {});
  const [confirming, setConfirming] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  return (
    <div className="max-w-full">
      <button
        ref={trigger}
        type="button"
        aria-label={`Slett prosjektet ${label}`}
        aria-expanded={confirming}
        onClick={() => setConfirming(true)}
        disabled={pending}
        className="min-h-9 rounded-md px-3 text-[13px] text-neg hover:bg-neg-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-wait disabled:opacity-60"
      >
        Slett
      </button>
      {confirming && (
        <form action={action} aria-label={`Bekreft sletting av ${label}`} className="max-w-64 space-y-2 rounded-md border border-line bg-raised p-3">
          <p className="break-words text-sm font-medium text-ink">Slette «{label}»?</p>
          <p className="text-[13px] leading-relaxed text-muted">Prosjektlenken slutter å virke. Eksisterende utlegg, kvitteringer og PDF-er beholdes. Slettingen kan ikke angres.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={() => { setConfirming(false); trigger.current?.focus(); }}
              className="min-h-9 rounded-md bg-secondary px-3 text-[13px] text-ink hover:bg-secondary-hover disabled:opacity-60">Avbryt</button>
            <button type="submit" disabled={pending} aria-busy={pending}
              className="min-h-9 rounded-md bg-neg-soft px-3 text-[13px] font-medium text-neg hover:underline disabled:cursor-wait disabled:opacity-60">
              {pending ? "Sletter…" : "Slett prosjekt"}
            </button>
          </div>
          {state.error && <p role="alert" className="text-[13px] text-neg">{state.error}</p>}
        </form>
      )}
    </div>
  );
}
