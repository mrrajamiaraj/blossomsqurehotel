import { resendStatus, verifySvix } from "@/lib/messaging/webhooks";
import { getServiceClient } from "@/lib/supabase";

/**
 * Resend delivery events (delivered, bounced, complained, opened). The
 * signature (Svix, RESEND_WEBHOOK_SECRET) is checked before anything is read;
 * each event id is applied once.
 */
export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) return Response.json({ error: "not configured" }, { status: 503 });
  const body = await req.text();
  const h = { id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature") };
  if (!verifySvix(secret, h, body)) return Response.json({ error: "bad signature" }, { status: 401 });

  let evt: { type?: string; data?: { email_id?: string; bounce?: { message?: string }; reason?: string } };
  try {
    evt = JSON.parse(body);
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const status = resendStatus(evt.type ?? "");
  if (!status || !evt.data?.email_id) return Response.json({ ok: true, ignored: evt.type ?? null });

  const db = getServiceClient();
  if (!db) return Response.json({ error: "not configured" }, { status: 503 });
  const { data, error } = await db.rpc("message_delivery_update", {
    p_provider: "resend",
    p_event_id: h.id!,
    p_provider_message_id: evt.data.email_id,
    p_status: status,
    p_detail: { type: evt.type, reason: evt.data.bounce?.message ?? evt.data.reason ?? null },
  });
  if (error) {
    console.error("Email webhook:", error.message);
    return Response.json({ error: "try again" }, { status: 500 });
  }
  return Response.json({ ok: true, result: data });
}
