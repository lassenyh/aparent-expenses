"use client";

import { useActionState } from "react";
import { sendLoginLink, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendLoginLink, {});

  if (state.sentTo) {
    return (
      <div className="space-y-2" role="status">
        <p className="text-sm text-ink">Sjekk e-posten din.</p>
        <p className="text-sm leading-relaxed text-muted">
          Hvis <span className="text-ink">{state.sentTo}</span> har tilgang, har vi sendt en innloggingslenke dit.
          Åpne den i denne nettleseren.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="login-email" className="mb-1.5 block text-[13px] text-muted">
          E-post
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          disabled={pending}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "login-error" : undefined}
          className="h-9 w-full rounded-md border border-control bg-field px-2.5 text-sm text-ink placeholder:text-faint hover:border-control-hover focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/10 disabled:opacity-60"
          placeholder="navn@aparent.tv"
        />
        {state.error && (
          <p id="login-error" className="mt-1 text-[13px] text-neg">
            {state.error}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover disabled:cursor-wait disabled:opacity-80"
      >
        {pending ? "Sender…" : "Send innloggingslenke"}
      </button>
    </form>
  );
}
