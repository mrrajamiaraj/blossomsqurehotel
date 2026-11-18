import "server-only";
import { env, GatewayError, hasAll, UUID_RE, wholeTaka, type Checkout, type CheckoutRequest, type Inbound, type PaymentGateway, type Verified } from "./types";

/**
 * bKash Tokenized Checkout (merchant API).
 *
 *   start   grant token → create payment → redirect to bkashURL
 *   return  bKash sends the browser back with ?paymentID&status. That is NOT
 *           proof of payment: we call execute (server-to-server), and if it
 *           was already executed, query the status. Only bKash's own answer
 *           (transactionStatus "Completed", the amount, and our intent id in
 *           merchantInvoiceNumber) reaches the ledger.
 *
 * Needs merchant credentials from bKash and must be tested against the bKash
 * sandbox (BKASH_BASE_URL=https://tokenized.sandbox.bka.sh/v1.2.0-beta) before
 * the hotel switches "bKash online checkout" on in Settings.
 */
const REQUIRES = ["BKASH_BASE_URL", "BKASH_APP_KEY", "BKASH_APP_SECRET", "BKASH_USERNAME", "BKASH_PASSWORD"] as const;

type Token = { value: string; expires: number };
let cached: Token | null = null;

async function call<T>(path: string, body: unknown, headers: Record<string, string>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${env("BKASH_BASE_URL")!.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch (err) {
    throw new GatewayError(`bKash unreachable: ${(err as Error).message}`, true);
  }
  if (res.status >= 500 || res.status === 429) throw new GatewayError(`bKash ${res.status}`, true);
  const json = (await res.json().catch(() => null)) as T | null;
  if (!json) throw new GatewayError(`bKash returned ${res.status} without JSON`, res.status >= 500);
  return json;
}

async function token(): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.value;
  const r = await call<{ id_token?: string; expires_in?: number; statusMessage?: string }>(
    "/tokenized/checkout/token/grant",
    { app_key: env("BKASH_APP_KEY"), app_secret: env("BKASH_APP_SECRET") },
    { username: env("BKASH_USERNAME")!, password: env("BKASH_PASSWORD")! },
  );
  if (!r.id_token) throw new GatewayError(`bKash token refused: ${r.statusMessage ?? "unknown"}`);
  cached = { value: r.id_token, expires: Date.now() + (r.expires_in ?? 3600) * 1000 };
  return cached.value;
}

const auth = async () => ({ Authorization: await token(), "X-APP-Key": env("BKASH_APP_KEY")! });

type PaymentState = { paymentID?: string; trxID?: string; transactionStatus?: string; amount?: string; merchantInvoiceNumber?: string; statusCode?: string; statusMessage?: string };

function toVerified(r: PaymentState): Verified {
  const s = r.transactionStatus;
  return {
    status: s === "Completed" ? "succeeded" : s === "Initiated" || s === "Pending Authorized" ? "pending" : s ? "failed" : "pending",
    amount: wholeTaka(r.amount),
    providerRef: r.trxID ?? null,
    intentId: r.merchantInvoiceNumber && UUID_RE.test(r.merchantInvoiceNumber) ? r.merchantInvoiceNumber : null,
  };
}

export const bkash: PaymentGateway = {
  id: "bkash",
  name: "bKash",
  requires: REQUIRES,
  configured: () => hasAll(REQUIRES),

  async start(req: CheckoutRequest): Promise<Checkout> {
    const r = await call<{ paymentID?: string; bkashURL?: string; statusCode?: string; statusMessage?: string }>(
      "/tokenized/checkout/create",
      {
        mode: "0011",
        payerReference: req.bookingReference,
        callbackURL: req.returnUrl,
        amount: String(req.amount),
        currency: "BDT",
        intent: "sale",
        merchantInvoiceNumber: req.intentId,
      },
      await auth(),
    );
    if (!r.paymentID || !r.bkashURL) throw new GatewayError(`bKash couldn't start the payment: ${r.statusMessage ?? r.statusCode ?? "unknown"}`);
    return { redirectUrl: r.bkashURL, lookup: r.paymentID };
  },

  fromReturn(params: URLSearchParams): Inbound | null {
    const paymentID = params.get("paymentID");
    if (!paymentID || !/^[A-Za-z0-9_-]{6,80}$/.test(paymentID)) return null;
    // Unsigned: the event id only stops the same return being processed twice.
    return { eventId: `return:${paymentID}`, intentId: null, lookup: paymentID, signatureOk: true };
  },

  async fromWebhook(): Promise<Inbound | null> {
    return null; // Tokenized checkout confirms through execute/query, not webhooks.
  },

  async verify(inbound: Inbound): Promise<Verified> {
    if (!inbound.lookup) throw new GatewayError("No bKash paymentID");
    const headers = await auth();
    // Execute finalises an authorised payment; if it already ran, query instead.
    const exec = await call<PaymentState>("/tokenized/checkout/execute", { paymentID: inbound.lookup }, headers);
    if (exec.transactionStatus) return toVerified(exec);
    const q = await call<PaymentState>("/tokenized/checkout/payment/status", { paymentID: inbound.lookup }, headers);
    return toVerified(q);
  },
};
