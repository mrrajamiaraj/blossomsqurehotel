import { cn } from "@/lib/utils";

export type Testimonial = {
  quote: string;
  author: string;
  /** e.g. "Dhaka" or "Family of four" */
  detail?: string;
  /** Where it was published, e.g. "Google review" — required so it can be verified. */
  source: string;
  /** Link to the original review, when public. */
  sourceUrl?: string;
  /** Out of 5, only if the source gave one. */
  rating?: number;
  date?: string;
};

/**
 * Guest testimonial. Content rule: only real, attributable reviews with their
 * source — never invented quotes or composite guests.
 */
export default function TestimonialCard({ t, className, variant = "card" }: { t: Testimonial; className?: string; variant?: "card" | "feature" }) {
  const feature = variant === "feature";
  return (
    <figure className={cn("flex flex-col gap-6", !feature && "border border-line bg-ivory p-7 sm:p-9", className)}>
      <svg aria-hidden="true" viewBox="0 0 32 24" className={cn("text-brass", feature ? "h-8 w-10" : "h-6 w-8")} fill="currentColor">
        <path d="M0 24V14C0 6 4.5 1.2 12 0l1.4 3.2C9 4.6 7 7.6 6.8 11H12v13zm18 0V14c0-8 4.5-12.8 12-14l1.4 3.2C27 4.6 25 7.6 24.8 11H30v13z" />
      </svg>
      {t.rating != null && (
        <p className="flex gap-1 text-brass" aria-label={`Rated ${t.rating} out of 5`}>
          {Array.from({ length: 5 }, (_, i) => (
            <svg key={i} aria-hidden="true" viewBox="0 0 16 16" className="size-3.5" fill={i < Math.round(t.rating!) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1">
              <path d="M8 1.5l1.9 4.1 4.4.5-3.3 3 .9 4.4L8 11.3l-3.9 2.2.9-4.4-3.3-3 4.4-.5z" />
            </svg>
          ))}
        </p>
      )}
      <blockquote className={cn("font-serif leading-[1.3] text-ink", feature ? "text-[clamp(1.7rem,1.3rem+1.6vw,2.6rem)]" : "text-[1.45rem]")}>
        <p>{t.quote}</p>
      </blockquote>
      <figcaption className="mt-auto flex flex-col gap-1 border-t border-line pt-5 text-sm">
        <span className="font-medium text-ink">{t.author}</span>
        <span className="text-muted-foreground">
          {[t.detail, t.date].filter(Boolean).join(" · ")}
          {t.detail || t.date ? " · " : ""}
          {t.sourceUrl ? (
            <a href={t.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-link">
              {t.source}
            </a>
          ) : (
            t.source
          )}
        </span>
      </figcaption>
    </figure>
  );
}
