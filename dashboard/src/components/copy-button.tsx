"use client";

import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="px-2 py-1 rounded text-[11px] font-medium bg-surface-2 hover:bg-surface-3 text-text-secondary transition-colors"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
