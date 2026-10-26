import "server-only";
import { getPublicClient, isSupabaseConfigured } from "../supabase";
import { PreviewRepo } from "./preview-repo";
import type { PublicRepo } from "./repo";
import { SupabaseRepo } from "./supabase-repo";

/** The in-memory preview runs only in development, and only without Supabase. */
export function previewEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && !isSupabaseConfigured();
}

/** Repository for public pages, or null in production without Supabase. */
export function getPublicRepo(): PublicRepo | null {
  const client = getPublicClient();
  if (client) return new SupabaseRepo(client);
  if (previewEnabled()) return new PreviewRepo();
  return null;
}
