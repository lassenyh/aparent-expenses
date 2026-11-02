"use client";

import { useEffect, useRef, useState } from "react";

export type SubmissionInfo = {
  name: string;
  projectNumber: string;
  project: string;
  workDate: string;
  accountNumber: string;
  productionCash: string;
};

export type AnalysisProgress = {
  total: number;
  done: number;
  failed: number;
  uploading: number;
};

const inputClass =
  "h-9 w-full rounded-md border bg-field px-2.5 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-[3px] disabled:opacity-60";
const okBorder = "border-control hover:border-control-hover focus:border-ink focus:ring-ink/10";
const errBorder = "border-neg focus:border-neg focus:ring-neg/15";

function accountProblem(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (value.trim() === "") return null;
  return digits.length === 11 ? null : "Kontonummer må være 11 sifre";
}

type FieldErrors = { name?: string; project?: string; accountNumber?: string };

/** The same fields the review page requires before it submits. */
function requiredProblems(info: SubmissionInfo, projectLocked: boolean): FieldErrors {
  const errors: FieldErrors = {};
  if (!info.name.trim()) errors.name = "Navn er påkrevd";
  if (!projectLocked && !info.project.trim()) errors.project = "Prosjektnavn er påkrevd";
  const account = info.accountNumber.trim() === "" ? "Kontonummer er påkrevd" : accountProblem(info.accountNumber);
  if (account) errors.accountNumber = account;
  return errors;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-[13px] text-neg">
      {message}
    </p>
  );
}

/**
 * Person- og prosjektinfo vises når brukeren trykker «Gå videre». Kvitteringene
 * analyseres i bakgrunnen mens skjemaet fylles ut, så ventetiden brukes til
 * noe brukeren uansett må gjøre.
 */
