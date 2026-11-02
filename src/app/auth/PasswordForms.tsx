"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, type LoginState } from "@/app/admin/login/actions";
import { updatePassword } from "./reset-password/actions";

const fieldClass = "h-9 w-full rounded-md border border-control bg-field px-2.5 text-sm text-ink focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/10 disabled:opacity-60";
const buttonClass = "inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover disabled:cursor-wait disabled:opacity-80";

export function PasswordResetRequestForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(requestPasswordReset, {});
  return <div className="space-y-4">
    {state.sentTo ? <p role="status" className="text-sm leading-relaxed text-muted">Hvis {state.sentTo} har en bruker med tilgang, sender vi en lenke dit. Åpne lenken i denne nettleseren.</p> :
      <form action={action} className="space-y-4">
        <div>
          <label htmlFor="reset-email" className="mb-1.5 block text-[13px] text-muted">E-post</label>
          <input id="reset-email" name="email" type="email" autoComplete="email" required disabled={pending}
            aria-invalid={!!state.error} aria-describedby={state.error ? "reset-error" : undefined} className={fieldClass} />
        </div>
        {state.error && <p id="reset-error" role="alert" className="text-sm text-neg">{state.error}</p>}
        <button type="submit" disabled={pending} aria-busy={pending} className={buttonClass}>{pending ? "Sender…" : "Send lenke"}</button>
      </form>}
    <Link href="/admin/login" className="block text-center text-sm text-muted underline underline-offset-2 hover:text-ink">Tilbake til innlogging</Link>
  </div>;
}

export function NewPasswordForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(updatePassword, {});
  return <form action={action} className="space-y-4">
    <div>
      <label htmlFor="new-password" className="mb-1.5 block text-[13px] text-muted">Nytt passord</label>
      <input id="new-password" name="password" type="password" autoComplete="new-password" minLength={12} required disabled={pending}
        aria-describedby="password-hint password-error" className={fieldClass} />
      <p id="password-hint" className="mt-1 text-[13px] text-muted">Minst 12 tegn. Bruk gjerne en lang passordfrase.</p>
    </div>
    <div>
      <label htmlFor="confirm-password" className="mb-1.5 block text-[13px] text-muted">Gjenta passordet</label>
      <input id="confirm-password" name="confirmation" type="password" autoComplete="new-password" minLength={12} required disabled={pending}
        aria-describedby="password-error" className={fieldClass} />
    </div>
    <p id="password-error" role="alert" className="text-sm text-neg">{state.error}</p>
    <button type="submit" disabled={pending} aria-busy={pending} className={buttonClass}>{pending ? "Lagrer…" : "Lagre passord"}</button>
  </form>;
}
