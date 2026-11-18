import { timingSafeEqual } from "node:crypto";
import { processOutbox } from "@/lib/messaging/worker";
import { getServiceClient } from "@/lib/supabase";

/**
 * The message queue sweep: sends due messages and retries failures. Called on
 * a schedule (Supabase pg_cron via pg_net, or Vercel Cron) with
 * `Authorization: Bearer $CRON_SECRET`. Anyone without the secret gets 401.
 */
export const maxDuration = 60;

function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const given = req.headers.get("authorization") ?? "";
  if (!secret) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function run(req: Request) {
  if (!process.env.CRON_SECRET?.trim()) return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (!authorised(req)) return Response.json({ error: "unauthorised" }, { status: 401 });
  const totals = { claimed: 0, sent: 0, retry: 0, failed: 0, unconfigured: 0, expiredIntents: 0 };
  try {
    // Up to three batches per call (about 75 messages), within the time limit.
    for (let i = 0; i < 3; i++) {
      const s = await processOutbox(25);
      if (!s) return Response.json({ error: "SUPABASE_SECRET_KEY is not set" }, { status: 503 });
      for (const k of ["claimed", "sent", "retry", "failed", "unconfigured"] as const) totals[k] += s[k];
      if (s.claimed < 25) break;
    }
    const { data } = (await getServiceClient()?.rpc("expire_payment_intents")) ?? { data: 0 };
    totals.expiredIntents = Number(data ?? 0);
  } catch (err) {
    console.error("Message sweep:", (err as Error).message);
    return Response.json({ error: "sweep failed", ...totals }, { status: 500 });
  }
  return Response.json(totals);
}

export const GET = run;
export const POST = run;
