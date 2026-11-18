"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useHotelInfo } from "@/components/cms/HotelInfo";

type Props = {
  error: unknown;
  retry: () => void;
  /** "site" uses the guest design system; "admin" the front-desk one. */
  variant?: "site" | "admin";
  title?: string;
  homeHref?: string;
  homeLabel?: string;
};

/**
 * Shared fallback for route-segment error boundaries (error.tsx). In
 * production Server Component errors arrive with a generic message and a
 * `digest` that matches the server log, so only the digest is shown.
 */
export default function ErrorState({
  error,
  retry,
  variant = "site",
  title = "Something went wrong on our side.",
  homeHref = "/",
  homeLabel = "Return home",
}: Props) {
  const RESERVATIONS = useHotelInfo().phones[0] ?? { href: "/contact", display: "the front desk" };
  const digest = error instanceof Error && "digest" in error ? String((error as { digest?: string }).digest ?? "") : "";

  useEffect(() => {
    console.error(error);
  }, [error]);

  if (variant === "admin") {
    return (
      <div className="a-panel" role="alert" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 14, maxWidth: 560 }}>
        <p className="a-eyebrow">Front desk</p>
        <h1 className="a-title">This page couldn&apos;t load</h1>
        <p>Nothing was changed. Try again; if it keeps happening, note the reference below for support.</p>
        {digest && (
          <p className="a-hint">
            Reference: <code>{digest}</code>
          </p>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" className="a-btn a-btn--primary" onClick={() => retry()}>
            Try again
          </button>
          <Link href={homeHref} className="a-btn">
            {homeLabel}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <section
      role="alert"
      className="wrap"
      style={{ minHeight: "60dvh", display: "grid", placeItems: "center", padding: "calc(var(--header-h) + 48px) var(--gutter) 64px" }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, textAlign: "center", maxWidth: 560 }}>
        <p className="caps" style={{ color: "var(--brass)" }}>
          A moment, please
        </p>
        <h1 className="h2">{title}</h1>
        <p className="lede" style={{ color: "var(--muted)" }}>
          Please try again. If you were making a booking, nothing has been reserved yet — or call us on{" "}
          <a href={RESERVATIONS.href} style={{ textDecoration: "underline" }}>
            {RESERVATIONS.display}
          </a>
          .
        </p>
        {digest && <p style={{ fontSize: 12, color: "var(--muted)" }}>Reference: {digest}</p>}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <button type="button" className="btn" onClick={() => retry()}>
            Try again
          </button>
          <Link href={homeHref} className="btn btn--outline">
            {homeLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}
