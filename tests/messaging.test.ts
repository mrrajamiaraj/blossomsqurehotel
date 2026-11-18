// Guest message templates, provider error handling, webhook signatures and
// the outbox worker's failure handling (with fake providers).
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_HOTEL_INFO } from "@/lib/cms/hotel-info";
import { classify, sendEmail } from "@/lib/messaging/providers";
import { esc, renderEmail, TEMPLATES, WHATSAPP_TEMPLATES, type MessageData } from "@/lib/messaging/templates";
import { resendStatus, verifyMeta, verifySvix, whatsappStatus } from "@/lib/messaging/webhooks";
import { runOutbox, type OutboxRow, type WorkerDeps } from "@/lib/messaging/worker";

const SITE = "https://blossomsquare.online";
const booking: MessageData = {
  reference: "BSQ-12345",
  guest_name: "Asha <b>Rahman</b>",
  first_name: "Asha",
  check_in: "2026-12-20",
  check_out: "2026-12-22",
  nights: 2,
  adults: 2,
  children: 1,
  rooms: ["Deluxe Couple", "Deluxe Couple"],
  total: 7000,
  paid: 2000,
  balance: 5000,
  taxes_pending: true,
  payment_option: "advance",
  advance_due: 3500,
  payment_due_at: "2026-11-19T10:00:00Z",
  stage: "received",
  payment: { amount: 2000, method: "bkash", receipt_no: "RCP-2026-000001", reference: "9AB12CD34", reason: "amount_mismatch" },
  reason: "Plans changed",
  excerpt: "Do you have a <script>alert(1)</script> sea view?",
  from: { check_in: "2026-12-18", check_out: "2026-12-20", total: 6000 },
  to: { check_in: "2026-12-20", check_out: "2026-12-22", total: 7000 },
};

describe("email templates", () => {
  it("every template renders a subject, HTML and plain text with the booking's details", () => {
    for (const t of TEMPLATES) {
      const r = renderEmail(t, booking, DEFAULT_HOTEL_INFO, SITE);
      expect(r.subject, t).toContain("BSQ-12345");
      expect(r.html, t).toMatch(/^<!doctype html>/);
      expect(r.text, t).toContain(DEFAULT_HOTEL_INFO.fullName);
      expect(r.text.length, t).toBeGreaterThan(100);
    }
  });

  it("escapes everything that came from a guest", () => {
    const ack = renderEmail("inquiry_acknowledgment", booking, DEFAULT_HOTEL_INFO, SITE);
    expect(ack.html).not.toContain("<script>");
    expect(ack.html).toContain("&lt;script&gt;");
    expect(esc(`"><img src=x onerror=alert(1)>`)).toBe("&quot;&gt;&lt;img src=x onerror=alert(1)&gt;");
  });

  it("received vs confirmed, advance reminders, balances", () => {
    const received = renderEmail("booking_confirmation", booking, DEFAULT_HOTEL_INFO, SITE);
    expect(received.subject).toBe("We've received your booking — BSQ-12345");
    expect(received.text).toContain("Please send the ৳3,500 advance");
    expect(received.text).toContain("2 × Deluxe Couple");
    const confirmed = renderEmail("booking_confirmation", { ...booking, stage: "confirmed", payment_option: "pay_at_hotel" }, DEFAULT_HOTEL_INFO, SITE);
    expect(confirmed.subject).toBe("Your stay is confirmed — BSQ-12345");
    expect(confirmed.text).not.toContain("advance");

    const paid = renderEmail("payment_confirmation", booking, DEFAULT_HOTEL_INFO, SITE);
    expect(paid.subject).toContain("RCP-2026-000001");
    expect(paid.text).toContain("Balance: ৳5,000");
    const failed = renderEmail("payment_failure", booking, DEFAULT_HOTEL_INFO, SITE);
    expect(failed.text).toContain("didn't match the amount requested");
    const cancel = renderEmail("booking_cancellation", booking, DEFAULT_HOTEL_INFO, SITE);
    expect(cancel.text).toContain("refund");
    const change = renderEmail("booking_modification", booking, DEFAULT_HOTEL_INFO, SITE);
    expect(change.text).toContain("Previously:");
  });

  it("WhatsApp templates send a fixed number of body parameters", () => {
    for (const [t, def] of Object.entries(WHATSAPP_TEMPLATES)) {
      const params = def!.params(booking);
      expect(params.every((p) => typeof p === "string" && p.length > 0), t).toBe(true);
      expect(def!.env).toMatch(/^WHATSAPP_TEMPLATE_[A-Z_]+$/);
    }
    expect(WHATSAPP_TEMPLATES.payment_failure).toBeUndefined();
  });
});

