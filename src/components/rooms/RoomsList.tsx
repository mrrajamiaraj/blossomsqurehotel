"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatTaka, plural } from "@/lib/format";
import type { Photo } from "@/lib/photos";
import { stayQuery, type Stay } from "@/lib/stay";
import { ArrowRight } from "../icons";
import styles from "./RoomsList.module.css";

export type ListRoom = {
  slug: string;
  name: string;
  tag: string;
  bed: string;
  floor: string;
  size: string;
  sleeps: number;
  blurb: string;
  price: number;
  gallery: Photo[];
  available: number;
};

type Sort = "recommended" | "price-asc" | "price-desc";

const SORTS: { id: Sort; label: string }[] = [
  { id: "recommended", label: "Recommended" },
  { id: "price-asc", label: "Price, low to high" },
  { id: "price-desc", label: "Price, high to low" },
];

const CHIPS = ["Sea view", "Balcony", "Breakfast included", "Pool access", "Mini bar", "AC · TV · Wi-Fi"];

function Shot({ photo, sizes, priority }: { photo: Photo; sizes: string; priority?: boolean }) {
  return photo.src ? (
    <Image src={photo.src} alt={photo.alt} fill sizes={sizes} priority={priority} />
  ) : (
    <>
      <div className="photo-plate" data-tone={photo.tone} role="img" aria-label={photo.alt} />
      <span className="photo-ref">{photo.ref}</span>
    </>
  );
}

function Gallery({ room, priority }: { room: ListRoom; priority?: boolean }) {
  const [shown, setShown] = useState(0);
  return (
    <div className={styles.gallery}>
      <div className={styles.main}>
        {room.gallery.map((p, i) => (
          <div key={p.ref} className={`photo ${styles.mainShot} ${i === shown ? styles.mainOn : ""}`} aria-hidden={i !== shown}>
            <Shot photo={p} sizes="(max-width: 900px) 100vw, 55vw" priority={priority && i === 0} />
          </div>
        ))}
        <span className={styles.tag}>{room.tag}</span>
        <span className={styles.counter} aria-hidden="true">
          {shown + 1} / {room.gallery.length}
        </span>
      </div>
      <div className={styles.thumbs} role="group" aria-label={`${room.name} photos`}>
        {room.gallery.map((p, i) => (
          <button
            key={p.ref}
            type="button"
            className={`photo ${styles.thumb} ${i === shown ? styles.thumbOn : ""}`}
            onClick={() => setShown(i)}
            onMouseEnter={() => setShown(i)}
            aria-label={`Show photo ${i + 1} of ${room.gallery.length}`}
            aria-pressed={i === shown}
          >
            {p.src ? (
              <Image src={p.src} alt="" fill sizes="160px" />
            ) : (
              <div className="photo-plate" data-tone={p.tone} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

type Props = { rooms: ListRoom[]; stay: Stay; nights: number; live: boolean; rangeLabel: string };

export default function RoomsList({ rooms, stay, nights, live, rangeLabel }: Props) {
  const [sort, setSort] = useState<Sort>("recommended");

  const sorted = useMemo(() => {
    const list = [...rooms];
    if (sort === "price-asc") list.sort((a, b) => a.price - b.price);
    if (sort === "price-desc") list.sort((a, b) => b.price - a.price);
    return list;
  }, [rooms, sort]);

  const open = rooms.filter((r) => r.available >= stay.rooms).length;

  return (
    <>
      <div className={styles.toolbar}>
        <p className={styles.result} aria-live="polite">
          {live ? (
            <>
              <strong>{plural(open, "room type")}</strong> available for <em>{rangeLabel}</em>
            </>
          ) : (
            <>
              <strong>{plural(rooms.length, "room type")}</strong> · prices for <em>{rangeLabel}</em>
            </>
          )}
        </p>
        <div className={styles.sort} role="radiogroup" aria-label="Sort rooms">
          {SORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={sort === s.id}
              className={`${styles.sortBtn} ${sort === s.id ? styles.sortOn : ""}`}
              onClick={() => setSort(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.list}>
        {sorted.map((room, i) => {
          const soldOut = live && room.available < stay.rooms;
          const fewLeft = live && !soldOut && room.available <= 1;
          const total = room.price * nights * stay.rooms;
          const query = stayQuery(stay, { room: room.slug });
          return (
            <article key={room.slug} className={`${styles.card} ${soldOut ? styles.soldOut : ""}`} data-reveal="up">
              <Gallery room={room} priority={i === 0} />
              <div className={styles.body}>
                <p className={styles.index}>
                  <span>{String(i + 1).padStart(2, "0")}</span> {room.tag === "SUITE" ? "Suite" : "Deluxe room"}
                </p>
                <h2 className={styles.name}>
                  <Link href={`/rooms/${room.slug}?${stayQuery(stay)}`}>{room.name}</Link>
                </h2>
                <p className={styles.meta}>
                  {[room.bed, room.floor, room.size, `Sleeps ${room.sleeps}`].join("  ·  ")}
                </p>
                <p className={styles.blurb}>{room.blurb}</p>
                <ul role="list" className={styles.chips}>
                  {CHIPS.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>

                <div className={styles.foot}>
                  <div className={styles.priceBlock}>
                    <span className={styles.price}>
                      {formatTaka(room.price)} <span>/ night</span>
                    </span>
                    <span className={styles.total}>
                      {formatTaka(total)} for {plural(nights, "night")}
                      {stay.rooms > 1 ? `, ${stay.rooms} rooms` : ""} · plus VAT &amp; service
                    </span>
                    {fewLeft && <span className={styles.few}>Only one left for these dates</span>}
                    {soldOut && <span className={styles.few}>Fully booked for these dates</span>}
                  </div>
                  <div className={styles.actions}>
                    <Link href={`/rooms/${room.slug}?${stayQuery(stay)}`} className="btn btn--outline btn--sm">
                      Details
                    </Link>
                    <Link
                      href={`/booking?${query}`}
                      className="btn btn--sm"
                      aria-disabled={soldOut}
                      tabIndex={soldOut ? -1 : undefined}
                    >
                      Select
                      <ArrowRight />
                    </Link>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
