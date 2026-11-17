"use client"; // Error boundaries must be Client Components

import ErrorState from "@/components/shell/ErrorState";

/** Front desk: the sidebar shell stays; only the page area shows the error. */
export default function DeskError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorState error={error} retry={retry} variant="admin" homeHref="/admin" homeLabel="Back to Today" />;
}
