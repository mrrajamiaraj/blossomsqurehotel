import type { GatewayId } from "../methods";

export type VerifiedStatus = "succeeded" | "failed" | "cancelled" | "pending";

/** What the gateway's own API said about a payment (server-to-server). */
export type Verified = {
  status: VerifiedStatus;
  /** Whole taka, as confirmed by the gateway. */
  amount: number | null;
  /** The gateway's transaction id (stored on the payment). */
  providerRef: string | null;
  /** Our intent id as the gateway echoes it back (merchant invoice / tran_id). */
  intentId: string | null;
};

/**
 * A notification that reached us (webhook or browser return), before we
 * trust anything in it. Only `eventId`, `intentId` and `lookup` are used, and
 * only to ask the gateway itself what happened.
 */
export type Inbound = {
  eventId: string;
  intentId: string | null;
  /** Whatever the gateway needs to look the payment up (paymentID, val_id…). */
  lookup: string | null;
  /** The notification's signature checked out (browser returns are unsigned: false). */
  signatureOk: boolean;
};

export type CheckoutRequest = {
  intentId: string;
  amount: number;
  bookingReference: string;
  guestName: string;
  /** Where the gateway sends the guest's browser back to (never trusted). */
  returnUrl: string;
  /** Server-to-server notification URL. */
  notifyUrl: string;
};

export type Checkout = { redirectUrl: string; lookup: string | null };

export class GatewayError extends Error {
  constructor(message: string, readonly retryable = false) {
    super(message);
    this.name = "GatewayError";
  }
}

export interface PaymentGateway {
  readonly id: GatewayId;
  readonly name: string;
  /** Environment variables this adapter needs (names only; values are never exposed). */
  readonly requires: readonly string[];
  configured(): boolean;
  start(req: CheckoutRequest): Promise<Checkout>;
  /** The guest's browser came back. Unsigned: only tells us which payment to check. */
  fromReturn(params: URLSearchParams): Inbound | null;
  /** A server-to-server notification. Null when this gateway has no webhook. */
  fromWebhook(input: { headers: Headers; body: string }): Promise<Inbound | null>;
  /** Ask the gateway (server-to-server) what really happened. */
  verify(inbound: Inbound): Promise<Verified>;
}

export const env = (name: string): string | undefined => {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
};

export const hasAll = (names: readonly string[]) => names.every((n) => Boolean(env(n)));

/** "1,200.00" / "1200" / 1200 → 1200 (whole taka), or null when it isn't a whole amount. */
export function wholeTaka(v: unknown): number | null {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? r : null;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
