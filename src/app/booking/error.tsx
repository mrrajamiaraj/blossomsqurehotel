"use client"; // Error boundaries must be Client Components

import ErrorState from "@/components/shell/ErrorState";

/** Checkout: reassures the guest that nothing was reserved, offers the phone line. */
export default function BookingError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <ErrorState
      error={error}
      retry={retry}
      title="We couldn't load the booking form."
      homeHref="/rooms"
      homeLabel="Browse rooms"
    />
  );
}
