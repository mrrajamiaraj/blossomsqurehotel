import { kickOutbox } from "@/lib/messaging/worker";
import { getGateway } from "@/lib/payments/gateways";
import { processInbound, recordGatewayEvent } from "@/lib/payments/service";

/**
 * Server-to-server payment notifications (e.g. SSLCommerz IPN).
 * Signature checked → payment confirmed with the gateway's own API →
 * recorded once per event → ledger updated only if both passed.
 *   200  recorded (whatever the outcome, so the gateway stops retrying)
 *   401  bad signature (recorded for reconciliation)
 *   503  couldn't confirm with the gateway right now — nothing recorded, retry
 */
export async function POST(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const gateway = getGateway(provider);
  if (!gateway?.configured()) return Response.json({ error: "unknown" }, { status: 404 });
  const body = await req.text();
  const inbound = await gateway.fromWebhook({ headers: req.headers, body });
  if (!inbound) return Response.json({ error: "unrecognised notification" }, { status: 400 });

  try {
    const r = await processInbound(gateway, inbound, body, recordGatewayEvent);
    if (r.kind === "retry") return Response.json({ error: "verification unavailable" }, { status: 503 });
    kickOutbox();
    if (r.kind === "recorded" && r.outcome === "bad_signature") return Response.json({ error: "bad signature" }, { status: 401 });
    return Response.json({ ok: true, ...(r.kind === "recorded" ? { outcome: r.outcome } : { outcome: "pending" }) });
  } catch (err) {
    console.error(`Payment webhook ${provider}:`, (err as Error).message);
    return Response.json({ error: "try again" }, { status: 500 });
  }
}
