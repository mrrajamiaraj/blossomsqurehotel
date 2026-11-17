"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Photo } from "@/lib/photos";
import { ArrowRight } from "../icons";
import styles from "./StoryTabs.module.css";

export type Story = {
  id: string;
  tab: string;
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  cta: { label: string; href: string };
  photo: Photo;
};

/** Dining / Meetings & Events, switched with real ARIA tabs. */
export default function StoryTabs({ stories }: { stories: Story[] }) {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  // Arriving on /#events (from the menu or footer) opens that tab.
  useEffect(() => {
    const sync = () => {
      const i = stories.findIndex((s) => `#${s.id}` === window.location.hash);
      if (i >= 0) setActive(i);
    };
    // Client-side links to a hash on this page don't fire hashchange.
    const onClick = (e: MouseEvent) => {
      const href = (e.target as Element).closest?.("a")?.getAttribute("href") ?? "";
      const i = stories.findIndex((s) => href.endsWith(`#${s.id}`));
      if (i >= 0) setActive(i);
    };
    sync();
    window.addEventListener("hashchange", sync);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", sync);
      document.removeEventListener("click", onClick);
    };
  }, [stories]);

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (i + dir + stories.length) % stories.length;
    setActive(next);
    tabs.current[next]?.focus();
  };

  const story = stories[active];

  return (
    <div className={styles.root}>
      {/* Anchors so /#dining and /#events land here */}
      {stories.map((s) => (
        <span key={s.id} id={s.id} className={styles.anchor} aria-hidden="true" />
      ))}

      <div className={styles.tabs} role="tablist" aria-label="Dining and events">
        {stories.map((s, i) => (
          <button
            key={s.id}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${s.id}`}
            aria-selected={i === active}
            aria-controls={`panel-${s.id}`}
            tabIndex={i === active ? 0 : -1}
            className={`${styles.tab} ${i === active ? styles.tabOn : ""}`}
            onClick={() => setActive(i)}
            onKeyDown={(e) => onKey(e, i)}
          >
            <span className={styles.tabNum}>0{i + 1}</span>
            {s.tab}
          </button>
        ))}
      </div>

      <div className={styles.body}>
        <div className={styles.media}>
          {stories.map((s, i) => (
            <div key={s.id} className={`photo ${styles.frame} ${i === active ? styles.frameOn : ""}`} aria-hidden={i !== active}>
              {s.photo.src ? (
                <Image src={s.photo.src} alt={s.photo.alt} fill sizes="(max-width: 900px) 100vw, 55vw" />
              ) : (
                <>
                  <div className="photo-plate" data-tone={s.photo.tone} role="img" aria-label={s.photo.alt} />
                  <span className="photo-ref">Photograph to come</span>
                </>
              )}
            </div>
          ))}
        </div>

        <div
          key={story.id}
          id={`panel-${story.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${story.id}`}
          className={styles.panel}
        >
          <p className="caps eyebrow">{story.eyebrow}</p>
          <h3 className={`h2 ${styles.title}`}>
            {story.title.split("*").map((part, i) => (i % 2 ? <em key={i}>{part}</em> : part))}
          </h3>
          <p className={styles.text}>{story.body}</p>
          <ul role="list" className={styles.points}>
            {story.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <a href={story.cta.href} className="btn btn--ghost-light">
            {story.cta.label}
            <ArrowRight />
          </a>
        </div>
      </div>
    </div>
  );
}
