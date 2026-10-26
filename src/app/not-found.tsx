import Link from "next/link";
import { ArrowRight, Monogram } from "@/components/icons";

export default function NotFound() {
  return (
    <main
      id="main"
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "48px var(--gutter)",
        background: "var(--pine-900)",
        color: "var(--paper)",
        textAlign: "center",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
        <Monogram size={56} className="" />
        <p className="caps" style={{ color: "var(--brass-light)" }}>
          Page not found
        </p>
        <h1 className="h1">
          This path leads <em>out to sea.</em>
        </h1>
        <p className="lede" style={{ color: "var(--mist)", maxWidth: 480 }}>
          The page you were looking for has moved, or never existed. Let&apos;s get you back to dry land.
        </p>
        <Link href="/" className="btn btn--light">
          Return home
          <ArrowRight />
        </Link>
      </div>
    </main>
  );
}
