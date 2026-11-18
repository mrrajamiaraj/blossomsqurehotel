"use client";

import { Button } from "../primitives/button";

export default function GuestPrintButton() {
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
      Print or save as PDF
    </Button>
  );
}
