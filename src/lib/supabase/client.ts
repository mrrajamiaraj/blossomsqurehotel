"use client";

import { createBrowserClient } from "@supabase/ssr";
import { isSupabaseConfigured, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";
import type { Database } from "./database.types";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

/**
 * Browser client (publishable key only). Intended for Realtime subscriptions
 * and other genuinely client-side features. Data mutations should keep going
 * through Server Actions, which validate input and re-check the staff role.
 * Returns null when Supabase is not configured (preview mode).
 */
export function getBrowserClient() {
  if (!isSupabaseConfigured()) return null;
  browserClient ??= createBrowserClient<Database>(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!);
  return browserClient;
}
