import PageLoading from "@/components/shell/PageLoading";

/** Shown while live availability and prices load for the booking form. */
export default function Loading() {
  return (
    <>
      <PageLoading label="Checking availability" />
      <div style={{ minHeight: "70dvh" }} aria-hidden="true" />
    </>
  );
}
