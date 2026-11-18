import { timingSafeEqual } from "node:crypto";
import { verifyMeta, whatsappStatus } from "@/lib/messaging/webhooks";
import { getServiceClient } from "@/lib/supabase";

/**
 * WhatsApp Business Platform webhook.
 *   GET   subscription check (hub.verify_token must equal WHATSAPP_VERIFY_TOKEN)
 *   POST  message status updates, signed with the app secret (X-Hub-Signature-256).
 * Incoming guest messages aren't processed here; staff reply from the
 * WhatsApp Business app as today.
 */
export function GET(req: Request) {
  const url = new URL(req.url);
  const expected = process.env.WHATSAPP_VERIFY_TOKEN?.trim() ?? "";
  const given = url.searchParams.get("hub.verify_token") ?? "";
  const ok =
    expected.length > 0 &&
    url.searchParams.get("hub.mode") === "subscribe" &&
    given.length === expected.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) return new Response("forbidden", { status: 403 });
  return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
}

type Status = { id?: string; status?: string; timestamp?: string; errors?: { code?: number; title?: string; message?: string }[] };

export async function POST(req: Request) {
  const secret = process.env.WHATSAPP_APP_SECRET?.trim();
  if (!secret) return Response.json({ error: "not configured" }, { status: 503 });
  const body = await req.text();
  if (!verifyMeta(secret, req.headers.get("x-hub-signature-256"), body)) return Response.json({ error: "bad signature" }, { status: 401 });

  let payload: { entry?: { changes?: { value?: { statuses?: Status[] } }[] }[] };
  try {
    payload = JSON.parse(body);
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const db = getServiceClient();
  if (!db) return Response.json({ error: "not configured" }, { status: 503 });

  const statuses = (payload.entry ?? []).flatMap((e) => (e.changes ?? []).flatMap((c) => c.value?.statuses ?? []));
  for (const s of statuses) {
    const status = s.status ? whatsappStatus(s.status) : null;
    if (!status || !s.id) continue;
    const { error } = await db.rpc("message_delivery_update", {
      p_provider: "whatsapp",
      p_event_id: `${s.id}:${s.status}:${s.timestamp ?? ""}`,
      p_provider_message_id: s.id,
      p_status: status,
      p_detail: { status: s.status, reason: s.errors?.[0]?.title ?? s.errors?.[0]?.message ?? null, code: s.errors?.[0]?.code ?? null },
    });
    if (error) {
      console.error("WhatsApp webhook:", error.message);
      return Response.json({ error: "try again" }, { status: 500 });
    }
  }
  return Response.json({ ok: true, statuses: statuses.length });
}
