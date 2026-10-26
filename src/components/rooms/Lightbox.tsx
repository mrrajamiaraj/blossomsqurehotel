"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Photo } from "@/lib/photos";
import { ChevronLeft, ChevronRight, Close } from "../icons";
import { lockScroll } from "../motion/SmoothScroll";
import styles from "./Lightbox.module.css";

type Props = { photos: Photo[]; start: number; title: string; onClose: () => void };

/** Full-screen viewer: arrows, keyboard, swipe, and a thumbnail strip. */
export default function Lightbox({ photos, start, title, onClose }: Props) {
  const [index, setIndex] = useState(start);
  const [dir, setDir] = useState<1 | -1>(1);
  const touch = useRef<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const go = useCallback(
    (step: 1 | -1) => {
      setDir(step);
      setIndex((i) => (i + step + photos.length) % photos.length);
    },
    [photos.length],
  );

  useEffect(() => {
    lockScroll(true);
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      lockScroll(false);
      previous?.focus?.();
    };
  }, [go, onClose]);

  const photo = photos[index];

  return createPortal(
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={`${title} photos`}>
      <div className={styles.top}>
        <p className={styles.title}>
          {title} <span>{photo.alt}</span>
        </p>
        <span className={styles.count}>
          {String(index + 1).padStart(2, "0")} / {String(photos.length).padStart(2, "0")}
        </span>
        <button ref={closeRef} type="button" className={styles.close} onClick={onClose} aria-label="Close photos">
          <Close />
        </button>
      </div>

      <div
        className={styles.stage}
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touch.current == null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          touch.current = null;
        }}
      >
        <button type="button" className={`${styles.nav} ${styles.prev}`} onClick={() => go(-1)} aria-label="Previous photo">
          <ChevronLeft size={26} />
        </button>
        <figure key={photo.ref} className={`photo ${styles.figure}`} data-dir={dir}>
          {photo.src ? (
            <Image src={photo.src} alt={photo.alt} fill sizes="100vw" style={{ objectFit: "contain" }} />
          ) : (
            <>
              <div className="photo-plate" data-tone={photo.tone} role="img" aria-label={photo.alt} />
              <span className="photo-ref">{photo.ref}</span>
            </>
          )}
        </figure>
        <button type="button" className={`${styles.nav} ${styles.next}`} onClick={() => go(1)} aria-label="Next photo">
          <ChevronRight size={26} />
        </button>
      </div>

      <div className={styles.strip}>
        {photos.map((p, i) => (
          <button
            key={p.ref}
            type="button"
            className={`photo ${styles.thumb} ${i === index ? styles.thumbOn : ""}`}
            onClick={() => {
              setDir(i > index ? 1 : -1);
              setIndex(i);
            }}
            aria-label={`Photo ${i + 1}: ${p.alt}`}
            aria-current={i === index}
          >
            {p.src ? <Image src={p.src} alt="" fill sizes="120px" /> : <div className="photo-plate" data-tone={p.tone} />}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
