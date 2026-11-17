import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";
import type { Database } from "./database.types";

export type TypedClient = SupabaseClient<Database>;

let publicClient: TypedClient | null | undefined;

/**
 * Anonymous client for public pages and the website booking action. It never
 * reads cookies, so the pages that use it stay static/cacheable. RLS and the
 * granted RPCs (room_availability, create_booking) decide what it can do.
 */
export function getPublicClient(): TypedClient | null {
  if (publicClient !== undefined) return publicClient;
  publicClient =
    SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
      ? createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;
  return publicClient;
}

/**
 * Client acting as the signed-in staff member (session in cookies). Use in
 * Server Components, Server Actions and Route Handlers. Always verify the
 * user server-side (getClaims/getUser) before trusting the session — see
 * src/lib/admin/session.ts.
 */
export async function getSessionClient(): Promise<TypedClient> {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) throw new Error("Supabase is not configured");
  const store = await cookies();
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
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
