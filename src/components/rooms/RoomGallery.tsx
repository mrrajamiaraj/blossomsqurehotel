"use client";

import Image from "next/image";
import { useState } from "react";
import type { Photo } from "@/lib/photos";
import { Grid } from "../icons";
import Lightbox from "./Lightbox";
import styles from "./RoomGallery.module.css";

/** One large photo and two smaller ones; any of them opens the lightbox. */
export default function RoomGallery({ photos, title }: { photos: Photo[]; title: string }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <>
      <div className={styles.mosaic}>
        {photos.slice(0, 3).map((p, i) => (
          <button
            key={p.ref}
            type="button"
            className={`photo ${styles.tile} ${i === 0 ? styles.lead : ""}`}
            onClick={() => setOpen(i)}
            aria-label={`Open photo: ${p.alt}`}
            data-reveal="mask"
            style={{ "--d": `${i * 140}ms` } as React.CSSProperties}
          >
            <span className={styles.inner}>
              {p.src ? (
                <Image src={p.src} alt={p.alt} fill priority={i === 0} sizes={i === 0 ? "(max-width: 900px) 100vw, 66vw" : "33vw"} />
              ) : (
                <>
                  <span className="photo-plate" data-tone={p.tone} />
                  <span className="photo-ref">{p.ref}</span>
                </>
              )}
            </span>
          </button>
        ))}
        <button type="button" className={styles.all} onClick={() => setOpen(0)}>
          <Grid />
          All photos
        </button>
      </div>
      {open !== null && <Lightbox photos={photos} start={open} title={title} onClose={() => setOpen(null)} />}
    </>
  );
}
