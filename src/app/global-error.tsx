"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";

/**
 * Last-resort boundary for errors in the root layout itself. It replaces the
 * whole document, so it cannot rely on globals.css, fonts or the theme script:
 * everything it needs is inline. Follows the OS colour scheme.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "#0a2a21",
          color: "#f7f2e8",
          fontFamily: '"Inter", "Segoe UI", system-ui, sans-serif',
          textAlign: "center",
        }}
      >
        <title>Something went wrong · Blossom Square</title>
        <main style={{ maxWidth: 520, display: "flex", flexDirection: "column", gap: 18, alignItems: "center" }}>
          <p style={{ letterSpacing: "0.2em", textTransform: "uppercase", fontSize: 12, color: "#d4b685", margin: 0 }}>
            Blossom Square Hotel &amp; Suites
          </p>
          <h1 style={{ fontSize: 32, fontWeight: 500, margin: 0 }}>We&apos;ll be right back.</h1>
          <p style={{ color: "#c7d2cb", margin: 0, lineHeight: 1.6 }}>
            The site hit an unexpected problem. Please try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              cursor: "pointer",
              border: "1px solid #d4b685",
              background: "transparent",
              color: "#f7f2e8",
              padding: "12px 28px",
              font: "inherit",
              letterSpacing: "0.08em",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
