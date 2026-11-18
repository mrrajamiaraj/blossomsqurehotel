// Pre-generates web-sized WebP copies of every photo in public/photos
// (480, 960 and 1600 px wide) into public/photos/w{width}/. The site's image
// loader (src/lib/image-loader.ts) picks the right one for each screen, so a
// 220-px thumbnail no longer downloads the full-size JPEG.
//
// Vercel's on-demand image optimizer is a paid quota (it broke photos when it
// ran out), so the variants are generated here once and committed.
//
//   npx tsx scripts/gen-photo-variants.mts        (only missing / outdated files)
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

export const WIDTHS = [480, 960, 1600] as const;
const DIR = path.join(process.cwd(), "public", "photos");

let made = 0;
for (const f of readdirSync(DIR)) {
  const m = /^([A-Za-z0-9_-]{2,60})\.(jpe?g|png|webp|avif)$/i.exec(f);
  if (!m) continue;
  const src = path.join(DIR, f);
  const meta = await sharp(src).metadata();
  for (const w of WIDTHS) {
    const outDir = path.join(DIR, `w${w}`);
    mkdirSync(outDir, { recursive: true });
    const out = path.join(outDir, `${m[1]}.webp`);
    if (existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs) continue;
    await sharp(src)
      .rotate()
      .resize({ width: Math.min(w, meta.width ?? w), withoutEnlargement: true })
      .webp({ quality: w <= 480 ? 70 : 74, effort: 5 })
      .toFile(out);
    made++;
  }
}
console.log(`Photo variants: ${made} written`);
