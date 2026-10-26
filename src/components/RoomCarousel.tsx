"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { formatTaka, type RoomType } from "@/lib/rooms";
import styles from "./RoomCarousel.module.css";

/** Mobile home: horizontally swiped room cards with a position indicator. */
export default function RoomCarousel({ rooms }: { rooms: RoomType[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const onScroll = () => {
    const el = track.current;
    if (!el || !el.firstElementChild) return;
    const step = (el.firstElementChild as HTMLElement).offsetWidth + 14;
    setActive(Math.min(rooms.length - 1, Math.round(el.scrollLeft / step)));
  };

  return (
    <>
      <div ref={track} className={styles.track} onScroll={onScroll}>
        {rooms.map((room) => (
          <Link key={room.slug} href={`/rooms/${room.slug}`} className={styles.card}>
            <span className={`ph ${styles.photo}`}>
              <span className={styles.tag}>{room.tag}</span>
              <span className={styles.photoRef}>{room.photo_ref.split(" · ").pop()}</span>
            </span>
            <span className={styles.body}>
              <span className={styles.name}>{room.name}</span>
              <span className={styles.meta}>{room.features.join(" · ")}</span>
              <span className={styles.price}>
                {formatTaka(room.price_bdt)}
                <span className={styles.per}> / night</span>
              </span>
            </span>
          </Link>
        ))}
      </div>
      <div className={styles.dots} aria-hidden="true">
        {rooms.map((r, i) => (
          <span key={r.slug} className={i === active ? styles.dotActive : styles.dot} />
        ))}
      </div>
    </>
  );
}
