"use client";

import { useFormStatus } from "react-dom";
import { UPLOAD_INTRO_SEEN_KEY } from "@/app/s/[token]/UploadSteps";

/** The steps are on this page already, so the upload page should not show them again. */
function markIntroSeen() {
  try {
    localStorage.setItem(UPLOAD_INTRO_SEEN_KEY, "1");
  } catch {
    // Storage blocked: the intro shows once more, which does no harm.
  }
}

export function StartButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      onClick={markIntroSeen}
      disabled={pending}
      aria-busy={pending}
      className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover disabled:cursor-wait disabled:opacity-80"
    >
      {pending ? "Starter…" : "Kom i gang"}
    </button>
  );
}
