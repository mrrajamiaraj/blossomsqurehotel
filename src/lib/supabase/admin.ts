import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";
import type { Database } from "./database.types";
import type { TypedClient } from "./server";

/**
 * Elevated key. Prefer the new `sb_secret_…` key (SUPABASE_SECRET_KEY); the
 * legacy service_role JWT is accepted while migrating. Both BYPASS RLS.
 *
 * Rules:
 *  - never give it a NEXT_PUBLIC_ prefix (next.config.ts fails the build if you do);
 *  - only import this module from server code (the "server-only" import
 *    turns a client-side import into a build error);
 *  - authorise the caller (requireManager) BEFORE using it.
 */
function secretKey(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || undefined;
}

export function isServiceRoleConfigured(): boolean {
  return Boolean(SUPABASE_URL && secretKey());
}

/** Service client for the few server-only tasks that need it (inviting/managing staff). */
export function getServiceClient(): TypedClient | null {
  const key = secretKey();
  if (!SUPABASE_URL || !key) return null;
  return createClient<Database>(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
