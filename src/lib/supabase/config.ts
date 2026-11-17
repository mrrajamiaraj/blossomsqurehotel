/**
 * Public Supabase settings, safe for both server and browser bundles.
 *
 * Key conventions (https://supabase.com/docs/guides/api/api-keys):
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  sb_publishable_…  browser-safe, RLS applies
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY         legacy anon JWT   accepted as a fallback while migrating
 *   SUPABASE_SECRET_KEY                   sb_secret_…       server only — see ./admin.ts
 *
 * NEXT_PUBLIC_* values are inlined at build time, so they must be read with
 * literal `process.env.NAME` expressions (no dynamic lookups).
 */

export const SUPABASE_URL: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL || undefined;

export const SUPABASE_PUBLISHABLE_KEY: string | undefined =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined;

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

/** Public bucket that holds room photos uploaded from the admin. */
export const ROOM_PHOTO_BUCKET = "room-photos";
