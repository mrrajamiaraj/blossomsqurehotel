// Gateway adapters and the one path from a notification to the ledger:
// signatures, server-side verification, retries and identity checks. Network
// calls are replaced with fakes; nothing here talks to a real gateway.
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bkash } from "@/lib/payments/gateways/bkash";
import { sslcommerz, sslcommerzSignatureOk } from "@/lib/payments/gateways/sslcommerz";
import { nagad } from "@/lib/payments/gateways/nagad";
import { GatewayError, wholeTaka, type Inbound, type PaymentGateway, type Verified } from "@/lib/payments/gateways/types";
import { availableMethods, normaliseTxnId, TXN_ID_RE } from "@/lib/payments/methods";
import { processInbound, type GatewayEvent } from "@/lib/payments/service";

const md5 = (s: string) => createHash("md5").update(s).digest("hex");
const INTENT = "3f2b6c1e-8a4d-4c8e-9f1a-2b3c4d5e6f70";
const OTHER = "0a0b0c0d-1111-4222-8333-444455556666";

function fakeGateway(verify: (i: Inbound) => Promise<Verified>): PaymentGateway {
  return {
    id: "card",
    name: "Fake",
    requires: [],
    configured: () => true,
    start: async () => ({ redirectUrl: "https://pay.example/x", lookup: null }),
    fromReturn: () => null,
    fromWebhook: async () => null,
    verify,
  };
}

function recorder() {
  const calls: GatewayEvent[] = [];
  return { calls, record: async (e: GatewayEvent) => (calls.push(e), e.verified ? "applied" : e.signatureOk ? "unverified" : "bad_signature") };
}

const inbound = (o: Partial<Inbound> = {}): Inbound => ({ eventId: "ev-1", intentId: INTENT, lookup: "VAL1", signatureOk: true, ...o });

describe("processInbound: only the gateway's own answer reaches the ledger", () => {
  it("a bad signature is recorded and never verified or applied", async () => {
    const verify = vi.fn();
    const r = recorder();
    const out = await processInbound(fakeGateway(verify), inbound({ signatureOk: false }), "payload", r.record);
    expect(verify).not.toHaveBeenCalled();
    expect(out).toEqual({ kind: "recorded", outcome: "bad_signature", intentId: INTENT });
    expect(r.calls[0]).toMatchObject({ signatureOk: false, verified: false, status: null, amount: null });
    expect(r.calls[0].payloadSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("uses the amount and status the gateway confirms, not the notification's", async () => {
    const r = recorder();
    const g = fakeGateway(async () => ({ status: "succeeded", amount: 1200, providerRef: "BANK-TX-9", intentId: INTENT }));
    const out = await processInbound(g, inbound(), "amount=999999&status=VALID", r.record);
    expect(out).toMatchObject({ kind: "recorded", outcome: "applied" });
    expect(r.calls[0]).toMatchObject({ status: "succeeded", amount: 1200, providerRef: "BANK-TX-9", verified: true, intentId: INTENT });
  });

  it("can't reach the gateway → nothing recorded, so the gateway's retry still counts", async () => {
    const r = recorder();
    const g = fakeGateway(async () => {
      throw new GatewayError("timeout", true);
    });
    const out = await processInbound(g, inbound(), "x", r.record);
    expect(out.kind).toBe("retry");
    expect(r.calls).toHaveLength(0);
  });

  it("a permanent verification error is recorded as unverified (not applied)", async () => {
    const r = recorder();
    const g = fakeGateway(async () => {
      throw new GatewayError("unknown payment", false);
    });
    expect(await processInbound(g, inbound(), "x", r.record)).toMatchObject({ kind: "recorded", outcome: "unverified" });
    expect(r.calls[0].verified).toBe(false);
  });

  it("still pending at the gateway → nothing recorded", async () => {
    const r = recorder();
    const g = fakeGateway(async () => ({ status: "pending", amount: null, providerRef: null, intentId: INTENT }));
    expect(await processInbound(g, inbound(), "x", r.record)).toEqual({ kind: "pending", intentId: INTENT });
    expect(r.calls).toHaveLength(0);
  });

  it("a notification about one payment can't confirm another (intent mismatch)", async () => {
    const r = recorder();
    const g = fakeGateway(async () => ({ status: "succeeded", amount: 500, providerRef: "T", intentId: OTHER }));
    await processInbound(g, inbound({ intentId: INTENT }), "x", r.record);
    expect(r.calls[0]).toMatchObject({ verified: false, intentId: OTHER });
  });

  it("without our intent id echoed by the gateway, nothing is applied", async () => {
    const r = recorder();
    const g = fakeGateway(async () => ({ status: "succeeded", amount: 500, providerRef: "T", intentId: null }));
    await processInbound(g, inbound({ intentId: null }), "x", r.record);
    expect(r.calls[0].verified).toBe(false);
  });
});

describe("SSLCommerz", () => {
  const PASS = "store-secret";
  const sign = (f: Record<string, string>) => {
    const keys = f.verify_key.split(",");
    const data: Record<string, string> = Object.fromEntries(keys.map((k) => [k, f[k]]));
    data.store_passwd = md5(PASS);
    return md5(Object.keys(data).sort().map((k) => `${k}=${data[k]}`).join("&"));
  };
  const fields = () => {
    const f: Record<string, string> = { tran_id: INTENT, val_id: "VAL123", amount: "1200.00", status: "VALID", verify_key: "amount,status,tran_id,val_id" };
    f.verify_sign = sign(f);
    return f;
  };

  beforeEach(() => {
    vi.stubEnv("SSLCOMMERZ_STORE_ID", "store1");
    vi.stubEnv("SSLCOMMERZ_STORE_PASSWORD", PASS);
    vi.stubEnv("SSLCOMMERZ_SANDBOX", "true");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("accepts a correctly signed IPN and rejects any change to it", () => {
    const f = fields();
    expect(sslcommerzSignatureOk(f, PASS)).toBe(true);
    expect(sslcommerzSignatureOk({ ...f, amount: "1.00" }, PASS)).toBe(false);
    expect(sslcommerzSignatureOk(f, "wrong-password")).toBe(false);
    expect(sslcommerzSignatureOk({ ...f, verify_sign: "" }, PASS)).toBe(false);
  });

  it("an IPN becomes an inbound event with its signature result", async () => {
    const ok = await sslcommerz.fromWebhook({ headers: new Headers(), body: new URLSearchParams(fields()).toString() });
    expect(ok).toMatchObject({ intentId: INTENT, lookup: "VAL123", signatureOk: true });
    const forged = await sslcommerz.fromWebhook({ headers: new Headers(), body: new URLSearchParams({ ...fields(), amount: "5" }).toString() });
    expect(forged?.signatureOk).toBe(false);
  });

  it("verifies with the validation API; INVALID is a failure, network errors retry", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ status: "VALID", tran_id: INTENT, amount: "1200.00", currency_type: "BDT", bank_tran_id: "B-77" })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sslcommerz.verify(inbound())).toEqual({ status: "succeeded", amount: 1200, providerRef: "B-77", intentId: INTENT });
    expect(String(fetchMock.mock.calls[0][0])).toContain("sandbox.sslcommerz.com/validator/api/validationserverAPI.php");
    expect(String(fetchMock.mock.calls[0][0])).toContain("val_id=VAL1");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ status: "INVALID_TRANSACTION", tran_id: INTENT }))));
    expect((await sslcommerz.verify(inbound())).status).toBe("failed");

    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("ECONNRESET")));
    const err = await sslcommerz.verify(inbound()).catch((e) => e);
    expect(err).toBeInstanceOf(GatewayError);
    expect(err.retryable).toBe(true);
  });
});