describe("webhook signatures", () => {
  const key = Buffer.from("super-secret-key").toString("base64");
  const secret = `whsec_${key}`;
  const svix = (id: string, ts: string, body: string) => `v1,${createHmac("sha256", Buffer.from(key, "base64")).update(`${id}.${ts}.${body}`).digest("base64")}`;

  it("Svix (Resend): valid, tampered, wrong secret, stale", () => {
    const now = Date.now();
    const ts = String(Math.floor(now / 1000));
    const body = '{"type":"email.delivered"}';
    const sig = svix("msg_1", ts, body);
    expect(verifySvix(secret, { id: "msg_1", timestamp: ts, signature: `v1,bogus ${sig}` }, body, now)).toBe(true);
    expect(verifySvix(secret, { id: "msg_1", timestamp: ts, signature: sig }, body.replace("delivered", "bounced"), now)).toBe(false);
    expect(verifySvix("whsec_" + Buffer.from("other").toString("base64"), { id: "msg_1", timestamp: ts, signature: sig }, body, now)).toBe(false);
    expect(verifySvix(secret, { id: "msg_1", timestamp: ts, signature: sig }, body, now + 10 * 60_000)).toBe(false);
    expect(verifySvix(secret, { id: null, timestamp: ts, signature: sig }, body, now)).toBe(false);
  });

  it("Meta (WhatsApp): sha256 HMAC of the raw body", () => {
    const body = '{"entry":[]}';
    const sig = `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}`;
    expect(verifyMeta("app-secret", sig, body)).toBe(true);
    expect(verifyMeta("app-secret", sig, body + " ")).toBe(false);
    expect(verifyMeta("app-secret", null, body)).toBe(false);
    expect(verifyMeta("", sig, body)).toBe(false);
  });

  it("maps provider events to delivery statuses", () => {
    expect(resendStatus("email.delivered")).toBe("delivered");
    expect(resendStatus("email.bounced")).toBe("bounced");
    expect(resendStatus("email.sent")).toBeNull();
    expect(whatsappStatus("read")).toBe("opened");
    expect(whatsappStatus("failed")).toBe("failed");
    expect(whatsappStatus("sent")).toBeNull();
  });
});

describe("email provider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  const msg = { id: "0b1c2d3e-0000-4000-8000-000000000001", to: "guest@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi" };

  it("without a key, messages are reported as not set up (nothing is sent)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await sendEmail(msg)).kind).toBe("unconfigured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends with an idempotency key; classifies failures; never echoes the key", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_SECRET_value");
    vi.stubEnv("EMAIL_FROM", "Blossom Square <bookings@blossomsquare.online>");
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ id: "re_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendEmail(msg)).toEqual({ kind: "sent", provider: "resend", id: "re_1" });
    const init = fetchMock.mock.calls[0][1] as RequestInit & { headers: Record<string, string> };
    expect(init.headers["Idempotency-Key"]).toBe(`bsq-${msg.id}`);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ name: "validation_error", message: "Invalid `to`" }), { status: 422 })));
    const bad = await sendEmail(msg);
    expect(bad.kind).toBe("failed");
    expect(JSON.stringify(bad)).not.toContain("re_SECRET_value");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("{}", { status: 429 })));
    expect((await sendEmail(msg)).kind).toBe("retry");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("socket hang up")));
    expect((await sendEmail(msg)).kind).toBe("retry");
  });

  it("classify: 5xx, 408, 409, 429 retry; other 4xx don't", () => {
    expect([500, 502, 503, 429, 408, 409].map(classify)).toEqual(Array(6).fill("retry"));
    expect([400, 401, 403, 404, 422].map(classify)).toEqual(Array(5).fill("failed"));
  });
});

