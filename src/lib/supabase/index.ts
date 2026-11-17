import "server-only";

// Server-side entry point, kept so existing `@/lib/supabase` imports work.
// Browser code must import from "@/lib/supabase/client" instead.
export { isSupabaseConfigured, ROOM_PHOTO_BUCKET } from "./config";
export { getPublicClient, getSessionClient, type TypedClient } from "./server";
export { getServiceClient, isServiceRoleConfigured } from "./admin";
export type { Database, Json, Tables, TablesInsert, TablesUpdate } from "./database.types";