describe("bKash tokenized checkout", () => {
  beforeEach(() => {
    for (const [k, v] of Object.entries({ BKASH_BASE_URL: "https://tokenized.sandbox.bka.sh/v1.2.0-beta", BKASH_APP_KEY: "k", BKASH_APP_SECRET: "s", BKASH_USERNAME: "u", BKASH_PASSWORD: "p" }))
      vi.stubEnv(k, v);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("the browser return only names a payment to check", () => {
    expect(bkash.fromReturn(new URLSearchParams("paymentID=TR0011abc123&status=success"))).toEqual({ eventId: "return:TR0011abc123", intentId: null, lookup: "TR0011abc123", signatureOk: true });
    expect(bkash.fromReturn(new URLSearchParams("status=success"))).toBeNull();
    expect(bkash.fromReturn(new URLSearchParams("paymentID=<script>"))).toBeNull();
  });

  it("executes server-side and trusts bKash's answer; falls back to a status query", async () => {
    const json = (b: unknown) => new Response(JSON.stringify(b));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ id_token: "tok", expires_in: 3600 }))
      .mockResolvedValueOnce(json({ transactionStatus: "Completed", trxID: "BKX1", amount: "1500", merchantInvoiceNumber: INTENT }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await bkash.verify(inbound({ lookup: "TR1" }))).toEqual({ status: "succeeded", amount: 1500, providerRef: "BKX1", intentId: INTENT });
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/tokenized\/checkout\/execute$/);

    // Already executed: execute returns an error code, the query gives the state.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(json({ statusCode: "2117", statusMessage: "Already completed" })).mockResolvedValueOnce(json({ transactionStatus: "Failed", merchantInvoiceNumber: INTENT })),
    );
    expect((await bkash.verify(inbound({ lookup: "TR1" }))).status).toBe("failed");
  });
});

describe("Nagad and availability", () => {
  it("Nagad online is never configured until implemented with merchant keys", async () => {
    vi.stubEnv("NAGAD_MERCHANT_ID", "x");
    expect(nagad.configured()).toBe(false);
    await expect(nagad.start({ intentId: INTENT, amount: 1, bookingReference: "BSQ-1", guestName: "", returnUrl: "", notifyUrl: "" })).rejects.toThrow(/isn't set up/);
    vi.unstubAllEnvs();
  });

  it("offered gateways without credentials are listed as not available yet", () => {
    const m = availableMethods(["pay_at_hotel", "bank_transfer", "card", "bkash"], ["bkash"]);
    expect(m).toEqual([
      { id: "pay_at_hotel", offered: true, configured: true },
      { id: "bank_transfer", offered: true, configured: true },
      { id: "bkash", offered: true, configured: true },
      { id: "card", offered: true, configured: false },
    ]);
  });

  it("transaction IDs are normalised and checked the same way as in the database", () => {
    expect(normaliseTxnId(" 9ab 12cd34 ")).toBe("9AB12CD34");
    expect(TXN_ID_RE.test("9AB12CD34")).toBe(true);
    expect(TXN_ID_RE.test("AB<1>")).toBe(false);
    expect(wholeTaka("1,200.00")).toBe(1200);
    expect(wholeTaka("12.50")).toBeNull();
    expect(wholeTaka("-5")).toBeNull();
  });
});
