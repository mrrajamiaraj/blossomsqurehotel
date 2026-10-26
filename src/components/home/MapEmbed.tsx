"use client";

import { useState } from "react";
import { directionsUrl, mapEmbedUrl } from "@/lib/hotel";
import { ArrowUpRight, Pin } from "../icons";
import styles from "./MapEmbed.module.css";

/**
 * The Google map loads only when asked for: faster pages, and no
 * third-party requests until the guest chooses to see it.
 */
export default function MapEmbed() {
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);

  return (
    <div className={styles.map}>
      {loaded && (
        <iframe
          title="Map showing Blossom Square in Kolatoli, Cox's Bazar"
          src={mapEmbedUrl}
          className={`${styles.frame} ${ready ? styles.frameReady : ""}`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          onLoad={() => setReady(true)}
          data-lenis-prevent
        />
      )}
      {!ready && (
        <div className={styles.cover}>
          <svg className={styles.chart} viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            {/* A hand-drawn chart of the coast: sea, shoreline, Light House Road */}
            <rect width="400" height="300" fill="#efe5d3" />
            <path d="M0 0h120c-8 40 6 70-4 110s10 80 0 120-6 50-2 70H0z" fill="#cfdcd4" />
            {[24, 48, 72, 96].map((x) => (
              <path
                key={x}
                d={`M${x - 20} 20c6 30-4 60 2 95s-6 70 0 105 4 50 0 70`}
                stroke="#a9bfb4"
                strokeWidth="0.8"
                fill="none"
                strokeDasharray="3 5"
              />
            ))}
            <path d="M120 0c-8 40 6 70-4 110s10 80 0 120-6 50-2 70" stroke="#a8834a" strokeWidth="1" fill="none" />
            <path d="M118 150 C 180 140, 230 160, 400 140" stroke="#16201c" strokeOpacity=".35" strokeWidth="5" fill="none" />
            <path d="M200 0 C 205 80, 195 200, 210 300" stroke="#16201c" strokeOpacity=".18" strokeWidth="3" fill="none" />
            <text x="22" y="270" fontFamily="serif" fontStyle="italic" fontSize="13" fill="#4f7c74">Bay of Bengal</text>
            <text x="250" y="132" fontFamily="serif" fontSize="9" letterSpacing="2" fill="#3b4641">LIGHT HOUSE RD</text>
          </svg>
          <span className={styles.pin}>
            <span className={styles.pulse} />
            <Pin size={22} />
          </span>
          <div className={styles.actions}>
            <button type="button" className="btn btn--sm" onClick={() => setLoaded(true)} disabled={loaded}>
              {loaded ? "Loading map" : "View interactive map"}
            </button>
            <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="btn btn--outline btn--sm">
              Directions
              <ArrowUpRight />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
