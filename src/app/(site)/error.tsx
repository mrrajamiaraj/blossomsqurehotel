"use client"; // Error boundaries must be Client Components

import ErrorState from "@/components/shell/ErrorState";

/** Public pages: keeps the header and footer, replaces only the page body. */
export default function SiteError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorState error={error} retry={retry} />;
}
