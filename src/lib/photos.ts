import "server-only";
import fs from "node:fs";
import path from "node:path";

export type Tone = "sea" | "forest" | "sand" | "dusk";

/** A photo slot. `src` is set once the hotel's file is in public/photos. */
export type Photo = { ref: string; alt: string; src: string | null; tone: Tone };

const PHOTO_DIR = path.join(process.cwd(), "public", "photos");
const EXTENSIONS = ["jpg", "jpeg", "webp", "png", "avif"];

const cache = new Map<string, string | null>();

function findFile(ref: string): string | null {
  if (cache.has(ref)) return cache.get(ref)!;
  let src: string | null = null;
  for (const ext of EXTENSIONS) {
    if (fs.existsSync(path.join(PHOTO_DIR, `${ref}.${ext}`))) {
      src = `/photos/${ref}.${ext}`;
      break;
    }
  }
  // Re-check on every request in development so dropped-in photos appear.
  if (process.env.NODE_ENV === "production") cache.set(ref, src);
  return src;
}

/**
 * Drop the hotel's photos into public/photos named by their reference
 * (e.g. public/photos/DSC5562.jpg) and they replace the placeholders.
 */
export function photo(ref: string, alt: string, tone: Tone = "forest"): Photo {
  return { ref, alt, src: findFile(ref), tone };
}