describe("the outbox worker", () => {
  const row = (o: Partial<OutboxRow>): OutboxRow => ({ id: "m1", channel: "email", template: "booking_confirmation", recipient: "g@example.com", data: booking, attempts: 1, ...o });
  function deps(rows: OutboxRow[], over: Partial<WorkerDeps> = {}) {
    const completed: [string, string, string | null, string | null, string | null][] = [];
    const d: WorkerDeps = {
      claim: async () => rows,
      complete: async (id, result, provider, pid, error) => {
        completed.push([id, result, provider, pid, error]);
        return result;
      },
      sendEmail: async () => ({ kind: "sent", provider: "resend", id: "re_9" }),
      sendWhatsApp: async () => ({ kind: "sent", provider: "whatsapp", id: "wamid.1" }),
      whatsappConfigured: () => true,
      hotel: async () => DEFAULT_HOTEL_INFO,
      siteUrl: SITE,
      env: () => undefined,
      ...over,
    };
    return { d, completed };
  }

  it("sends each claimed message and reports the provider id", async () => {
    const { d, completed } = deps([row({})]);
    expect(await runOutbox(d)).toEqual({ claimed: 1, sent: 1, retry: 0, failed: 0, unconfigured: 0 });
    expect(completed).toEqual([["m1", "sent", "resend", "re_9", null]]);
  });

  it("a provider outage → retry; a thrown error → retry; bad template → failed", async () => {
    const { d, completed } = deps([row({ id: "a" }), row({ id: "b" }), row({ id: "c", template: "nope" })], {
      sendEmail: vi.fn().mockResolvedValueOnce({ kind: "retry", error: "Resend 503" }).mockRejectedValueOnce(new Error("boom")),
    });
    const s = await runOutbox(d);
    expect(s).toMatchObject({ claimed: 3, retry: 2, failed: 1 });
    expect(completed.map((c) => [c[0], c[1]])).toEqual([
      ["a", "retry"],
      ["b", "retry"],
      ["c", "failed"],
    ]);
    expect(completed[1][4]).toContain("boom");
  });

  it("WhatsApp: not configured, or no approved template → 'unconfigured' (kept for resend)", async () => {
    const wa = row({ id: "w", channel: "whatsapp", recipient: "8801712345678" });
    const a = deps([wa], { whatsappConfigured: () => false });
    await runOutbox(a.d);
    expect(a.completed[0][1]).toBe("unconfigured");

    const b = deps([wa], { env: () => undefined });
    await runOutbox(b.d);
    expect(b.completed[0][1]).toBe("unconfigured");
    expect(b.completed[0][4]).toContain("WHATSAPP_TEMPLATE_BOOKING_CONFIRMATION");

    const sent = vi.fn().mockResolvedValue({ kind: "sent", provider: "whatsapp", id: "wamid.2" });
    const c = deps([wa], { env: (n) => (n === "WHATSAPP_TEMPLATE_BOOKING_CONFIRMATION" ? "booking_update_v1" : undefined), sendWhatsApp: sent });
    await runOutbox(c.d);
    expect(sent).toHaveBeenCalledWith({ to: "8801712345678", template: "booking_update_v1", params: ["Asha", "BSQ-12345", expect.any(String), expect.any(String), "received"] });
  });

  it("nothing claimed → nothing else happens", async () => {
    const hotel = vi.fn();
    const { d } = deps([], { hotel });
    expect((await runOutbox(d)).claimed).toBe(0);
    expect(hotel).not.toHaveBeenCalled();
  });
});
