import PageLoading from "@/components/shell/PageLoading";

/** Public pages: header/footer stay; a brass line marks the page that is loading. */
export default function Loading() {
  return (
    <>
      <PageLoading />
      <div style={{ minHeight: "100dvh" }} aria-hidden="true" />
    </>
  );
}
