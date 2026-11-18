// next/image loader (next.config.ts → images.loaderFile).
//
// Hotel photos in public/photos have pre-generated WebP copies at 480, 960 and
// 1600 px (scripts/gen-photo-variants.mts); the browser picks from the srcset
// that next/image builds, so phones download a few tens of KB instead of the
// full JPEG. Other images (admin uploads in Supabase Storage, brand files) are
// served as they are; admin uploads are already resized in the browser.

const WIDTHS = [480, 960, 1600];

export default function imageLoader({ src, width }: { src: string; width: number; quality?: number }): string {
  const m = /^\/photos\/([A-Za-z0-9_-]{2,60})\.(jpe?g|png|webp|avif)$/i.exec(src);
  if (m) {
    const w = WIDTHS.find((x) => x >= width) ?? WIDTHS[WIDTHS.length - 1];
    return `/photos/w${w}/${m[1]}.webp`;
  }
  // Keep the width in the URL so next/image accepts the loader; the file is the same.
  return `${src}${src.includes("?") ? "&" : "?"}w=${width}`;
}
