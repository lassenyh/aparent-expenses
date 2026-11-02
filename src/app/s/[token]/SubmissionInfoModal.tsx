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
  "w-full rounded-lg border bg-neutral-800 px-3 py-2 text-white placeholder-neutral-500 focus:outline-none focus:ring-1 disabled:opacity-60";
const okBorder = "border-neutral-700 focus:border-neutral-500 focus:ring-neutral-500";
const errBorder = "border-red-500 focus:border-red-500 focus:ring-red-500";

function accountProblem(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (value.trim() === "") return null;
  return digits.length === 11 ? null : "Kontonummer må være 11 sifre";
}

/**
 * Person- og prosjektinfo vises når brukeren trykker «Gå videre». Kvitteringene
 * analyseres i bakgrunnen mens skjemaet fylles ut, så ventetiden brukes til
 * noe brukeren uansett må gjøre.
 */
export function SubmissionInfoModal({
  initialInfo,
  progress,
  continuing,
  error,
  onContinue,
  onClose,
}: {
  initialInfo: SubmissionInfo;
  progress: AnalysisProgress;
  continuing: boolean;
  error: string | null;
  onContinue: (info: SubmissionInfo) => void;
  onClose: () => void;
}) {
  const [info, setInfo] = useState<SubmissionInfo>(initialInfo);
  const [accountError, setAccountError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
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

  const set = (field: keyof SubmissionInfo) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setInfo((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const problem = accountProblem(info.accountNumber);
    setAccountError(problem);
    if (problem) {
      accountRef.current?.focus();
      return;
    }
    onContinue(info);
  };

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
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="info-modal-title"
    >
      <form
        onSubmit={handleSubmit}
        className="my-auto w-full max-w-lg space-y-5 rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-xl"
      >
        <div className="space-y-1">
          <h2 id="info-modal-title" className="text-lg font-semibold text-white">
            Person- og prosjektinfo
          </h2>
          <p className="text-sm leading-relaxed text-neutral-400">
            Mens du fyller ut, leser vi kvitteringene og fyller ut utleggsskjemaet automatisk.
          </p>
        </div>

        <div className="space-y-2" role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-neutral-300">{statusText}</span>
            {progress.total > 0 && (
              <span className="shrink-0 tabular-nums text-neutral-500">{percent} %</span>
            )}
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full rounded-full bg-green-600 transition-[width] duration-300"
              style={{ width: `${Math.max(percent, progress.total ? 4 : 0)}%` }}
            />
          </div>
        </div>

        <div className="grid gap-4">
          <div>
            <label htmlFor="info-name" className="mb-1 block text-sm text-neutral-400">
              Navn <span className="text-neutral-500">*</span>
            </label>
            <input
              ref={nameRef}
              id="info-name"
              type="text"
              autoComplete="name"
              value={info.name}
              onChange={set("name")}
              disabled={continuing}
              className={`${inputClass} ${okBorder}`}
              placeholder="Fullt navn"
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr]">
            <div className="min-w-0">
              <label htmlFor="info-projectNumber" className="mb-1 flex items-center gap-1.5 text-sm text-neutral-400">
                Prosjektnummer
                <span className="group relative inline-flex">
                  <span
                    className="inline-flex cursor-default text-neutral-500 hover:text-neutral-300"
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
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-neutral-700 px-2.5 py-1.5 text-xs text-white opacity-0 shadow transition-opacity duration-150 group-hover:opacity-100">
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
              <label htmlFor="info-project" className="mb-1 block text-sm text-neutral-400">
                Prosjektnavn <span className="text-neutral-500">*</span>
              </label>
              <input
                id="info-project"
                type="text"
                autoComplete="off"
                value={info.project}
                onChange={set("project")}
                disabled={continuing}
                className={`${inputClass} ${okBorder}`}
                placeholder="Prosjektnavn"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="info-workDate" className="mb-1 block text-sm text-neutral-400">
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
                className={`${inputClass} ${okBorder} h-[42px] cursor-pointer [color-scheme:dark]`}
              />
            </div>
            <div>
              <label htmlFor="info-productionCash" className="mb-1 block text-sm text-neutral-400">
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
            <label htmlFor="info-accountNumber" className="mb-1 block text-sm text-neutral-400">
              Kontonummer (11 sifre) <span className="text-neutral-500">*</span>
            </label>
            <input
              ref={accountRef}
              id="info-accountNumber"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={11}
              value={info.accountNumber}
              onChange={(e) => {
                set("accountNumber")(e);
                setAccountError(null);
              }}
              onBlur={() => setAccountError(accountProblem(info.accountNumber))}
              disabled={continuing}
              aria-invalid={accountError ? true : undefined}
              aria-describedby={accountError ? "info-account-error" : undefined}
              className={`${inputClass} ${accountError ? errBorder : okBorder}`}
              placeholder="11 sifre"
            />
            {accountError && (
              <p id="info-account-error" className="mt-1 text-sm text-red-400">
                {accountError}
              </p>
            )}
          </div>
        </div>

        <p className="text-xs leading-relaxed text-neutral-500">
          På neste side går du gjennom hver linje og sjekker at beløp og beskrivelse stemmer. Noen kjøp kan kreve en
          kort kommentar, for eksempel mat/drikke.
        </p>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={continuing}
            className="rounded-lg border border-neutral-600 bg-neutral-800 px-4 py-2.5 text-sm font-medium text-neutral-200 hover:bg-neutral-700 disabled:opacity-50"
          >
            Tilbake til opplasting
          </button>
          <button
            type="submit"
            disabled={continuing}
            aria-busy={continuing}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-neutral-900 disabled:cursor-wait disabled:opacity-80"
          >
            {continuing && (
              <span
                className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white border-t-transparent"
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
