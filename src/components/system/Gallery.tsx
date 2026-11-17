"use client";

import Image from "next/image";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useCallback, useRef, useState } from "react";
import PhotoFrame from "@/components/ui/PhotoFrame";
import type { Photo } from "@/lib/photos";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Close, Grid } from "../icons";

/**
 * Photo gallery: an editorial mosaic that opens a full-screen lightbox.
 *
 * Accessibility: each tile is a button named by its photo's alt text; the
 * lightbox is a modal dialog (focus trapped and restored, Escape closes);
 * ←/→ step through photos, and the position is announced ("Photo 3 of 8").
 * Touch: swipe left/right in the lightbox.
 * Only the hotel's own photographs (or the tonal placeholder) are shown.
 */
export default function Gallery({ photos, title = "Photos", className, max = 5 }: { photos: Photo[]; title?: string; className?: string; max?: number }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const shown = photos.slice(0, max);
  const extra = photos.length - shown.length;

  const show = (i: number) => {
    setIndex(i);
    setOpen(true);
  };

  if (!photos.length) return null;

  return (
    <div className={className}>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:grid-rows-2 md:gap-3">
        {shown.map((p, i) => (
          <button
            key={p.ref + i}
            type="button"
            onClick={() => show(i)}
            className={cn(
              "hover-zoom relative cursor-zoom-in overflow-hidden",
              i === 0 ? "col-span-2 row-span-2 aspect-[4/3] md:aspect-auto" : "aspect-[4/3]",
            )}
            aria-label={`Open photo ${i + 1} of ${photos.length}: ${p.alt}`}
          >
            <PhotoFrame photo={p} zoom bare={i > 0} sizes={i === 0 ? "(min-width: 860px) 50vw, 100vw" : "(min-width: 860px) 25vw, 50vw"} className="h-full w-full" />
            {i === shown.length - 1 && extra > 0 && (
              <span className="absolute inset-0 grid place-items-center bg-[rgba(10,18,15,0.55)] text-cream">
                <span className="flex items-center gap-2 text-[0.72rem] font-semibold tracking-[0.16em] uppercase">
                  <Grid size={16} /> +{extra} more
                </span>
              </span>
            )}
          </button>
        ))}
      </div>

      <Lightbox photos={photos} index={index} onIndex={setIndex} open={open} onOpenChange={setOpen} title={title} />
    </div>
  );
}

export function Lightbox({
  photos,
  index,
  onIndex,
  open,
  onOpenChange,
  title,
}: {
  photos: Photo[];
  index: number;
  onIndex: (i: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
}) {
  const count = photos.length;
  const go = useCallback((delta: number) => onIndex((index + delta + count) % count), [index, count, onIndex]);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const p = photos[index];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ui-overlay !bg-[rgba(6,12,10,0.94)]" />
        <DialogPrimitive.Content
          data-surface="dark"
          className="ui-pop fixed inset-0 z-[190] flex flex-col text-cream outline-none"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") go(1);
            if (e.key === "ArrowLeft") go(-1);
          }}
          onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
          onTouchEnd={(e) => {
            const start = touch.current;
            touch.current = null;
            if (!start) return;
            const dx = e.changedTouches[0].clientX - start.x;
            const dy = e.changedTouches[0].clientY - start.y;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) go(dx < 0 ? 1 : -1);
          }}
        >
          <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <DialogPrimitive.Title className="font-serif text-xl">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Use the left and right arrow keys, or swipe, to move between photos.</DialogPrimitive.Description>
            <div className="flex items-center gap-3">
              <span className="text-xs tracking-[0.14em] text-cream/70 tabular-nums" aria-live="polite">
                <span className="sr-only">Photo </span>
                {index + 1} <span aria-hidden="true">/</span>
                <span className="sr-only"> of</span> {count}
              </span>
              <DialogPrimitive.Close aria-label="Close gallery" className="grid size-11 cursor-pointer place-items-center rounded-full hover:bg-white/10">
                <Close size={18} />
              </DialogPrimitive.Close>
            </div>
          </div>

          <div className="relative min-h-0 flex-1">
            {p && (
              <figure key={p.ref + index} className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-2 pb-6 sm:px-20 motion-safe:animate-rise">
                <div className="relative h-full w-full">
                  {p.src ? (
                    <Image src={p.src} alt={p.alt} fill sizes="100vw" className="object-contain" />
                  ) : (
                    <div className="photo-plate" data-tone={p.tone} role="img" aria-label={p.alt} />
                  )}
                </div>
                <figcaption className="text-center text-sm text-cream/75">{p.alt}</figcaption>
              </figure>
            )}
            {count > 1 && (
              <>
                <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className="absolute top-1/2 left-2 grid size-12 -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-white/20 bg-black/30 backdrop-blur hover:bg-black/50 sm:left-6">
                  <ChevronLeft size={20} />
                </button>
                <button type="button" onClick={() => go(1)} aria-label="Next photo" className="absolute top-1/2 right-2 grid size-12 -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-white/20 bg-black/30 backdrop-blur hover:bg-black/50 sm:right-6">
                  <ChevronRight size={20} />
                </button>
              </>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
