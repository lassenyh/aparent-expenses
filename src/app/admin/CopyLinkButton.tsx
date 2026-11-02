"use client";

import { useState } from "react";

export function CopyLinkButton({ url, primary = false }: { url: string; primary?: boolean }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Kopier lenken:", url);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex h-8 shrink-0 items-center justify-center rounded-md px-3 text-[13px] font-medium ${
        primary ? "bg-primary text-primary-fg hover:bg-primary-hover" : "bg-secondary text-ink hover:bg-secondary-hover"
      }`}
    >
      <span aria-live="polite">{copied ? "Kopiert" : "Kopier lenke"}</span>
    </button>
  );
}
