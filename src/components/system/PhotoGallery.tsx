"use client";

import { useMemo, useState } from "react";
import PhotoFrame from "@/components/ui/PhotoFrame";
import type { Photo } from "@/lib/photos";
import { cn } from "@/lib/utils";
import { Lightbox } from "./Gallery";

export type GalleryPhoto = Photo & { category: string; caption: string };

/**
 * Filterable photo wall. Filters are toggle buttons (aria-pressed); the count
 * of shown photos is announced. Every tile opens the full-screen lightbox,
 * which steps only through the photos currently shown.
 */
export default function PhotoGallery({ photos, categories }: { photos: GalleryPhoto[]; categories: { id: string; label: string }[] }) {
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const shown = useMemo(() => (filter === "all" ? photos : photos.filter((p) => p.category === filter)), [photos, filter]);
  const options = [{ id: "all", label: "All" }, ...categories];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
        <div role="group" aria-label="Show photos of" className="flex flex-wrap gap-2">
          {options.map((o) => {
            const count = o.id === "all" ? photos.length : photos.filter((p) => p.category === o.id).length;
            const on = filter === o.id;
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(o.id)}
                className={cn(
                  "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-5 text-sm transition-colors duration-300",
                  on ? "border-primary bg-primary text-primary-foreground" : "border-line-strong text-ink-soft hover:border-primary hover:text-ink",
                )}
              >
                {o.label}
                <span className={cn("tabular-nums", on ? "opacity-75" : "text-muted-foreground")}>{count}</span>
              </button>
            );
          })}
        </div>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {shown.length} {shown.length === 1 ? "photograph" : "photographs"}
        </p>
      </div>

      <ul role="list" className="mt-8 columns-1 gap-4 sm:columns-2 lg:columns-3 [&>li]:mb-4">
        {shown.map((p, i) => (
          <li key={p.ref} className="break-inside-avoid">
            <button
              type="button"
              onClick={() => {
                setIndex(i);
                setOpen(true);
              }}
              className="hover-zoom group block w-full cursor-zoom-in text-left"
              aria-label={`Open photo ${i + 1} of ${shown.length}: ${p.alt}`}
            >
              <PhotoFrame photo={p} zoom bare sizes="(min-width: 1180px) 33vw, (min-width: 640px) 50vw, 100vw" className={i % 3 === 1 ? "aspect-[4/5]" : "aspect-[4/3]"} />
              <span className="mt-3 flex items-baseline justify-between gap-4 text-sm">
                <span className="text-ink">{p.caption}</span>
                <span className="caps text-[0.62rem] text-muted-foreground">{categories.find((c) => c.id === p.category)?.label}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Lightbox photos={shown} index={Math.min(index, shown.length - 1)} onIndex={setIndex} open={open} onOpenChange={setOpen} title="Blossom Square" />
    </div>
  );
}
