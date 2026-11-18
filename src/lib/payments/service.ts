import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { errorCode, RepoError } from "../data/errors";
import { getPublicClient, getServiceClient } from "../supabase";
import { isGatewayId, type GatewayId } from "./methods";
import { getGateway } from "./gateways";
import { GatewayError, type Inbound, type PaymentGateway } from "./gateways/types";

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{8,80}$/;

export type GatewayEvent = {
  provider: GatewayId;
  eventId: string;
  intentId: string | null;
  providerRef: string | null;
  status: "succeeded" | "failed" | "cancelled" | null;
  amount: number | null;
  payloadSha256: string;
  signatureOk: boolean;
  verified: boolean;
};

/** Stores a gateway event once and applies it if verified (record_gateway_event). */
export type Recorder = (e: GatewayEvent) => Promise<string>;

export type InboundOutcome =
  /** Recorded; the database's answer (applied, duplicate, replay, mismatch, bad_signature, unverified, ignored, rejected). */
  | { kind: "recorded"; outcome: string; intentId: string | null }
  /** The gateway says it isn't finished yet: nothing recorded, so a later notification can complete it. */
  | { kind: "pending"; intentId: string | null }
  /** We couldn't ask the gateway: nothing recorded, so the gateway's retry is processed normally. */
  | { kind: "retry"; message: string };

/**
 * The one path from a gateway notification to the ledger:
 *  1. a bad signature is recorded and goes no further;
 *  2. otherwise we ask the gateway itself (server-to-server) what happened;
 *  3. only that answer — status, amount, and our intent id as the gateway
 *     echoes it — is recorded and applied, once per event id.
 * Browser returns come through here too; they carry nothing we trust.
 */
export async function processInbound(gateway: PaymentGateway, inbound: Inbound, rawPayload: string, record: Recorder): Promise<InboundOutcome> {
  const base = { provider: gateway.id, eventId: inbound.eventId, payloadSha256: sha256(rawPayload) };
  if (!inbound.signatureOk) {
    const outcome = await record({ ...base, intentId: inbound.intentId, providerRef: null, status: null, amount: null, signatureOk: false, verified: false });
    return { kind: "recorded", outcome, intentId: inbound.intentId };
  }
  let v;
  try {
    v = await gateway.verify(inbound);
  } catch (err) {
    const retryable = !(err instanceof GatewayError) || err.retryable;
    if (retryable) return { kind: "retry", message: (err as Error).message };
    const outcome = await record({ ...base, intentId: inbound.intentId, providerRef: null, status: null, amount: null, signatureOk: true, verified: false });
    return { kind: "recorded", outcome, intentId: inbound.intentId };
  }
  if (v.status === "pending") return { kind: "pending", intentId: v.intentId ?? inbound.intentId };
  // The notification must be about the payment the gateway confirmed.
  const sameIntent = !inbound.intentId || !v.intentId || inbound.intentId === v.intentId;
  const intentId = v.intentId ?? inbound.intentId;
  const outcome = await record({
    ...base,
    intentId,
    providerRef: v.providerRef,
    status: v.status,
    amount: v.amount,
    signatureOk: true,
    verified: Boolean(v.intentId) && sameIntent,
  });
  return { kind: "recorded", outcome, intentId };
}

/** The real recorder: the server-only database function (secret key). */
export const recordGatewayEvent: Recorder = async (e) => {
  const db = getServiceClient();
  if (!db) throw new Error("SUPABASE_SECRET_KEY is required to record payments");
  const { data, error } = await db.rpc("record_gateway_event", {
    p_provider: e.provider,
    p_event_id: e.eventId,
    p_intent: e.intentId as string,
    p_provider_ref: e.providerRef as string,
    p_status: e.status as string,
    p_amount: e.amount as number,
    p_payload_sha256: e.payloadSha256,
    p_signature_ok: e.signatureOk,
    p_verified: e.verified,
  });
  if (error) throw new Error(error.message);
  return String(data);
};

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

/**
 * A guest starts an online payment from their booking page (token = their
 * private booking token). The amount is checked against what's still payable,
 * the intent is created with the server key, and the guest is sent to the
 * gateway. Returns the gateway URL.
 */
export async function startGatewayPayment(token: string, provider: string, amount: number, idempotencyKey: string): Promise<{ redirectUrl: string; intentId: string }> {
  if (!isGatewayId(provider)) throw new RepoError("BAD_PAYMENT_OPTION");
  const gateway = getGateway(provider);
  if (!gateway?.configured()) throw new RepoError("METHOD_UNAVAILABLE");
  if (!Number.isInteger(amount) || amount < 1) throw new RepoError("BAD_AMOUNT");
  if (!IDEMPOTENCY_RE.test(idempotencyKey)) throw new RepoError("BAD_IDEMPOTENCY_KEY");
  const pub = getPublicClient();
  const service = getServiceClient();
  if (!pub || !service) throw new RepoError("OFFLINE");

  const opts = await pub.rpc("guest_payment_options", { p_token: token });
  if (opts.error) throw new RepoError(errorCode(new Error(opts.error.message)));
  const o = opts.data as { reference: string; payable: number; methods: string[]; open: boolean; guest_name?: string };
  if (!o.open) throw new RepoError("LOCKED");
  if (!o.methods.includes(provider)) throw new RepoError("METHOD_DISABLED");
  if (amount > o.payable) throw new RepoError("BAD_AMOUNT");

  const intent = await service.rpc("create_payment_intent", { p_reference: o.reference, p_amount: amount, p_provider: provider, p_idempotency_key: idempotencyKey });
  if (intent.error) throw new RepoError(errorCode(new Error(intent.error.message)));
  const i = intent.data as { intent_id: string; status: string };
  if (i.status !== "created") throw new RepoError("BAD_TRANSITION");

  const site = siteUrl();
  try {
    const c = await gateway.start({
      intentId: i.intent_id,
      amount,
      bookingReference: o.reference,
      guestName: "Guest",
      returnUrl: `${site}/api/payments/${provider}/return?intent=${i.intent_id}`,
      notifyUrl: `${site}/api/payments/${provider}/webhook`,
    });
    return { redirectUrl: c.redirectUrl, intentId: i.intent_id };
  } catch (err) {
    console.error(`Gateway ${provider} start failed:`, (err as Error).message);
    throw new RepoError("GATEWAY_UNAVAILABLE");
  }
}

export const newIdempotencyKey = () => randomUUID();
