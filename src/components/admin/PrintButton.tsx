"use client";

import { IPrint } from "./icons";

export default function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button type="button" className="a-btn" onClick={() => window.print()}>
      <IPrint size={16} /> {label}
    </button>
  );
}