export function SubmissionInfoModal({
  initialInfo,
  projectLocked,
  progress,
  continuing,
  error,
  onContinue,
  onClose,
}: {
  initialInfo: SubmissionInfo;
  /** Set from a project link: the project is shown, not edited. */
  projectLocked: boolean;
  progress: AnalysisProgress;
  continuing: boolean;
  error: string | null;
  onContinue: (info: SubmissionInfo) => void;
  onClose: () => void;
}) {
  const [info, setInfo] = useState<SubmissionInfo>(initialInfo);
  const [errors, setErrors] = useState<FieldErrors>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef<HTMLInputElement>(null);
  const accountRef = useRef<HTMLInputElement>(null);
  const workDateRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!initialInfo.name.trim()) nameRef.current?.focus();
    // Focus only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !continuing) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [continuing, onClose]);

  const set = (field: keyof SubmissionInfo) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setInfo((prev) => ({ ...prev, [field]: e.target.value }));
    setErrors((prev) => (field in prev ? { ...prev, [field]: undefined } : prev));
  };

  // The fields lock while the receipts finish, so nothing missing may get past this point.
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const problems = requiredProblems(info, projectLocked);
    setErrors(problems);
    if (problems.name) nameRef.current?.focus();
    else if (problems.project) projectRef.current?.focus();
    else if (problems.accountNumber) accountRef.current?.focus();
    else onContinue(info);
  };

  const errorProps = (field: keyof FieldErrors) => ({
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": errors[field] ? `info-${field}-error` : undefined,
  });

  const finished = progress.done + progress.failed;
  const remaining = progress.total - finished + progress.uploading;
  const percent = progress.total ? Math.round((finished / progress.total) * 100) : 0;
  const statusText =
    progress.uploading > 0
      ? `Laster opp ${progress.uploading} ${progress.uploading === 1 ? "fil" : "filer"}…`
      : remaining > 0
        ? `Leser kvitteringene: ${finished} av ${progress.total} ferdig`
        : progress.failed > 0
          ? `${progress.failed} ${progress.failed === 1 ? "kvittering leses" : "kvitteringer leses"} på nytt når du går videre`
          : "Alle kvitteringene er lest";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-scrim p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="info-modal-title"
    >
      <form
        onSubmit={handleSubmit}
        className="my-auto w-full max-w-lg space-y-5 rounded-xl border border-line bg-surface p-6 shadow-2xl"
      >
        <div className="space-y-1">
          <h2 id="info-modal-title" className="text-lg font-semibold tracking-[-0.01em] text-ink">
            Person- og prosjektinfo
          </h2>
          <p className="text-sm leading-relaxed text-muted">
            Mens du fyller ut, leser vi kvitteringene og fyller ut utleggsskjemaet automatisk.
          </p>
        </div>

        <div className="space-y-2" role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-ink">{statusText}</span>
            {progress.total > 0 && (
              <span className="shrink-0 tabular-nums text-muted">{percent} %</span>
            )}
          </div>
          <div className="h-1 w-full overflow-hidden rounded bg-raised">
            <div
              className="h-full rounded bg-load transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${Math.max(percent, progress.total ? 4 : 0)}%` }}
            />
          </div>
        </div>

        <div className="grid gap-4">
          <div>
            <label htmlFor="info-name" className="mb-1.5 block text-[13px] text-muted">
              Navn <span className="text-muted">*</span>
            </label>
            <input
              ref={nameRef}
              id="info-name"
              type="text"
              autoComplete="name"
              value={info.name}
              onChange={set("name")}
              disabled={continuing}
              {...errorProps("name")}
              className={`${inputClass} ${errors.name ? errBorder : okBorder}`}
              placeholder="Fullt navn"
            />
            <FieldError id="info-name-error" message={errors.name} />
          </div>
          {projectLocked ? (
            <div>
              <p className="mb-1.5 text-[13px] text-muted">Prosjekt</p>
              <p className="flex min-h-9 items-center rounded-md border border-line bg-raised px-2.5 text-sm text-ink">
                {[info.projectNumber.trim(), info.project.trim()].filter(Boolean).join(" – ")}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr]">
              <div className="min-w-0">
                <label htmlFor="info-projectNumber" className="mb-1.5 flex items-center gap-1.5 text-[13px] text-muted">
                  Prosjektnummer
                  <span className="group relative inline-flex">
                    <span
                      className="inline-flex cursor-default text-faint hover:text-ink"
                      aria-label="Prosjektnummer finnes i email, eller fås av produsent."
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 0 1 2 0v1a1 1 0 0 1-2 0V6ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-ink px-2.5 py-1.5 text-xs text-ground opacity-0 shadow transition-opacity duration-150 group-hover:opacity-100">
                      Prosjektnummer finnes i email, eller fås av produsent.
                    </span>
                  </span>
                </label>
                <input
                  id="info-projectNumber"
                  type="number"
                  inputMode="numeric"
                  autoComplete="off"
                  value={info.projectNumber}
                  onChange={set("projectNumber")}
                  disabled={continuing}
                  className={`${inputClass} ${okBorder} min-w-28 sm:min-w-32 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
                  placeholder="0"
                />
              </div>
              <div className="min-w-0">
                <label htmlFor="info-project" className="mb-1.5 block text-[13px] text-muted">
                  Prosjektnavn <span className="text-muted">*</span>
                </label>
                <input
                  ref={projectRef}
                  id="info-project"
                  type="text"
                  autoComplete="off"
                  value={info.project}
                  onChange={set("project")}
                  disabled={continuing}
                  {...errorProps("project")}
                  className={`${inputClass} ${errors.project ? errBorder : okBorder}`}
                  placeholder="Prosjektnavn"
                />
                <FieldError id="info-project-error" message={errors.project} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="info-workDate" className="mb-1.5 block text-[13px] text-muted">
                Dato
              </label>
              <input
                ref={workDateRef}
                id="info-workDate"
                type="date"
                value={info.workDate}
                onChange={set("workDate")}
                onClick={() => workDateRef.current?.showPicker?.()}
                disabled={continuing}
                className={`${inputClass} ${okBorder} cursor-pointer`}
              />
            </div>
            <div>
              <label htmlFor="info-productionCash" className="mb-1.5 block text-[13px] text-muted">
                Prod.penger / forskudd (NOK)
              </label>
              <input
                id="info-productionCash"
                type="number"
                inputMode="numeric"
                autoComplete="off"
                value={info.productionCash}
                onChange={set("productionCash")}
                disabled={continuing}
                className={`${inputClass} ${okBorder} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
                placeholder="0"
              />
            </div>
          </div>
          <div>
            <label htmlFor="info-accountNumber" className="mb-1.5 block text-[13px] text-muted">
              Kontonummer (11 sifre) <span className="text-muted">*</span>
            </label>
            <input
              ref={accountRef}
              id="info-accountNumber"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={11}
              value={info.accountNumber}
              onChange={set("accountNumber")}
              onBlur={() =>
                setErrors((prev) => ({ ...prev, accountNumber: accountProblem(info.accountNumber) ?? undefined }))
              }
              disabled={continuing}
              {...errorProps("accountNumber")}
              className={`${inputClass} ${errors.accountNumber ? errBorder : okBorder}`}
              placeholder="11 sifre"
            />
            <FieldError id="info-accountNumber-error" message={errors.accountNumber} />
          </div>
        </div>

        <p className="text-[12.5px] leading-relaxed text-muted">
          På neste side går du gjennom hver linje og sjekker at beløp og beskrivelse stemmer. Noen kjøp kan kreve en
          kort kommentar, for eksempel mat/drikke.
        </p>

        {error && <p className="text-sm text-neg">{error}</p>}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={continuing}
            className="h-9 rounded-md bg-secondary px-4 text-sm font-medium text-ink hover:bg-secondary-hover disabled:opacity-50"
          >
            Tilbake til opplasting
          </button>
          <button
            type="submit"
            disabled={continuing}
            aria-busy={continuing}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover disabled:cursor-wait disabled:opacity-80"
          >
            {continuing && (
              <span
                className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden
              />
            )}
            {continuing ? (remaining > 0 ? "Venter på kvitteringene…" : "Går videre…") : "Gå til gjennomgang"}
          </button>
        </div>
      </form>
    </div>
  );
}
