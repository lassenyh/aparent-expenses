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
      className="mb-6 max-w-md rounded-lg border border-warn-line bg-warn-bg px-4 py-3 text-center text-sm text-warn-ink"
      role="alert"
    >
      <p className="font-medium">E-post ble ikke sendt</p>
      <p className="mt-1">{message}</p>
      <p className="mt-2 text-xs opacity-90">
        Verifiser domenet på{" "}
        <a
          href="https://resend.com/domains"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:opacity-80"
        >
          resend.com/domains
        </a>{" "}
        og sett RESEND_FROM i Vercel (f.eks. Utlegg &lt;utlegg@aparent.tv&gt;).
      </p>
    </div>
  );
}
