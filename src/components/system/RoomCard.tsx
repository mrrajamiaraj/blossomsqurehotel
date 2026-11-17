import Link from "next/link";
import PhotoFrame from "@/components/ui/PhotoFrame";
import { Badge } from "@/components/primitives/surface";
import { Skeleton } from "@/components/primitives/surface";
import { formatTaka } from "@/lib/format";
import type { Photo } from "@/lib/photos";
import { cn } from "@/lib/utils";
import { ArrowRight } from "../icons";

export type RoomCardProps = {
  href: string;
  name: string;
  /** "Suite", "Room" … */
  kind: string;
  photo: Photo;
  /** e.g. ["King bed", "Sea-facing", "Sleeps 2"] */
  facts: string[];
  blurb?: string;
  priceBdt: number;
  /** Published ("rack") rate, shown struck through. */
  wasBdt?: number | null;
  /** e.g. "৳3,500 Thu & Fri" */
  priceNote?: string;
  /** Small status line over the photo, e.g. "Only one left". */
  badge?: string;
  bookHref?: string;
  priority?: boolean;
  /** "stacked" for grids, "wide" for list rows on desktop. */
  layout?: "stacked" | "wide";
  headingLevel?: "h2" | "h3";
  className?: string;
};

/**
 * Room card. The whole card is one link target (the name); the Book button is
 * a separate, real link — no nested interactive elements. The photo zooms
 * slowly on hover (pointer devices, motion allowed).
 */
export default function RoomCard({
  href,
  name,
  kind,
  photo,
  facts,
  blurb,
  priceBdt,
  wasBdt,
  priceNote,
  badge,
  bookHref,
  priority,
  layout = "stacked",
  headingLevel: H = "h3",
  className,
}: RoomCardProps) {
  const wide = layout === "wide";
  return (
    <article
      className={cn(
        "hover-zoom group relative grid border border-line bg-ivory text-ink shadow-xs transition-shadow duration-700 hover:shadow-md",
        // Keyboard focus on the stretched name link outlines the whole card.
        "has-[[data-card-link]:focus-visible]:outline-[1.5px] has-[[data-card-link]:focus-visible]:outline-offset-4 has-[[data-card-link]:focus-visible]:outline-ring has-[[data-card-link]:focus-visible]:outline-solid",
        wide ? "md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]" : "grid-rows-[auto_1fr]",
        className,
      )}
    >
      <div className="relative">
        <PhotoFrame
          photo={photo}
          zoom
          priority={priority}
          sizes={wide ? "(min-width: 860px) 55vw, 100vw" : "(min-width: 1180px) 33vw, (min-width: 640px) 50vw, 100vw"}
          className={cn("aspect-[4/3]", wide && "md:aspect-auto md:h-full md:min-h-[360px]")}
        />
        {badge && (
          <Badge tone="glass" className="absolute top-4 left-4">
            {badge}
          </Badge>
        )}
      </div>

      <div className="flex flex-col gap-4 p-6 sm:p-8">
        <p className="caps text-bronze">{kind}</p>
        <H className="font-serif text-[clamp(1.7rem,1.4rem+1vw,2.25rem)] leading-[1.05] font-normal">
          {/* Stretched link: the whole card is clickable, the name is the accessible label. */}
          <Link href={href} data-card-link className="after:absolute after:inset-0 after:z-0 focus-visible:outline-none">
            {name}
          </Link>
        </H>
        <ul role="list" className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {facts.map((f, i) => (
            <li key={f} className="flex items-center gap-3">
              {i > 0 && <span aria-hidden="true" className="size-1 rounded-full bg-brass/60" />}
              {f}
            </li>
          ))}
        </ul>
        {blurb && <p className="line-clamp-3 text-base leading-relaxed text-ink-soft">{blurb}</p>}

        <div className="mt-auto flex flex-wrap items-end justify-between gap-4 border-t border-line pt-5">
          <PriceTag priceBdt={priceBdt} wasBdt={wasBdt} note={priceNote} />
          {bookHref && (
            <Link
              href={bookHref}
              className="relative z-10 inline-flex min-h-11 items-center gap-3 text-[0.72rem] font-semibold tracking-[0.14em] text-primary uppercase"
            >
              Book
              <ArrowRight />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * An amount in taka for serif settings. Cormorant has no ৳ glyph (the browser
 * would substitute an oversized fallback), so the symbol is set in Inter at a
 * matched size, and the digits use lining figures so prices align.
 */
export function Money({ amount, className }: { amount: number; className?: string }) {
  return (
    <span className={cn("whitespace-nowrap [font-variant-numeric:lining-nums_tabular-nums]", className)}>
      <span className="mr-[0.08em] align-[0.12em] font-sans text-[0.62em] font-medium">৳</span>
      {amount.toLocaleString("en-US")}
    </span>
  );
}

export function PriceTag({ priceBdt, wasBdt, note, className }: { priceBdt: number; wasBdt?: number | null; note?: string; className?: string }) {
  return (
    <p className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-[0.66rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">From</span>
      <span className="flex flex-wrap items-baseline gap-x-2 font-serif text-[1.95rem] leading-none">
        {wasBdt && wasBdt > priceBdt && (
          <s className="font-sans text-sm text-muted-foreground decoration-1">
            <span className="sr-only">Was </span>
            {formatTaka(wasBdt)}
          </s>
        )}
        <Money amount={priceBdt} />
        <span className="font-sans text-sm text-muted-foreground">/ night</span>
      </span>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </p>
  );
}

export function RoomCardSkeleton({ layout = "stacked" }: { layout?: "stacked" | "wide" }) {
  return (
    <div className={cn("grid border border-line bg-ivory", layout === "wide" && "md:grid-cols-[1.15fr_1fr]")}>
      <Skeleton className="aspect-[4/3] rounded-none" />
      <div className="flex flex-col gap-4 p-6 sm:p-8">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="mt-4 h-10 w-32" />
      </div>
    </div>
  );
}
