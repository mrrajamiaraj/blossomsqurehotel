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

/** Every photo in public/photos, for the admin's image picker. */
export function localPhotos(): { ref: string; src: string }[] {
  try {
    return fs
      .readdirSync(PHOTO_DIR)
      .map((f) => /^([A-Za-z0-9_-]{2,60})\.(jpe?g|webp|png|avif)$/i.exec(f))
      .filter((m): m is RegExpExecArray => Boolean(m))
      .map((m) => ({ ref: m[1], src: `/photos/${m[0]}` }))
      .sort((a, b) => a.ref.localeCompare(b.ref));
  } catch {
    return [];
  }
}

/**
 * A gallery entry is either a full URL (a photo uploaded from Admin → Rooms,
 * kept in Supabase Storage) or a reference to a file in public/photos
 * (e.g. "DSC5562" for public/photos/DSC5562.jpg).
 */
export function photo(ref: string, alt: string, tone: Tone = "forest"): Photo {
  return { ref, alt, src: ref.startsWith("https://") ? ref : findFile(ref), tone };
}
