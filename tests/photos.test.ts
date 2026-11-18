// Every hotel photo has its web-sized copies, and the loader picks them.
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import imageLoader from "@/lib/image-loader";

const DIR = path.join(process.cwd(), "public", "photos");

describe("photo variants", () => {
  it("each photo in public/photos has 480, 960 and 1600 px WebP copies (run scripts/gen-photo-variants.mts)", () => {
    const missing: string[] = [];
    for (const f of readdirSync(DIR)) {
      const m = /^([A-Za-z0-9_-]{2,60})\.(jpe?g|png|webp|avif)$/i.exec(f);
      if (!m) continue;
      for (const w of [480, 960, 1600]) if (!existsSync(path.join(DIR, `w${w}`, `${m[1]}.webp`))) missing.push(`w${w}/${m[1]}.webp`);
    }
    expect(missing).toEqual([]);
  });

  it("the loader picks the smallest copy at least as wide as asked", () => {
    expect(imageLoader({ src: "/photos/DSC5566.jpg", width: 256 })).toBe("/photos/w480/DSC5566.webp");
    expect(imageLoader({ src: "/photos/DSC5566.jpg", width: 750 })).toBe("/photos/w960/DSC5566.webp");
    expect(imageLoader({ src: "/photos/DSC5566.jpg", width: 3840 })).toBe("/photos/w1600/DSC5566.webp");
    expect(imageLoader({ src: "https://x.supabase.co/storage/v1/object/public/room-photos/a/b.webp", width: 640 })).toMatch(/\?w=640$/);
  });
});
