/**
 * Quiet loading state for guest-facing segments: a thin brass line that
 * draws across the top, nothing that jumps. Server Component, no JS.
 */
export default function PageLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className="pointer-events-none fixed inset-x-0 top-0 z-[300] h-0.5 overflow-hidden"
    >
      <span className="block h-full w-1/3 animate-pulse bg-brass" />
      <span className="sr-only">{label}…</span>
    </div>
  );
}
