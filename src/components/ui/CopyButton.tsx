"use client";

import { Copy } from "../icons";
import { toast } from "./Toaster";

export default function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} copied`);
    } catch {
      toast("Couldn't copy — press and hold to select");
    }
  };
  return (
    <button type="button" className={className} onClick={copy} aria-label={`Copy ${label.toLowerCase()}`}>
      <Copy />
    </button>
  );
}
