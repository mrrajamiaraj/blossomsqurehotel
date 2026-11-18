import "server-only";
import type { Metadata } from "next";
import { photo } from "../photos";
import { pageMetadata } from "../seo";
import { getSection } from "./content";
import type { ImageValue } from "./fields";
import { SEO_PAGES, type SeoPageId } from "./sections";

/** A CMS image as a URL the browser (or a crawler) can load. */
export function imageUrl(img: ImageValue | null | undefined): string | null {
  if (!img?.src) return null;
  return photo(img.src, img.alt).src;
}

/**
 * Title, description and sharing image for a page, from Website content →
 * Search & sharing, falling back to the built-in wording.
 */
export async function seoMetadata(id: SeoPageId, fallbackImage?: string | null): Promise<Metadata> {
  const page = SEO_PAGES.find((p) => p.id === id)!;
  const seo = await getSection("seo");
  const title = (seo[`${id}_title`] as string) || page.title;
  const description = (seo[`${id}_description`] as string) || page.description;
  const image = imageUrl(seo[`${id}_image`] as ImageValue | null) ?? fallbackImage ?? null;
  const meta = pageMetadata({ title, description, path: page.path, image });
  // The homepage title is used as written (no " · Blossom Square" suffix).
  return id === "home" ? { ...meta, title: { absolute: title } } : meta;
}
