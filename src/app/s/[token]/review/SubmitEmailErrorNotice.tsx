"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "submitEmailError";

export function SubmitEmailErrorNotice() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        setMessage(stored);
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }, []);

  if (!message) return null;

  return (
    <div
      className="mb-6 max-w-md rounded-lg border border-amber-600/60 bg-amber-950/40 px-4 py-3 text-center text-sm text-amber-200"
      role="alert"
    >
      <p className="font-medium text-amber-100">E-post ble ikke sendt</p>
      <p className="mt-1 text-amber-200/90">{message}</p>
      <p className="mt-2 text-xs text-amber-300/80">
        Verifiser domenet på{" "}
        <a
          href="https://resend.com/domains"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-amber-100"
        >
          resend.com/domains
        </a>{" "}
        og sett RESEND_FROM i Vercel (f.eks. Utlegg &lt;utlegg@aparent.tv&gt;).
      </p>
    </div>
  );
}
