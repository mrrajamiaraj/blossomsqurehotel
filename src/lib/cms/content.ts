import "server-only";
import { draftMode } from "next/headers";
import { cache } from "react";
import { buildFaqs } from "../content/faq";
import type { HotelSettings } from "../data/types";
import { getPublicClient, getSessionClient, isSupabaseConfigured } from "../supabase";
import { mergeDefaults } from "./fields";
import { toHotelInfo, type HotelInfo } from "./hotel-info";
import { sectionDef, type SectionContent, type SectionKey } from "./sections";

type Stored = { body: unknown; draft?: unknown };

/**
 * Published content for every section, read once per request with the
 * anonymous client (so pages stay cacheable). Visitors can only read the
 * published columns (RLS + column grants); drafts never leave the database
 * except to editors.
 */
const published = cache(async (): Promise<Map<string, Stored>> => {
  const db = getPublicClient();
  const map = new Map<string, Stored>();
  if (!db) return map;
  try {
    const { data, error } = await db.from("site_content").select("key, body").eq("locale", "en").eq("status", "published");
    if (error) throw new Error(error.message);
    for (const row of data ?? []) map.set(row.key, { body: row.body });
  } catch (err) {
    console.error("Website content unavailable, using the built-in text:", err instanceof Error ? err.message : err);
  }
  return map;
});

/** In a draft preview (Admin → Website content → Preview), editors see their unpublished drafts. */
const drafts = cache(async (): Promise<Map<string, Stored> | null> => {
  if (!isSupabaseConfigured()) return null;
  let enabled = false;
  try {
    enabled = (await draftMode()).isEnabled;
  } catch {
    return null; // outside a request (build-time prerender)
  }
  if (!enabled) return null;
  try {
    const db = await getSessionClient();
    const { data, error } = await db.rpc("admin_list_content");
    if (error) return null;
    const map = new Map<string, Stored>();
    for (const row of (data ?? []) as { key: string; locale: string; body: unknown; draft_body: unknown }[]) {
      if (row.locale !== "en") continue;
      map.set(row.key, { body: row.draft_body ?? row.body });
    }
    return map;
  } catch {
    return null;
  }
});

export async function isPreviewingDrafts(): Promise<boolean> {
  return Boolean(await drafts());
}

/**
 * A section's content: the editor's published values over the built-in text,
 * field by field. `settings` fills defaults that follow Settings (the FAQ).
 */
export async function getSection<K extends SectionKey>(key: K, settings?: HotelSettings): Promise<SectionContent[K]> {
  const def = sectionDef(key)!;
  let defaults = def.defaults;
  if (key === "faq" && settings) {
    const hotel = toHotelInfo(await getSection("contact"));
    defaults = { ...defaults, groups: buildFaqs(settings, hotel).map((g) => ({ title: g.title, items: g.items.map((i) => ({ q: i.q, a: i.a })) })) };
  }
  const stored = (await drafts())?.get(key) ?? (await published()).get(key);
  return mergeDefaults(defaults, stored?.body) as unknown as SectionContent[K];
}

/** Whether an editor has published (or, in preview, drafted) their own version of a section. */
export async function hasCustom(key: SectionKey): Promise<boolean> {
  return Boolean((await drafts())?.get(key) ?? (await published()).get(key));
}

/** The hotel's contact details, from the Contact details section. */
export async function getHotelInfo(): Promise<HotelInfo> {
  return toHotelInfo(await getSection("contact"));
}
