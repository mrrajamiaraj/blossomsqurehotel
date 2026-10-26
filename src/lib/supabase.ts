import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function isSupabaseConfigured(): boolean {
  return Boolean(URL && ANON_KEY);
}

let publicClient: SupabaseClient | null | undefined;

/** Anonymous client for public pages: no cookies, so pages stay cacheable. */
export function getPublicClient(): SupabaseClient | null {
  if (publicClient !== undefined) return publicClient;
  publicClient = URL && ANON_KEY ? createClient(URL, ANON_KEY, { auth: { persistSession: false } }) : null;
  return publicClient;
}

/** Client acting as the signed-in staff member (session in cookies). */
export async function getSessionClient(): Promise<SupabaseClient> {
  if (!URL || !ANON_KEY) throw new Error("Supabase is not configured");
  const store = await cookies();
  return createServerClient(URL, ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // proxy refreshes the session on the next request instead.
        }
      },
    },
  });
}

/**
 * Service-role client for the few server-only tasks that need it (inviting
 * staff). Never import this into client code; the key bypasses RLS.
 */
export function getServiceClient(): SupabaseClient | null {
  if (!URL || !SERVICE_KEY) return null;
  return createClient(URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
