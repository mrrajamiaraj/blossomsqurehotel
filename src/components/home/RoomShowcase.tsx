"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { formatTaka } from "@/lib/format";
import type { Photo } from "@/lib/photos";
import { ArrowLeft, ArrowRight } from "../icons";
import styles from "./RoomShowcase.module.css";

export type ShowcaseRoom = {
  slug: string;
  name: string;
  tag: string;
  blurb: string;
  features: string[];
  price: number;
  cover: Photo;
};

const NUMERALS = ["I", "II", "III", "IV", "V"];

function Cover({ photo, sizes }: { photo: Photo; sizes: string }) {
  return photo.src ? (
    <Image src={photo.src} alt={photo.alt} fill sizes={sizes} />
  ) : (
    <>
      <div className="photo-plate" data-tone={photo.tone} role="img" aria-label={photo.alt} />
      <span className="photo-ref">{photo.ref}</span>
    </>
  );
}

/**
 * Desktop: an index of rooms beside one large image that changes as each
 * name is hovered or focused. Phones: a swipeable deck with a progress rule.
 */
export default function RoomShowcase({ rooms }: { rooms: ShowcaseRoom[] }) {
  const [active, setActive] = useState(0);
  const [slide, setSlide] = useState(0);
  const track = useRef<HTMLDivElement>(null);

  const room = rooms[active];

  const onTrackScroll = () => {
    const el = track.current;
    if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    if (!card) return;
    setSlide(Math.round(el.scrollLeft / (card.offsetWidth + 16)));
  };

  const go = (dir: 1 | -1) => {
    const el = track.current;
    const card = el?.firstElementChild as HTMLElement | null;
    if (!el || !card) return;
    el.scrollBy({ left: dir * (card.offsetWidth + 16), behavior: "smooth" });
  };

  return (
    <>
      {/* Desktop index */}
      <div className={styles.desk}>
        <ol role="list" className={styles.index}>
          {rooms.map((r, i) => (
            <li key={r.slug}>
              <Link
                href={`/rooms/${r.slug}`}
                className={`${styles.item} ${i === active ? styles.itemOn : ""}`}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                aria-describedby={`room-${r.slug}-blurb`}
              >
                <span className={styles.num}>{NUMERALS[i]}</span>
                <span className={styles.name}>{r.name}</span>
                <span className={styles.price}>
                  <span className={styles.from}>from</span> {formatTaka(r.price)}
                </span>
              </Link>
            </li>
          ))}
        </ol>

        <div className={styles.stage}>
          <div className={styles.frames}>
            {rooms.map((r, i) => (
              <div key={r.slug} className={`photo ${styles.frame} ${i === active ? styles.frameOn : ""}`} aria-hidden={i !== active}>
                <Cover photo={r.cover} sizes="(max-width: 1200px) 55vw, 760px" />
              </div>
            ))}
            <span key={room.slug} className={styles.tag}>
              {room.tag}
            </span>
          </div>
          <div className={styles.detail} key={room.slug}>
            <p id={`room-${room.slug}-blurb`} className={styles.blurb}>
              {room.blurb}
            </p>
            <ul role="list" className={styles.features}>
              {room.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
              <li>Breakfast for two</li>
            </ul>
            <div className={styles.actions}>
              <Link href={`/rooms/${room.slug}`} className="link-line">
                Discover the room
              </Link>
              <Link href={`/booking?room=${room.slug}`} className="btn btn--outline btn--sm">
                Reserve
                <ArrowRight />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Phone deck */}
      <div className={styles.mobile}>
        <div ref={track} className={styles.track} onScroll={onTrackScroll}>
          {rooms.map((r, i) => (
            <Link key={r.slug} href={`/rooms/${r.slug}`} className={`${styles.card} hover-zoom`}>
              <div className={`photo photo--zoom ${styles.cardPhoto}`}>
                <Cover photo={r.cover} sizes="85vw" />
                <span className={styles.tag}>{r.tag}</span>
              </div>
              <div className={styles.cardBody}>
                <span className={styles.cardNum}>{NUMERALS[i]}.</span>
                <span className={styles.cardName}>{r.name}</span>
                <span className={styles.cardMeta}>{r.features.join(" · ")}</span>
                <span className={styles.cardPrice}>
                  {formatTaka(r.price)} <span>/ night</span>
                </span>
              </div>
            </Link>
          ))}
        </div>
        <div className={styles.deckNav}>
          <div className={styles.progress} aria-hidden="true">
            <span style={{ width: `${((slide + 1) / rooms.length) * 100}%` }} />
          </div>
          <span className={styles.count}>
            {String(slide + 1).padStart(2, "0")} / {String(rooms.length).padStart(2, "0")}
          </span>
          <button type="button" className={styles.arrow} onClick={() => go(-1)} disabled={slide === 0} aria-label="Previous room">
            <ArrowLeft />
          </button>
          <button
            type="button"
            className={styles.arrow}
            onClick={() => go(1)}
            disabled={slide >= rooms.length - 1}
            aria-label="Next room"
          >
            <ArrowRight />
          </button>
        </div>
      </div>
    </>
  );
}
