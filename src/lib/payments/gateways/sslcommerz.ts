import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { env, GatewayError, hasAll, UUID_RE, wholeTaka, type Checkout, type CheckoutRequest, type Inbound, type PaymentGateway, type Verified } from "./types";

/**
 * Card payments through SSLCommerz (Bangladesh's card gateway).
 *
 *   start   session API → redirect to GatewayPageURL
 *   IPN     server-to-server POST. Its verify_sign is checked (md5 over the
 *           fields named in verify_key plus md5(store password)), and then the
 *           payment is confirmed with SSLCommerz's validation API by val_id.
 *   return  the browser POSTs back to success/fail/cancel URLs; treated only
 *           as a hint to validate by val_id, exactly like the IPN.
 *
 * Needs a store id and password from SSLCommerz. Test with
 * SSLCOMMERZ_SANDBOX=true (sandbox.sslcommerz.com) before switching "Card" on.
 */
const REQUIRES = ["SSLCOMMERZ_STORE_ID", "SSLCOMMERZ_STORE_PASSWORD"] as const;

const base = () => (env("SSLCOMMERZ_SANDBOX") === "true" ? "https://sandbox.sslcommerz.com" : "https://securepay.sslcommerz.com");
const md5 = (s: string) => createHash("md5").update(s, "utf8").digest("hex");

/** SSLCommerz's IPN signature: md5 over the listed fields (plus the hashed store password), sorted by name. */
export function sslcommerzSignatureOk(fields: Record<string, string>, storePassword: string): boolean {
  const sign = fields.verify_sign;
  const keys = (fields.verify_key ?? "").split(",").map((k) => k.trim()).filter(Boolean);
  if (!sign || !keys.length) return false;
  const data: Record<string, string> = {};
  for (const k of keys) data[k] = fields[k] ?? "";
  data.store_passwd = md5(storePassword);
  const joined = Object.keys(data)
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join("&");
  const expected = Buffer.from(md5(joined));
  const given = Buffer.from(String(sign).toLowerCase());
  return expected.length === given.length && timingSafeEqual(expected, given);
}

function form(body: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(body));
}

export const sslcommerz: PaymentGateway = {
  id: "card",
  name: "SSLCommerz (cards)",
  requires: REQUIRES,
  configured: () => hasAll(REQUIRES),

  async start(req: CheckoutRequest): Promise<Checkout> {
    const p = new URLSearchParams({
      store_id: env("SSLCOMMERZ_STORE_ID")!,
      store_passwd: env("SSLCOMMERZ_STORE_PASSWORD")!,
      total_amount: String(req.amount),
      currency: "BDT",
      tran_id: req.intentId,
      success_url: `${req.returnUrl}&result=success`,
      fail_url: `${req.returnUrl}&result=fail`,
      cancel_url: `${req.returnUrl}&result=cancel`,
      ipn_url: req.notifyUrl,
      product_name: `Hotel stay ${req.bookingReference}`,
      product_category: "Hotel",
      product_profile: "non-physical-goods",
      shipping_method: "NO",
      cus_name: req.guestName.slice(0, 50) || "Guest",
      cus_email: "guest@blossomsquare.online",
      cus_add1: "Cox's Bazar",
      cus_city: "Cox's Bazar",
      cus_country: "Bangladesh",
      cus_phone: "N/A",
      value_a: req.bookingReference,
    });
    let res: Response;
    try {
      res = await fetch(`${base()}/gwprocess/v4/api.php`, { method: "POST", body: p, signal: AbortSignal.timeout(20_000), cache: "no-store" });
    } catch (err) {
      throw new GatewayError(`SSLCommerz unreachable: ${(err as Error).message}`, true);
    }
    const r = (await res.json().catch(() => null)) as { status?: string; GatewayPageURL?: string; sessionkey?: string; failedreason?: string } | null;
    if (!r || r.status !== "SUCCESS" || !r.GatewayPageURL) throw new GatewayError(`SSLCommerz couldn't start the payment: ${r?.failedreason ?? res.status}`);
    return { redirectUrl: r.GatewayPageURL, lookup: r.sessionkey ?? null };
  },

  fromReturn(params: URLSearchParams): Inbound | null {
    const valId = params.get("val_id");
    const tran = params.get("tran_id");
    if (!valId && !tran) return null;
    return { eventId: `return:${valId ?? tran}:${params.get("result") ?? ""}`, intentId: tran && UUID_RE.test(tran) ? tran : null, lookup: valId, signatureOk: true };
  },

  async fromWebhook({ body }): Promise<Inbound | null> {
    const f = form(body);
    if (!f.tran_id) return null;
    const signatureOk = sslcommerzSignatureOk(f, env("SSLCOMMERZ_STORE_PASSWORD") ?? "");
    return {
      eventId: `ipn:${f.val_id || f.tran_id}:${f.status ?? ""}`,
      intentId: UUID_RE.test(f.tran_id) ? f.tran_id : null,
      lookup: f.val_id || null,
      signatureOk,
    };
  },

  async verify(inbound: Inbound): Promise<Verified> {
    const store = { store_id: env("SSLCOMMERZ_STORE_ID")!, store_passwd: env("SSLCOMMERZ_STORE_PASSWORD")!, format: "json" };
    let url: string;
    if (inbound.lookup) url = `${base()}/validator/api/validationserverAPI.php?${new URLSearchParams({ val_id: inbound.lookup, ...store })}`;
    else if (inbound.intentId) url = `${base()}/validator/api/merchantTransIDvalidationAPI.php?${new URLSearchParams({ tran_id: inbound.intentId, ...store })}`;
    else throw new GatewayError("Nothing to validate");
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
    } catch (err) {
      throw new GatewayError(`SSLCommerz unreachable: ${(err as Error).message}`, true);
    }
    if (res.status >= 500) throw new GatewayError(`SSLCommerz ${res.status}`, true);
    type V = { status?: string; tran_id?: string; amount?: string; currency_type?: string; currency_amount?: string; bank_tran_id?: string; val_id?: string };
    const raw = (await res.json().catch(() => null)) as (V & { element?: V[] }) | null;
    const v: V | undefined = raw?.element ? raw.element.find((e) => e.status === "VALID" || e.status === "VALIDATED") ?? raw.element[0] : raw ?? undefined;
    if (!v) throw new GatewayError("SSLCommerz validation returned nothing", true);
    const ok = v.status === "VALID" || v.status === "VALIDATED";
    // Only taka payments: a foreign-currency card is settled in BDT (currency_amount).
    const amount = wholeTaka(v.currency_type && v.currency_type !== "BDT" ? v.currency_amount : v.amount);
    return {
      status: ok ? "succeeded" : v.status === "PENDING" ? "pending" : v.status === "CANCELLED" ? "cancelled" : "failed",
      amount,
      providerRef: v.bank_tran_id || v.val_id || null,
      intentId: v.tran_id && UUID_RE.test(v.tran_id) ? v.tran_id : null,
    };
  },
};
