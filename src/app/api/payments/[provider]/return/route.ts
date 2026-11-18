import { kickOutbox } from "@/lib/messaging/worker";
import { getGateway } from "@/lib/payments/gateways";
import { UUID_RE } from "@/lib/payments/gateways/types";
import { processInbound, recordGatewayEvent } from "@/lib/payments/service";

/**
 * Where the gateway sends the guest's browser back. Nothing in this request
 * is trusted: it only tells us which payment to look up, and we ask the
 * gateway (server-to-server) what happened. The guest then sees the status
 * stored in the database on /booking/payment.
 */
async function handle(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const url = new URL(req.url);
  const params = new URLSearchParams(url.searchParams);
  if (req.method === "POST") {
    const form = new URLSearchParams(await req.text());
    for (const [k, v] of form) if (!params.has(k)) params.set(k, v);
  }
  const intent = params.get("intent");
  const gateway = getGateway(provider);
  if (gateway?.configured()) {
    const inbound = gateway.fromReturn(params);
    if (inbound) {
      try {
        await processInbound(gateway, { ...inbound, intentId: inbound.intentId ?? (intent && UUID_RE.test(intent) ? intent : null) }, params.toString(), recordGatewayEvent);
        kickOutbox();
      } catch (err) {
        console.error(`Payment return ${provider}:`, (err as Error).message);
      }
    }
  }
  const next = new URL("/booking/payment", url.origin);
  if (intent && UUID_RE.test(intent)) next.searchParams.set("intent", intent);
  return Response.redirect(next, 303);
}

export const GET = handle;
export const POST = handle;
