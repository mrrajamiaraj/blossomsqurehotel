import { getPublicClient } from "@/lib/supabase";

/**
 * Uptime check for an external monitor (e.g. UptimeRobot, Better Stack):
 * 200 when the site can read from the database, 503 when it can't.
 * Reveals nothing beyond up/down and how long the database took.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const t = Date.now();
  const db = getPublicClient();
  if (!db) return Response.json({ ok: false, db: "not configured" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const { error } = await db.from("room_types").select("id", { head: true, count: "exact" }).limit(1);
  const ms = Date.now() - t;
  if (error) return Response.json({ ok: false, db: "unreachable", ms }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return Response.json({ ok: true, db: "ok", ms }, { headers: { "Cache-Control": "no-store" } });
}
