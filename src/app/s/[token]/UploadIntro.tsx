"use client";
import { T } from "@/components/LanguageProvider";

import { useEffect, useRef } from "react";
import { UploadSteps } from "./UploadSteps";

export { UPLOAD_INTRO_SEEN_KEY } from "./UploadSteps";

/** Short introduction shown before the first upload on this device, and again from «Slik fungerer det». */
export function UploadIntro({ onClose, projectFilled }: { onClose: () => void; projectFilled?: boolean }) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    buttonRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-scrim p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-intro-title"
    >
      <div className="my-auto w-full max-w-md space-y-5 rounded-xl border border-line bg-surface p-6 shadow-2xl">
        <div className="space-y-1">
          <h2 id="upload-intro-title" className="text-lg font-semibold tracking-[-0.01em] text-ink"><T>{"Slik sender du inn utlegg"}</T></h2>
          <p className="text-sm text-muted"><T>{"Det tar et par minutter, og vi fyller ut skjemaet for deg."}</T></p>
        </div>
        <UploadSteps projectFilled={projectFilled} />
        <div className="flex justify-end">
          <button
            ref={buttonRef}
            type="button"
            onClick={onClose}
            className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover"
          ><T>{"Kom i gang"}</T></button>
        </div>
      </div>
    </div>
  );
}
