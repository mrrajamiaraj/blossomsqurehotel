// Payments and guest messaging (20261118230000): reported transfers and their
// verification, gateway notifications (signature, server-side verification,
// replay and idempotency), receipts and invoices, the message outbox with
// retries and delivery tracking, resend rules, and reconciliation — against
// PostgreSQL with every migration applied.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { as, createDevDatabase, rejects, type Db } from "./harness";

let db: Db;
let SUN = "";
const day = (n: number) => {
  const d = new Date(`${SUN}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const id = { manager: randomUUID(), desk: randomUUID(), finance: randomUUID(), hk: randomUUID() };
const anon = { kind: "anon" } as const;
const service = { kind: "service" } as const;
const desk = () => ({ kind: "user", id: id.desk, aal: "aal1" }) as const;
const mgr = () => ({ kind: "user", id: id.manager, aal: "aal2" }) as const;
const hk = () => ({ kind: "user", id: id.hk, aal: "aal1" }) as const;

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query<T>(sql, params)).rows[0];
}
const lines = (...types: string[]) => JSON.stringify(types.map((t) => ({ room_type: t })));
let phoneN = 0;

type Booked = { reference: string; manage_token: string; total: number; id: string };
async function book(opts: { email?: string | null; phone?: string; inN?: number; outN?: number } = {}): Promise<Booked> {
  const hold = (
    await one<{ h: { token: string; quote: { total: number } } }>("select public.create_hold($1, $2, 2, 0, $3::jsonb) as h", [
      day(opts.inN ?? 0),
      day(opts.outN ?? 2),
      lines("deluxe-couple"),
    ])
  ).h;
  const email = opts.email === undefined ? `g${randomUUID().slice(0, 8)}@example.com` : opts.email;
  const phone = opts.phone ?? `+880 171${String(++phoneN).padStart(7, "0")}`;
  const r = (
    await one<{ r: { reference: string; manage_token: string; total: number } }>(
      "select public.confirm_hold($1, $2, 'Test Guest', $3, $4, 'Bangladesh', '', '', false, 'pay_at_hotel', $5) as r",
      [hold.token, randomUUID(), email ?? "placeholder@example.com", phone, hold.quote.total],
    )
  ).r;
  const bid = (await one<{ id: string }>("select id from bookings where reference = $1", [r.reference])).id;
  if (email === null) await db.query("update bookings set email = null where id = $1", [bid]);
  return { ...r, id: bid };
}

const outbox = (bookingId: string) =>
  db.query<{ id: string; channel: string; template: string; status: string; recipient: string | null; data: Record<string, unknown> }>(
    "select id, channel, template, status, recipient, data from message_outbox where booking_id = $1 order by created_at, template",
    [bookingId],
  ).then((r) => r.rows);

const submit = (token: string, method: string, amount: number, ref: string) =>
  one<{ r: { id: string; status: string } }>("select public.guest_submit_payment($1, $2, $3, $4, '01711000000') as r", [token, method, amount, ref]).then((x) => x.r);

beforeAll(async () => {
  db = await createDevDatabase();
  SUN = (await one<{ d: string }>("select to_char(public._today() + 60 + ((7 - extract(dow from public._today() + 60)::int) % 7), 'YYYY-MM-DD') as d")).d;
  const people: [string, string, string][] = [
    [id.manager, "Mina Manager", "manager"],
    [id.desk, "Rana Desk", "receptionist"],
    [id.finance, "Farah Finance", "finance"],
    [id.hk, "Hasan HK", "housekeeping"],
  ];
  for (const [uid, name, role] of people) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [uid, `${uid.slice(0, 8)}@hotel.test`]);
    await db.query("insert into staff (user_id, full_name, role) values ($1, $2, $3)", [uid, name, role]);
  }
}, 60_000);

afterAll(async () => db?.close());

beforeEach(async () => {
  await db.exec(`
    delete from message_outbox; delete from webhook_receipts; delete from payment_gateway_events; delete from invoices;
    delete from messaging_consents; delete from refunds; delete from payments; delete from payment_intents;
    delete from booking_promotions; delete from booking_requests; delete from booking_access_tokens; delete from booking_events;
    delete from bookings; delete from booking_holds; delete from inquiries; delete from notifications;
    update hotel_settings set payment_methods = array['pay_at_hotel','bank_transfer','bkash_manual','nagad_manual'],
                              vat_percent = null, service_charge_percent = null;`);
});

/* ------------------------------------------------------- transfers */

describe("reported transfers", () => {
  it("a reported transfer is pending until staff verify it; then it counts, gets a receipt and the guest is told", async () => {
    const b = await book();
    const p = await submit(b.manage_token, "bkash_manual", 2000, "9AB 12cd34");
    expect(p.status).toBe("pending");
    const row = await one<{ amount_paid_bdt: number; payment_status: string }>("select amount_paid_bdt, payment_status from bookings where id = $1", [b.id]);
    expect(row).toEqual({ amount_paid_bdt: 0, payment_status: "unpaid" });
    expect((await one<{ reference: string; method: string }>("select reference, method from payments where id = $1", [p.id]))).toEqual({ reference: "9AB12CD34", method: "bkash" });
    // Staff are told there's something to check.
    expect((await one<{ n: number }>("select count(*)::int n from notifications where title like 'Payment to verify%'")).n).toBeGreaterThan(0);

    // Desk staff verify it (claims set on the session so the change is kept).
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: id.desk, role: "authenticated", aal: "aal1" })]);
    await db.query("select public.admin_verify_payment($1, true, 'Seen in bKash app')", [p.id]);
    await db.query("select set_config('request.jwt.claims', '', false)");
    const paid = await one<{ amount_paid_bdt: number; payment_status: string; receipt_no: string; status: string }>(
      "select b.amount_paid_bdt, b.payment_status, p.receipt_no, p.status from bookings b join payments p on p.booking_id = b.id where p.id = $1",
      [p.id],
    );
    expect(paid.status).toBe("confirmed");
    expect(paid.amount_paid_bdt).toBe(2000);
    expect(paid.payment_status).toBe("partial");
    expect(paid.receipt_no).toMatch(/^RCP-\d{4}-\d{6}$/);
    const msgs = await outbox(b.id);
    expect(msgs.map((m) => m.template)).toContain("payment_confirmation");
    const conf = msgs.find((m) => m.template === "payment_confirmation")!;
    expect((conf.data.payment as { receipt_no: string }).receipt_no).toBe(paid.receipt_no);
  });

  it("the same transaction ID can't be reported twice (even on another booking); amounts can't exceed the balance", async () => {
    const a = await book();
    const b = await book();
    await submit(a.manage_token, "bank_transfer", 1000, "TXN-778899");
    expect(await rejects(submit(b.manage_token, "bank_transfer", 1000, "txn-778899"))).toMatch(/DUPLICATE_REFERENCE/);
    // Same ID on a different method is a different transaction.
    await submit(b.manage_token, "nagad_manual", 1000, "TXN-778899");
    expect(await rejects(submit(a.manage_token, "bank_transfer", a.total, "TXN-000111"))).toMatch(/BAD_AMOUNT/); // pending 1000 already counts
    expect(await rejects(submit(a.manage_token, "bank_transfer", 100, "abc"))).toMatch(/BAD_REFERENCE/);
  });

  it("only offered methods; at most three waiting reports; nothing after cancellation", async () => {
    const b = await book();
    await db.query("update hotel_settings set payment_methods = array['pay_at_hotel', 'bank_transfer']");
    expect(await rejects(submit(b.manage_token, "bkash_manual", 100, "BK000001"))).toMatch(/METHOD_DISABLED/);
    expect(await rejects(submit(b.manage_token, "card", 100, "CARD00001"))).toMatch(/METHOD_DISABLED/);
    for (const n of [1, 2, 3]) await submit(b.manage_token, "bank_transfer", 100, `BANK00000${n}`);
    expect(await rejects(submit(b.manage_token, "bank_transfer", 100, "BANK000004"))).toMatch(/TOO_MANY_PENDING/);
    await db.query("update bookings set status = 'cancelled' where id = $1", [b.id]);
    await db.query("delete from payments where booking_id = $1", [b.id]);
    expect(await rejects(submit(b.manage_token, "bank_transfer", 100, "BANK000005"))).toMatch(/LOCKED/);
  });

  it("rejecting needs a reason; the guest is told it wasn't found; housekeeping and guests can't verify", async () => {
    const b = await book();
    const p = await submit(b.manage_token, "bank_transfer", 1500, "EBL-55501");
    await as(db, desk(), async (q) => {
      expect(await rejects(q("select public.admin_verify_payment($1, false, '')", [p.id]))).toMatch(/BAD_TRANSITION/);
    });
    expect(await rejects(as(db, hk(), (q) => q("select public.admin_verify_payment($1, true, null)", [p.id])))).toMatch(/NOT_ALLOWED/);
    expect(await rejects(as(db, anon, (q) => q("select public.admin_verify_payment($1, true, null)", [p.id])))).toMatch(/permission denied/);
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: id.desk, role: "authenticated", aal: "aal1" })]);
    await db.query("select public.admin_verify_payment($1, false, 'Not in the bank statement')", [p.id]);
    await db.query("select set_config('request.jwt.claims', '', false)");
    expect((await one<{ status: string }>("select status from payments where id = $1", [p.id])).status).toBe("failed");
    const fail = (await outbox(b.id)).find((m) => m.template === "payment_failure")!;
    expect((fail.data.payment as { reason: string }).reason).toBe("Not in the bank statement");
    // The same transaction ID can be reported again after a rejection.
    await submit(b.manage_token, "bank_transfer", 1500, "EBL-55501");
  });
});

/* -------------------------------------------------------- gateways */

describe("gateway notifications", () => {
  async function intent(b: Booked, amount: number, provider = "bkash") {
    await db.query("update hotel_settings set payment_methods = array_append(payment_methods, $1)", [provider]);
    return (
      await one<{ r: { intent_id: string } }>("select public.create_payment_intent($1, $2, $3, $4) as r", [b.reference, amount, provider, randomUUID()])
    ).r.intent_id;
  }
  const event = (provider: string, eventId: string, intentId: string, status: string, amount: number, sig = true, verified = true, ref = "TRX" + eventId) =>
    one<{ r: string }>("select public.record_gateway_event($1, $2, $3, $4, $5, $6, $7, $8, $9) as r", [
      provider, eventId, intentId, ref, status, amount, "a".repeat(64), sig, verified,
    ]).then((x) => x.r);

  it("only the server can create intents or report results; disabled methods are refused", async () => {
    const b = await book();
    expect(await rejects(db.query("select public.create_payment_intent($1, 100, 'bkash', $2)", [b.reference, randomUUID()]))).toMatch(/METHOD_DISABLED/);
    for (const actor of [anon, desk()]) {
      expect(await rejects(as(db, actor, (q) => q("select public.create_payment_intent($1, 100, 'card', $2)", [b.reference, randomUUID()])))).toMatch(/permission denied/);
      expect(await rejects(as(db, actor, (q) => q("select public.record_gateway_event('bkash', 'e', null, 'r', 'succeeded', 1, null, true, true)")))).toMatch(/permission denied/);
      expect(await rejects(as(db, actor, (q) => q("select public.apply_payment_callback('bkash', gen_random_uuid(), 'r', 'succeeded', 1)")))).toMatch(/permission denied/);
    }
    await as(db, service, (q) => q("select public.expire_payment_intents()"));
  });

  it("applies a verified success once; replays, bad signatures and unverified events change nothing", async () => {
    const b = await book();
    const i = await intent(b, 1200);
    expect(await event("bkash", "ev-1", i, "succeeded", 1200, false, true)).toBe("bad_signature");
    expect(await event("bkash", "ev-2", i, "succeeded", 1200, true, false)).toBe("unverified");
    expect((await one<{ n: number }>("select count(*)::int n from payments where booking_id = $1", [b.id])).n).toBe(0);

    expect(await event("bkash", "ev-3", i, "succeeded", 1200)).toBe("applied");
    expect(await event("bkash", "ev-3", i, "succeeded", 1200)).toBe("replay");
    expect(await event("bkash", "ev-4", i, "succeeded", 1200, true, true, "TRXev-3")).toBe("duplicate");
    const p = await one<{ n: number; method: string; source: string; receipt: string }>(
      "select count(*)::int n, max(method) method, max(source) source, max(receipt_no) receipt from payments where booking_id = $1",
      [b.id],
    );
    expect(p).toMatchObject({ n: 1, method: "bkash", source: "gateway" });
    expect(p.receipt).toMatch(/^RCP-/);
    expect((await one<{ amount_paid_bdt: number }>("select amount_paid_bdt from bookings where id = $1", [b.id])).amount_paid_bdt).toBe(1200);
    const outcomes = (await db.query<{ event_id: string; outcome: string }>("select event_id, outcome from payment_gateway_events order by id")).rows;
    expect(outcomes).toEqual([
      { event_id: "ev-1", outcome: "bad_signature" },
      { event_id: "ev-2", outcome: "unverified" },
      { event_id: "ev-3", outcome: "applied" },
      { event_id: "ev-4", outcome: "duplicate" },
    ]);
  });

  it("a wrong amount fails the intent and tells the guest; a success after expiry is still recorded", async () => {
    const b = await book();
    const i = await intent(b, 1000, "card");
    expect(await event("card", "m-1", i, "succeeded", 999)).toBe("mismatch");
    expect((await one<{ n: number }>("select count(*)::int n from payments where booking_id = $1", [b.id])).n).toBe(0);
    expect((await outbox(b.id)).some((m) => m.template === "payment_failure")).toBe(true);

    const j = await intent(b, 500, "card");
    await db.query("update payment_intents set expires_at = now() - interval '1 minute' where id = $1", [j]);
    await db.query("select public.expire_payment_intents()");
    expect(await event("card", "x-1", j, "failed", 500)).toBe("ignored");
    expect(await event("card", "x-2", j, "succeeded", 500)).toBe("applied");
    expect((await one<{ method: string }>("select method from payments where intent_id = $1", [j])).method).toBe("card");
  });

  it("intents can't exceed the open balance, counting other live intents; idempotency keys replay", async () => {
    const b = await book();
    await db.query("update hotel_settings set payment_methods = array_append(payment_methods, 'nagad')");
    const key = randomUUID();
    const first = (await one<{ r: { intent_id: string; replayed: boolean } }>("select public.create_payment_intent($1, $2, 'nagad', $3) as r", [b.reference, b.total - 100, key])).r;
    const again = (await one<{ r: { intent_id: string; replayed: boolean } }>("select public.create_payment_intent($1, $2, 'nagad', $3) as r", [b.reference, b.total - 100, key])).r;
    expect(again).toMatchObject({ intent_id: first.intent_id, replayed: true });
    expect(await rejects(db.query("select public.create_payment_intent($1, 200, 'nagad', $2)", [b.reference, randomUUID()]))).toMatch(/BAD_AMOUNT/);
    await db.query("select public.create_payment_intent($1, 100, 'nagad', $2)", [b.reference, randomUUID()]);
  });

  it("guests see only their own intent's status", async () => {
    const a = await book();
    const b = await book();
    const i = await intent(a, 300);
    const s = await as(db, anon, (q) => q<{ r: { status: string } }>("select public.guest_payment_status($1, $2) as r", [a.manage_token, i]));
    expect(s.rows[0].r.status).toBe("created");
    expect(await rejects(as(db, anon, (q) => q("select public.guest_payment_status($1, $2)", [b.manage_token, i])))).toMatch(/NOT_FOUND/);
  });
});

/* ------------------------------------------------- invoices & receipts */

describe("invoices and receipts", () => {
  it("numbers an invoice once and itemises charges, payments and balance; the guest copy masks contact details", async () => {
    await db.query("update hotel_settings set vat_percent = 15, service_charge_percent = 10");
    const b = await book();
    await db.query("insert into payments (booking_id, amount_bdt, method, note) values ($1, 1000, 'cash', 'desk')", [b.id]);
    const inv = await as(db, desk(), (q) => q<{ r: Record<string, unknown> }>("select public.admin_invoice($1) as r", [b.id]));
    const doc = inv.rows[0].r as {
      number: string; total: number; subtotal: number; service_charge: number; vat: number; paid: number; balance: number;
      lines: { room_type: string; subtotal: number }[]; payments: { receipt_no: string; amount: number }[]; guest: { email: string };
    };
    expect(doc.number).toMatch(/^INV-\d{4}-\d{5}$/);
    expect(doc.subtotal + doc.service_charge + doc.vat).toBe(doc.total);
    expect(doc.service_charge).toBeGreaterThan(0);
    expect(doc.lines[0].room_type).toBe("Deluxe Couple");
    expect(doc.paid).toBe(1000);
    expect(doc.balance).toBe(doc.total - 1000);
    expect(doc.payments[0].receipt_no).toMatch(/^RCP-/);
    expect(doc.guest.email).toMatch(/@example\.com$/);
    expect(doc.guest.email).not.toContain("•");

    // `as` rolled back the first number; issue for real, then check it's stable.
    const n1 = (await one<{ r: { number: string } }>("select public._invoice_json($1, true) as r", [b.id])).r.number;
    const guest = (await as(db, anon, (q) => q<{ r: { number: string; guest: { email: string } } }>("select public.guest_invoice($1) as r", [b.manage_token]))).rows[0].r;
    expect(guest.number).toBe(n1);
    expect(guest.guest.email).toContain("•••@");
    expect(await rejects(as(db, hk(), (q) => q("select public.admin_invoice($1)", [b.id])))).toMatch(/NOT_ALLOWED/);
  });

  it("receipts: staff with payments.read; a guest only for their own confirmed payment", async () => {
    const a = await book();
    const b = await book();
    const pid = (await one<{ id: string }>("insert into payments (booking_id, amount_bdt, method) values ($1, 700, 'cash') returning id", [a.id])).id;
    const r = (await as(db, desk(), (q) => q<{ r: { receipt_no: string; amount: number; booking: { balance: number } } }>("select public.admin_payment_receipt($1) as r", [pid]))).rows[0].r;
    expect(r.amount).toBe(700);
    expect(r.booking.balance).toBe(a.total - 700);
    await as(db, anon, (q) => q("select public.guest_payment_receipt($1, $2)", [a.manage_token, pid]));
    expect(await rejects(as(db, anon, (q) => q("select public.guest_payment_receipt($1, $2)", [b.manage_token, pid])))).toMatch(/NOT_FOUND/);
    expect(await rejects(as(db, hk(), (q) => q("select public.admin_payment_receipt($1)", [pid])))).toMatch(/NOT_ALLOWED/);
  });
});

/* ------------------------------------------------------- messaging */

describe("guest messages are queued by what happens", () => {
  it("booking received → confirmed → modified → cancelled, each once", async () => {
    const b = await book();
    expect((await outbox(b.id)).map((m) => [m.template, m.data.stage ?? null, m.status])).toEqual([["booking_confirmation", "received", "queued"]]);
    await db.query("select public._transition($1, 'confirmed', null)", [b.id]);
    await db.query("select public._log($1, 'modified', '{\"from\":{},\"to\":{}}')", [b.id]);
    await db.query("select public._transition($1, 'cancelled', 'Plans changed')", [b.id]);
    const msgs = await outbox(b.id);
    expect(msgs.map((m) => m.template).sort()).toEqual(["booking_cancellation", "booking_confirmation", "booking_confirmation", "booking_modification"]);
    expect(msgs.find((m) => m.template === "booking_cancellation")!.data.reason).toBe("Plans changed");
    expect(msgs.every((m) => m.channel === "email")).toBe(true);
  });

  it("without an email address the message is recorded as skipped", async () => {
    const b = await book();
    await db.query("delete from message_outbox");
    await db.query("update bookings set email = null where id = $1", [b.id]);
    await db.query("select public._transition($1, 'confirmed', null)", [b.id]);
    const [m] = await outbox(b.id);
    expect(m).toMatchObject({ status: "skipped", recipient: null });
  });

  it("WhatsApp only with the guest's consent and a valid mobile number", async () => {
    const b = await book({ phone: "01712-345678" });
    await as(db, anon, (q) => q("select public.guest_set_whatsapp_consent($1, true)", [b.manage_token]));
    await db.query("select public.guest_set_whatsapp_consent($1, true)", [b.manage_token]);
    await db.query("select public._transition($1, 'confirmed', null)", [b.id]);
    const wa = (await outbox(b.id)).filter((m) => m.channel === "whatsapp");
    expect(wa).toHaveLength(1);
    expect(wa[0].recipient).toBe("8801712345678");

    const c = await book({ phone: "123456" }); // accepted for a booking, but not a mobile number
    expect(await rejects(db.query("select public.guest_set_whatsapp_consent($1, true)", [c.manage_token]))).toMatch(/NO_RECIPIENT/);
  });

  it("enquiries get an acknowledgment; tomorrow's confirmed arrivals get one reminder", async () => {
    await db.query("insert into inquiries (reference, kind, name, email, message) values ('ENQ-1', 'general', 'Asha Rahman', 'asha@example.com', 'Do you have a sea view room?')");
    const ack = await one<{ template: string; recipient: string; data: { first_name: string } }>("select template, recipient, data from message_outbox where inquiry_id is not null");
    expect(ack).toMatchObject({ template: "inquiry_acknowledgment", recipient: "asha@example.com", data: { first_name: "Asha" } });

    const b = await book();
    await db.query("update bookings set status = 'confirmed', check_in = public._today() + 1, check_out = public._today() + 3 where id = $1", [b.id]);
    expect((await one<{ n: number }>("select public.enqueue_pre_arrival_reminders() n")).n).toBe(1);
    await db.query("select public.enqueue_pre_arrival_reminders()");
    expect((await outbox(b.id)).filter((m) => m.template === "pre_arrival")).toHaveLength(1);
  });
});

describe("the message worker", () => {
  const claim = (n = 10) => db.query<{ id: string; attempts: number }>("select id, attempts from public.claim_messages($1)", [n]).then((r) => r.rows);
  const complete = (mid: string, result: string, err: string | null = null, pid: string | null = null) =>
    one<{ r: string }>("select public.complete_message($1, $2, 'resend', $3, $4) as r", [mid, result, pid, err]).then((x) => x.r);
  const status = (mid: string) => one<{ status: string; attempts: number; next_attempt_at: string; last_error: string | null }>("select status, attempts, next_attempt_at, last_error from message_outbox where id = $1", [mid]);

  it("claims each due message once, records the attempt, and marks it sent", async () => {
    const b = await book();
    const [m] = await outbox(b.id);
    const got = await claim();
    expect(got.map((g) => g.id)).toEqual([m.id]);
    expect(got[0].attempts).toBe(1);
    expect(await claim()).toEqual([]); // locked while sending
    expect(await complete(m.id, "sent", null, "re_123")).toBe("sent");
    expect(await complete(m.id, "sent", null, "re_123")).toBe("ignored"); // idempotent
    expect((await status(m.id)).status).toBe("sent");
    const kinds = (await db.query<{ kind: string }>("select kind from message_events where message_id = $1 order by id", [m.id])).rows.map((r) => r.kind);
    expect(kinds).toEqual(["queued", "attempt", "sent"]);
  });

  it("retries with growing delays, then gives up; a stuck claim is picked up again", async () => {
    const b = await book();
    const [m] = await outbox(b.id);
    await claim();
    expect(await complete(m.id, "retry", "503 from provider")).toBe("retry");
    const s1 = await status(m.id);
    expect(s1.status).toBe("queued");
    expect(new Date(s1.next_attempt_at).getTime()).toBeGreaterThan(Date.now() + 2 * 60_000);
    expect(await claim()).toEqual([]); // not due yet

    // Stale lock: a worker died mid-send.
    await db.query("update message_outbox set next_attempt_at = now() where id = $1", [m.id]);
    await claim();
    await db.query("update message_outbox set locked_until = now() - interval '1 second' where id = $1", [m.id]);
    expect((await claim()).map((g) => g.id)).toEqual([m.id]);

    await db.query("update message_outbox set attempts = max_attempts where id = $1", [m.id]);
    expect(await complete(m.id, "retry", "still down")).toBe("failed");
    expect(await status(m.id)).toMatchObject({ status: "failed", last_error: "still down" });
  });

  it("no provider configured → 'unconfigured' (kept for a resend), not a used-up attempt", async () => {
    const b = await book();
    const [m] = await outbox(b.id);
    await claim();
    expect(await complete(m.id, "unconfigured", "Email isn't set up")).toBe("unconfigured");
    expect(await status(m.id)).toMatchObject({ status: "unconfigured", attempts: 0 });
  });

  it("delivery webhooks: applied once, delivered and bounced tracked, unknown ids ignored", async () => {
    const b = await book();
    const [m] = await outbox(b.id);
    await claim();
    await complete(m.id, "sent", null, "re_abc");
    const upd = (ev: string, status: string, pid = "re_abc") =>
      one<{ r: string }>("select public.message_delivery_update('resend', $1, $2, $3, '{}') as r", [ev, pid, status]).then((x) => x.r);
    expect(await upd("w1", "delivered")).toBe("applied");
    expect(await upd("w1", "delivered")).toBe("replay");
    expect((await status(m.id)).status).toBe("delivered");
    expect(await upd("w2", "bounced")).toBe("applied");
    expect((await status(m.id)).status).toBe("failed");
    expect(await upd("w3", "delivered", "re_nope")).toBe("unknown");
    expect(await rejects(as(db, anon, (q) => q("select public.message_delivery_update('resend', 'x', 'y', 'delivered', '{}')")))).toMatch(/permission denied/);
    expect(await rejects(as(db, desk(), (q) => q("select * from public.claim_messages(5)")))).toMatch(/permission denied/);
  });
});

describe("resending", () => {
  async function failed(b: Booked) {
    const [m] = await outbox(b.id);
    await db.query("update message_outbox set status = 'failed', last_error = 'bounced' where id = $1", [m.id]);
    return m.id;
  }
  const asDesk = async <T>(sql: string, params: unknown[]) => {
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: id.desk, role: "authenticated", aal: "aal1" })]);
    try {
      return await one<T>(sql, params);
    } finally {
      await db.query("select set_config('request.jwt.claims', '', false)");
    }
  };

  it("desk staff resend a failed message to the guest's current address, once", async () => {
    const b = await book();
    const mid = await failed(b);
    await db.query("update bookings set email = 'fixed@example.com' where id = $1", [b.id]);
    const r = await asDesk<{ id: string }>("select public.admin_resend_message($1) as id", [mid]);
    const fresh = await one<{ status: string; recipient: string; resent_from: string; created_by: string }>("select status, recipient, resent_from, created_by from message_outbox where id = $1", [r.id]);
    expect(fresh).toEqual({ status: "queued", recipient: "fixed@example.com", resent_from: mid, created_by: id.desk });
    expect(await rejects(asDesk("select public.admin_resend_message($1)", [mid]))).toMatch(/ALREADY_RESENT/);
    expect((await one<{ n: number }>("select count(*)::int n from booking_events where booking_id = $1 and kind = 'message'", [b.id])).n).toBe(1);
  });

  it("sent messages can't be resent; housekeeping can't resend; no address → clear error; three resends a day at most", async () => {
    const b = await book();
    const [m] = await outbox(b.id);
    expect(await rejects(asDesk("select public.admin_resend_message($1)", [m.id]))).toMatch(/RESEND_NOT_ALLOWED/);
    await db.query("update message_outbox set status = 'failed' where id = $1", [m.id]);
    expect(await rejects(as(db, hk(), (q) => q("select public.admin_resend_message($1)", [m.id])))).toMatch(/NOT_ALLOWED/);
    await db.query("update bookings set email = null where id = $1", [b.id]);
    expect(await rejects(asDesk("select public.admin_resend_message($1)", [m.id]))).toMatch(/NO_RECIPIENT/);
    await db.query("update bookings set email = 'again@example.com' where id = $1", [b.id]);
    let cur = m.id;
    for (let n = 0; n < 3; n++) {
      cur = (await asDesk<{ id: string }>("select public.admin_resend_message($1) as id", [cur])).id;
      await db.query("update message_outbox set status = 'failed' where id = $1", [cur]);
    }
    expect(await rejects(asDesk("select public.admin_resend_message($1)", [cur]))).toMatch(/RESEND_LIMIT/);
  });

  it("staff see messages for bookings they can read; housekeeping sees none", async () => {
    await book();
    const deskRows = await as(db, desk(), (q) => q<{ n: number }>("select count(*)::int n from message_outbox"));
    expect(deskRows.rows[0].n).toBe(1);
    const hkRows = await as(db, hk(), (q) => q<{ n: number }>("select count(*)::int n from message_outbox"));
    expect(hkRows.rows[0].n).toBe(0);
    expect(await rejects(as(db, anon, (q) => q("select * from message_outbox")))).toMatch(/permission denied/);
  });
});

/* -------------------------------------------------- reconciliation */

describe("reconciliation", () => {
  it("totals by method and lists what needs checking", async () => {
    const a = await book();
    const b = await book();
    await db.query("insert into payments (booking_id, amount_bdt, method) values ($1, 1500, 'cash'), ($1, 500, 'bkash')", [a.id]);
    const late = await submit(b.manage_token, "bank_transfer", 800, "EBL-OLD-1");
    await db.query("update payments set created_at = now() - interval '2 days' where id = $1", [late.id]);
    // Cancelled with money held and no refund under way.
    await db.query("update bookings set status = 'cancelled' where id = $1", [a.id]);

    const r = (
      await as(db, mgr(), (q) => q<{ r: { by_method: { method: string; received: number; pending: number }[]; exceptions: { kind: string; reference: string }[] } }>(
        "select public.admin_payment_reconciliation(current_date - 7, current_date + 1) as r",
      ))
    ).rows[0].r;
    expect(r.by_method.find((m) => m.method === "cash")!.received).toBe(1500);
    expect(r.by_method.find((m) => m.method === "bank")!.pending).toBe(800);
    const kinds = r.exceptions.map((e) => `${e.kind}:${e.reference}`);
    expect(kinds).toContain(`unverified_transfer:${b.reference}`);
    expect(kinds).toContain(`refund_owed:${a.reference}`);
    expect(await rejects(as(db, hk(), (q) => q("select public.admin_payment_reconciliation(current_date - 7, current_date)")))).toMatch(/NOT_ALLOWED/);
  });
});

describe("payment settings", () => {
  it("managers choose the offered methods; unknown methods are refused; desk staff can't", async () => {
    const r = await as(db, mgr(), (q) => q<{ m: string[] }>("select public.admin_set_payment_methods(array['bank_transfer', 'card', 'card']) as m"));
    expect(r.rows[0].m).toEqual(["bank_transfer", "card"]);
    expect(await rejects(as(db, mgr(), (q) => q("select public.admin_set_payment_methods(array['paypal'])")))).toMatch(/BAD_PAYMENT_OPTION/);
    expect(await rejects(as(db, desk(), (q) => q("select public.admin_set_payment_methods(array['card'])")))).toMatch(/NOT_ALLOWED/);
  });

  it("guests see the balance, offered methods and their reports", async () => {
    const b = await book();
    await submit(b.manage_token, "bank_transfer", 1000, "EBL-12345");
    const o = (await as(db, anon, (q) => q<{ r: { balance: number; payable: number; methods: string[]; payments: { status: string }[] } }>("select public.guest_payment_options($1) as r", [b.manage_token]))).rows[0].r;
    expect(o.balance).toBe(b.total);
    expect(o.payable).toBe(b.total - 1000);
    expect(o.methods).toContain("bank_transfer");
    expect(o.payments[0].status).toBe("pending");
  });
});
