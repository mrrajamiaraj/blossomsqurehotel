// End-to-end journeys through the database, in order, as each kind of user
// would make them through the app (the app's server actions call exactly
// these functions with the visitor's or staff member's session):
//
//   Guest:  browse → search → choose → price → details → reserve → confirmation
//           → look up securely → change request → cancel
//   Staff:  sign in → arrivals → walk-in → check-in → payment → housekeeping
//           → check-out → revenue → room copy (content editor) → owner overview
//
// Plus the security and reliability checks the release requires. Every step
// asserts its result; nothing is assumed.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, commitAs, createDevDatabase, rejects, type Actor, type Db } from "./harness";

let db: Db;
const id = { owner: randomUUID(), manager: randomUUID(), desk: randomUUID(), finance: randomUUID(), editor: randomUUID(), hk: randomUUID() };
const anon: Actor = { kind: "anon" };
const service: Actor = { kind: "service" };
const user = (uid: string, mfa = false): Actor => ({ kind: "user", id: uid, aal: mfa ? "aal2" : "aal1" });
const owner = () => user(id.owner, true);
const manager = () => user(id.manager, true);
const desk = () => user(id.desk);
const finance = () => user(id.finance, true);
const editor = () => user(id.editor);
const hk = () => user(id.hk);

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query<T>(sql, params)).rows[0];
}
/** Runs as `actor` and keeps the result (fixtures and journey steps). */
const run = <T>(actor: Actor, sql: string, params: unknown[] = []) => commitAs(db, actor, async (q) => (await q<T>(sql, params)).rows[0]);
/** Runs as `actor` and rolls back (permission checks). */
const peek = <T>(actor: Actor, sql: string, params: unknown[] = []) => as(db, actor, async (q) => (await q<T>(sql, params)).rows);

let today = "";
const plus = (n: number) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

beforeAll(async () => {
  db = await createDevDatabase();
  today = (await one<{ d: string }>("select to_char(public._today(), 'YYYY-MM-DD') d")).d;
  const people: [string, string, string][] = [
    [id.owner, "Olivia Owner", "owner"],
    [id.manager, "Mina Manager", "manager"],
    [id.desk, "Rana Desk", "receptionist"],
    [id.finance, "Farah Finance", "finance"],
    [id.editor, "Esha Editor", "content_editor"],
    [id.hk, "Hasan HK", "housekeeping"],
  ];
  for (const [uid, name, role] of people) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [uid, `${uid.slice(0, 8)}@hotel.test`]);
    await db.query("insert into staff (user_id, full_name, role) values ($1, $2, $3)", [uid, name, role]);
  }
  await db.query("update hotel_settings set vat_percent = 15, service_charge_percent = 10");
  // The same room line-up as production (the migrations seed 101–103 and 201–204;
  // 104–107 and 301 were added in production as placeholders).
  await db.query(`insert into rooms (number, room_type_id, floor)
    select v.n, t.id, v.f from (values ('104', 'standard-couple', '1st'), ('105', 'standard-couple', '1st'), ('106', 'honeymoon-couple', '1st'),
      ('107', 'premium-twin', '1st'), ('301', 'executive-family-suite', '3rd')) v(n, slug, f) join room_types t on t.slug = v.slug`);
}, 60_000);

afterAll(async () => db?.close());

/* ============================================================ guest journey */

describe("guest journey: from the homepage to a cancelled booking", () => {
  const state: { hold?: { token: string; quote: Quote }; ref?: string; manage?: string; bookingId?: string; access?: string } = {};
  type Quote = { subtotal: number; discount: number; service_charge: number; vat: number; total: number; nights: number; lines: { nights: { night: string; rate: number; weekend: boolean }[] }[] };
  const IN = () => plus(30);
  const OUT = () => plus(33);

  it("1. the homepage's rooms are readable by anyone (published only)", async () => {
    const rows = await peek<{ slug: string; price_bdt: number }>(anon, "select slug, price_bdt from room_types order by sort_order");
    expect(rows.length).toBeGreaterThanOrEqual(7);
    expect(rows.every((r) => r.price_bdt >= 500)).toBe(true);
  });

  it("2. availability search returns rooms with live totals", async () => {
    const rows = await peek<{ room_type: string; available: number; total: number; nights: number }>(
      anon,
      "select room_type, available, total, nights from public.search_availability($1, $2, 2, 0, null)",
      [IN(), OUT()],
    );
    const dc = rows.find((r) => r.room_type === "deluxe-couple")!;
    expect(dc.available).toBeGreaterThan(0);
    expect(dc.nights).toBe(3);
    expect(dc.total).toBeGreaterThan(0);
  });

  it("3–4. choosing a room holds it and prices the whole stay: nights, weekend rates, service, VAT", async () => {
    state.hold = (
      await run<{ h: { token: string; quote: Quote } }>(anon, "select public.create_hold($1, $2, 2, 0, '[{\"room_type\":\"deluxe-couple\"}]'::jsonb, null) as h", [IN(), OUT()])
    ).h;
    const q = state.hold.quote;
    const t = await one<{ price_bdt: number; weekend_price_bdt: number }>("select price_bdt, weekend_price_bdt from room_types where slug = 'deluxe-couple'");
    const nights = q.lines[0].nights;
    expect(nights).toHaveLength(3);
    for (const n of nights) expect(n.rate).toBe(n.weekend ? t.weekend_price_bdt : t.price_bdt);
    const sub = nights.reduce((s, n) => s + n.rate, 0);
    expect(q.subtotal).toBe(sub);
    expect(q.service_charge).toBe(Math.round(sub * 0.1));
    expect(q.vat).toBe(Math.round((sub + q.service_charge) * 0.15));
    expect(q.total).toBe(sub + q.service_charge + q.vat);
  });

  it("5–7. guest details → reservation → confirmation (and the confirmation email is queued)", async () => {
    const r = (
      await run<{ r: { reference: string; status: string; total: number; manage_token: string } }>(
        anon,
        "select public.confirm_hold($1, $2, 'Asha Rahman', 'asha@example.com', '+880 1711 223344', 'Bangladesh', 'Evening', 'Sea view if possible', false, 'pay_at_hotel', $3) as r",
        [state.hold!.token, randomUUID(), state.hold!.quote.total],
      )
    ).r;
    expect(r.reference).toMatch(/^BSQ-\d{5}$/);
    expect(r.status).toBe("pending");
    expect(r.total).toBe(state.hold!.quote.total);
    state.ref = r.reference;
    state.manage = r.manage_token;
    state.bookingId = (await one<{ id: string }>("select id from bookings where reference = $1", [r.reference])).id;
    const m = await one<{ template: string; recipient: string; data: { stage: string } }>("select template, recipient, data from message_outbox where booking_id = $1", [state.bookingId]);
    expect(m).toMatchObject({ template: "booking_confirmation", recipient: "asha@example.com", data: { stage: "received" } });
  });

  it("8. retrieving the booking needs the reference AND the contact; the view is masked", async () => {
    const wrong = await run<{ t: unknown }>(anon, "select public.verify_booking_access($1, '01999999999') as t", [state.ref]);
    expect(wrong.t).toBeNull();
    const ok = await run<{ t: { token: string } }>(anon, "select public.verify_booking_access($1, '01711223344') as t", [state.ref]);
    state.access = ok.t.token;
    const v = (await peek<{ v: { reference: string; email: string; phone: string; total: number; can_cancel: boolean } }>(anon, "select public.guest_booking($1) as v", [state.access]))[0].v;
    expect(v.reference).toBe(state.ref);
    expect(v.email).toBe("a•••@example.com");
    expect(v.phone).toBe("•••• 344");
    expect(v.can_cancel).toBe(true);
    expect(await rejects(peek(anon, "select * from bookings"))).toMatch(/permission denied/);
  });

  it("9. the guest asks for new dates, then cancels; the room goes back on sale", async () => {
    const before = (await peek<{ available: number }>(anon, "select available from public.search_availability($1, $2, 2, 0, null) where room_type = 'deluxe-couple'", [IN(), OUT()]))[0].available;
    const ch = await run<{ r: { requested: boolean } }>(anon, "select public.guest_request_change($1, $2, $3, 'One night later') as r", [state.access, plus(31), plus(34)]);
    expect(ch.r.requested).toBe(true);
    const c = await run<{ r: string }>(anon, "select public.guest_cancel($1, 'Plans changed') as r", [state.access]);
    expect(c.r).toBe("cancelled");
    expect((await one<{ status: string }>("select status from bookings where id = $1", [state.bookingId])).status).toBe("cancelled");
    const after = (await peek<{ available: number }>(anon, "select available from public.search_availability($1, $2, 2, 0, null) where room_type = 'deluxe-couple'", [IN(), OUT()]))[0].available;
    expect(after).toBe(before + 1);
    expect((await one<{ n: number }>("select count(*)::int n from message_outbox where booking_id = $1 and template = 'booking_cancellation'", [state.bookingId])).n).toBe(1);
    // The date-change request closed with the booking (staff don't see a stale request).
    expect((await one<{ status: string }>("select status from booking_requests where booking_id = $1 and kind = 'change'", [state.bookingId])).status).toBe("declined");
    // A cancelled booking can't be cancelled again.
    expect(await rejects(run(anon, "select public.guest_cancel($1, 'again')", [state.access]))).toMatch(/NOT_ALLOWED/);
  });
});

/* ============================================================ staff journey */

describe("staff journey: a walk-in from arrival to the revenue report", () => {
  const s: { ref?: string; bookingId?: string; roomId?: string; paymentId?: string } = {};

  it("1. signing in: each role gets its own permissions; MFA roles need the second factor", async () => {
    const d = (await peek<{ a: { role: string; permissions: string[] } }>(desk(), "select public.my_access() as a"))[0].a;
    expect(d.role).toBe("receptionist");
    expect(d.permissions).toContain("bookings.write");
    expect(d.permissions).not.toContain("refunds.approve");
    expect(await rejects(peek(user(id.finance, false), "select public.admin_record_payment(gen_random_uuid(), 100, 'cash', '')"))).toMatch(/MFA_REQUIRED/);
    const nobody = (await peek<{ a: { staff: boolean } }>(user(randomUUID()), "select public.my_access() as a"))[0].a;
    expect(nobody.staff).toBe(false);
  });

  it("2. the receptionist sees today's arrivals; housekeeping and guests don't see bookings", async () => {
    const h = (await run<{ h: { token: string; quote: { total: number } } }>(anon, "select public.create_hold($1, $2, 2, 0, '[{\"room_type\":\"standard-couple\"}]'::jsonb, null) as h", [today, plus(1)])).h;
    await run(anon, "select public.confirm_hold($1, $2, 'Karim Uddin', 'karim@example.com', '+8801811000111', '', '', '', false, 'pay_at_hotel', $3)", [h.token, randomUUID(), h.quote.total]);
    const arrivals = await peek<{ guest_name: string }>(desk(), "select guest_name from bookings where check_in = $1 and status in ('pending', 'confirmed')", [today]);
    expect(arrivals.map((a) => a.guest_name)).toContain("Karim Uddin");
    expect(await peek(hk(), "select 1 from bookings")).toEqual([]);
  });

  it("3. the receptionist creates a walk-in booking (confirmed, priced by the engine)", async () => {
    s.ref = (
      await run<{ r: string }>(
        desk(),
        "select public.admin_create_reservation('[{\"room_type\":\"deluxe-couple\"}]'::jsonb, $1, $2, 2, 0, null, 'Walk In Guest', null, '+8801911000222', 'Bangladesh', '', 'Walk-in', false, 'walk_in', 'confirmed', 'pay_at_hotel') as r",
        [today, plus(2)],
      )
    ).r;
    const b = await one<{ id: string; status: string; source: string; total_bdt: number; subtotal_bdt: number }>("select id, status, source, total_bdt, subtotal_bdt from bookings where reference = $1", [s.ref]);
    expect(b).toMatchObject({ status: "confirmed", source: "walk_in" });
    expect(b.total_bdt).toBeGreaterThan(b.subtotal_bdt); // VAT + service included
    s.bookingId = b.id;
    // Housekeeping can't create bookings.
    expect(await rejects(peek(hk(), "select public.admin_create_reservation('[{\"room_type\":\"deluxe-couple\"}]'::jsonb, $1, $2, 2, 0, null, 'X', null, '+8801911000333', '', '', '', false, 'walk_in', 'confirmed', 'pay_at_hotel')", [today, plus(1)]))).toMatch(/NOT_ALLOWED/);
  });

  it("4. check-in needs a room of the right type that's free and in service", async () => {
    expect(await rejects(run(desk(), "select public.admin_set_status($1, 'checked_in', null)", [s.bookingId]))).toMatch(/ASSIGN_ROOM/);
    const wrong = await one<{ id: string }>("select r.id from rooms r join room_types t on t.id = r.room_type_id where t.slug = 'standard-couple' limit 1");
    expect(await rejects(run(desk(), "select public.admin_assign_room($1, $2)", [s.bookingId, wrong.id]))).toMatch(/WRONG_ROOM_TYPE/);
    const rooms = (await db.query<{ id: string }>("select r.id from rooms r join room_types t on t.id = r.room_type_id where t.slug = 'deluxe-couple' order by r.number")).rows;
    await db.query("update rooms set out_of_service = true where id = $1", [rooms[0].id]);
    expect(await rejects(run(desk(), "select public.admin_assign_room($1, $2)", [s.bookingId, rooms[0].id]))).toMatch(/ROOM_OUT_OF_SERVICE/);
    await db.query("update rooms set out_of_service = false where id = $1", [rooms[0].id]);
    await run(desk(), "select public.admin_assign_room($1, $2)", [s.bookingId, rooms[1].id]);
    s.roomId = rooms[1].id;
    await run(desk(), "select public.admin_set_status($1, 'checked_in', null)", [s.bookingId]);
    expect((await one<{ status: string }>("select status from bookings where id = $1", [s.bookingId])).status).toBe("checked_in");
    // Another booking can't take the same room on the same nights.
    const ref2 = (await run<{ r: string }>(desk(), "select public.admin_create_reservation('[{\"room_type\":\"deluxe-couple\"}]'::jsonb, $1, $2, 2, 0, null, 'Second Guest', null, '+8801911000444', '', '', '', false, 'walk_in', 'confirmed', 'pay_at_hotel') as r", [today, plus(1)])).r;
    const b2 = await one<{ id: string }>("select id from bookings where reference = $1", [ref2]);
    expect(await rejects(run(desk(), "select public.admin_assign_room($1, $2)", [b2.id, s.roomId]))).toMatch(/ROOM_TAKEN/);
  });

  it("5. finance records a payment: ledger, receipt number, balance, guest receipt queued", async () => {
    const total = (await one<{ total_bdt: number }>("select total_bdt from bookings where id = $1", [s.bookingId])).total_bdt;
    await run(finance(), "select public.admin_record_payment($1, $2, 'card', 'Paid at desk')", [s.bookingId, total]);
    const p = await one<{ id: string; receipt_no: string; amount_bdt: number }>("select id, receipt_no, amount_bdt from payments where booking_id = $1", [s.bookingId]);
    s.paymentId = p.id;
    expect(p.receipt_no).toMatch(/^RCP-\d{4}-\d{6}$/);
    const b = await one<{ amount_paid_bdt: number; payment_status: string }>("select amount_paid_bdt, payment_status from bookings where id = $1", [s.bookingId]);
    expect(b).toEqual({ amount_paid_bdt: total, payment_status: "paid" });
    expect(await rejects(peek(hk(), "select public.admin_record_payment($1, 100, 'cash', '')", [s.bookingId]))).toMatch(/NOT_ALLOWED/);
    expect(await rejects(peek(finance(), "select public.admin_record_payment($1, 0, 'cash', '')", [s.bookingId]))).toMatch(/BAD_AMOUNT/);
  });

  it("6. housekeeping updates a room's status, but can't take it out of service", async () => {
    const other = await one<{ id: string }>("select r.id from rooms r where r.id <> $1 order by number limit 1", [s.roomId]);
    await run(hk(), "update rooms set housekeeping = 'inspected' where id = $1", [other.id]);
    expect((await one<{ housekeeping: string }>("select housekeeping from rooms where id = $1", [other.id])).housekeeping).toBe("inspected");
    expect(await rejects(run(hk(), "update rooms set out_of_service = true where id = $1", [other.id]))).toMatch(/NOT_ALLOWED/);
  });

  it("7. check-out: the room becomes dirty and a cleaning task appears", async () => {
    await run(desk(), "select public.admin_set_status($1, 'checked_out', null)", [s.bookingId]);
    expect((await one<{ housekeeping: string }>("select housekeeping from rooms where id = $1", [s.roomId])).housekeeping).toBe("dirty");
    const t = await one<{ n: number }>("select count(*)::int n from housekeeping_tasks where room_id = $1 and kind = 'clean' and status = 'open'", [s.roomId]);
    expect(t.n).toBe(1);
    // A checked-out booking can't be checked in again.
    expect(await rejects(run(desk(), "select public.admin_set_status($1, 'checked_in', null)", [s.bookingId]))).toMatch(/BAD_TRANSITION/);
  });

  it("7b. a second check-out from the same uncleaned room doesn't duplicate its cleaning task; marking it clean closes it", async () => {
    const ref = (await run<{ r: string }>(desk(), "select public.admin_create_reservation('[{\"room_type\":\"deluxe-couple\"}]'::jsonb, $1, $2, 2, 0, null, 'Back To Back', null, '+8801911000666', '', '', '', false, 'walk_in', 'confirmed', 'pay_at_hotel') as r", [today, plus(1)])).r;
    const bid = (await one<{ id: string }>("select id from bookings where reference = $1", [ref])).id;
    await run(desk(), "select public.admin_assign_room($1, $2)", [bid, s.roomId]);
    await run(desk(), "select public.admin_set_status($1, 'checked_in', null)", [bid]);
    await run(desk(), "select public.admin_set_status($1, 'checked_out', null)", [bid]);
    const open = await one<{ n: number }>("select count(*)::int n from housekeeping_tasks where room_id = $1 and kind = 'clean' and status = 'open'", [s.roomId]);
    expect(open.n).toBe(1);
    await run(hk(), "update rooms set housekeeping = 'clean' where id = $1", [s.roomId]);
    const left = await one<{ n: number; done: number }>(
      "select count(*) filter (where status in ('open','in_progress'))::int n, count(*) filter (where status = 'done')::int done from housekeeping_tasks where room_id = $1 and kind = 'clean'",
      [s.roomId],
    );
    expect(left).toEqual({ n: 0, done: 1 });
  });

  it("8. the manager's revenue figures add up (takings by method, invoice totals)", async () => {
    const rec = (await peek<{ r: { by_method: { method: string; received: number }[] } }>(manager(), "select public.admin_payment_reconciliation(current_date - 1, current_date + 1) as r"))[0].r;
    const total = (await one<{ total_bdt: number }>("select total_bdt from bookings where id = $1", [s.bookingId])).total_bdt;
    expect(rec.by_method.find((m) => m.method === "card")?.received).toBe(total);
    const inv = (await peek<{ i: { total: number; paid: number; balance: number } }>(manager(), "select public.admin_invoice($1) as i", [s.bookingId]))[0].i;
    expect(inv).toMatchObject({ total, paid: total, balance: 0 });
    // Revenue needs reports/payments access: housekeeping and the content editor are refused.
    for (const a of [hk(), editor()]) expect(await rejects(peek(a, "select public.admin_payment_reconciliation(current_date - 1, current_date)"))).toMatch(/NOT_ALLOWED/);
    expect(await peek(editor(), "select 1 from payments")).toEqual([]);
  });

  it("9. the content editor updates a room's wording and photo order, but not its price or occupancy", async () => {
    const t = await one<{ id: string; price_bdt: number; sleeps: number; gallery: string[] }>("select id, price_bdt, sleeps, gallery from room_types where slug = 'premium-twin'");
    await run(editor(), "select public.admin_update_room_copy($1, 'Two beds, garden light', 'A calm twin room.', array['Two single beds', ' ', 'Rain shower'], 'Garden')", [t.id]);
    const after = await one<{ blurb: string; features: string[]; view: string; price_bdt: number }>("select blurb, features, view, price_bdt from room_types where id = $1", [t.id]);
    expect(after).toMatchObject({ blurb: "Two beds, garden light", features: ["Two single beds", "Rain shower"], view: "Garden", price_bdt: t.price_bdt });
    const reversed = [...t.gallery].reverse();
    await run(editor(), "select public.admin_set_room_gallery($1, $2)", [t.id, reversed]);
    expect((await one<{ gallery: string[] }>("select gallery from room_types where id = $1", [t.id])).gallery).toEqual(reversed);
    // Foreign images, too many photos, prices and occupancy are refused.
    expect(await rejects(run(editor(), "select public.admin_set_room_gallery($1, array['https://evil.example/x.jpg'])", [t.id]))).toMatch(/BAD_PHOTO/);
    expect(await rejects(run(editor(), "select public.admin_set_room_gallery($1, $2)", [t.id, Array.from({ length: 13 }, (_, i) => `https://x.supabase.co/storage/v1/object/public/room-photos/${t.id}/${randomUUID()}.jpg`)]))).toMatch(/PHOTO_LIMIT/);
    await run(editor(), "update room_types set price_bdt = 1, sleeps = 9 where id = $1", [t.id]).catch(() => undefined);
    expect(await one("select price_bdt, sleeps from room_types where id = $1", [t.id])).toEqual({ price_bdt: t.price_bdt, sleeps: t.sleeps });
    expect(await rejects(peek(hk(), "select public.admin_update_room_copy($1, 'x', 'y', array[]::text[], '')", [t.id]))).toMatch(/NOT_ALLOWED/);
  });

  it("10. the owner's overview: bookings, payments and the audit trail of who did what", async () => {
    const counts = (await peek<{ bookings: number; paid: number }>(owner(), "select (select count(*)::int from bookings) bookings, (select coalesce(sum(amount_bdt), 0)::int from payments where status = 'confirmed') paid"))[0];
    expect(counts.bookings).toBeGreaterThanOrEqual(3);
    expect(counts.paid).toBeGreaterThan(0);
    const audit = await peek<{ table_name: string; actor_name: string }>(owner(), "select table_name, actor_name from public.admin_audit_log('payments', null, 10)");
    expect(audit.some((a) => a.actor_name === "Farah Finance")).toBe(true);
    expect(await rejects(peek(desk(), "select * from public.admin_audit_log(null, null, 10)"))).toMatch(/NOT_ALLOWED/);
    // Owner without the second factor is refused privileged reads.
    expect(await rejects(peek(user(id.owner, false), "select * from public.admin_audit_log(null, null, 10)"))).toMatch(/MFA_REQUIRED/);
  });
});

/* ===================================================== security & reliability */

describe("security and reliability", () => {
  it("unauthorised requests: visitors can't read or change private data or call staff functions", async () => {
    for (const t of ["bookings", "payments", "guests", "staff", "message_outbox", "booking_access_tokens", "payment_intents", "invoices"])
      expect(await rejects(peek(anon, `select * from public.${t} limit 1`)), t).toMatch(/permission denied/);
    expect(await rejects(peek(anon, "update room_types set price_bdt = 1"))).toMatch(/permission denied/);
    for (const fn of ["admin_set_status(gen_random_uuid(), 'cancelled', null)", "admin_record_payment(gen_random_uuid(), 1, 'cash', '')", "claim_messages(1)", "record_gateway_event('card','e',null,'r','succeeded',1,null,true,true)"])
      expect(await rejects(peek(anon, `select public.${fn}`)), fn).toMatch(/permission denied/);
    // A signed-in user who isn't staff gets nothing either.
    expect(await rejects(peek(user(randomUUID()), "select public.admin_set_status(gen_random_uuid(), 'cancelled', null)"))).toMatch(/NOT_STAFF/);
  });

  it("double submission: the same confirmation twice makes one booking", async () => {
    const h = (await run<{ h: { token: string; quote: { total: number } } }>(anon, "select public.create_hold($1, $2, 2, 0, '[{\"room_type\":\"honeymoon-couple\"}]'::jsonb, null) as h", [plus(50), plus(52)])).h;
    const key = randomUUID();
    const sql = "select public.confirm_hold($1, $2, 'Double Click', 'dc@example.com', '+8801711555666', '', '', '', false, 'pay_at_hotel', $3) as r";
    const a = await run<{ r: { reference: string } }>(anon, sql, [h.token, key, h.quote.total]);
    const b = await run<{ r: { reference: string; replayed: boolean } }>(anon, sql, [h.token, key, h.quote.total]);
    expect(b.r).toMatchObject({ reference: a.r.reference, replayed: true });
    expect((await one<{ n: number }>("select count(*)::int n from bookings where reference = $1", [a.r.reference])).n).toBe(1);
  });

  it("invalid prices: a tampered total is refused and nothing is booked", async () => {
    const h = (await run<{ h: { token: string; quote: { total: number } } }>(anon, "select public.create_hold($1, $2, 2, 0, '[{\"room_type\":\"premium-twin\"}]'::jsonb, null) as h", [plus(60), plus(61)])).h;
    const n0 = (await one<{ n: number }>("select count(*)::int n from bookings")).n;
    expect(await rejects(run(anon, "select public.confirm_hold($1, $2, 'Cheap Skate', 'c@example.com', '+8801711777888', '', '', '', false, 'pay_at_hotel', 1)", [h.token, randomUUID()]))).toMatch(/PRICE_CHANGED/);
    expect((await one<{ n: number }>("select count(*)::int n from bookings")).n).toBe(n0);
  });

  it("last room: once it's held, a second guest can't hold it", async () => {
    const free = (await peek<{ available: number }>(anon, "select available from public.search_availability($1, $2, 2, 0, null) where room_type = 'executive-family-suite'", [plus(70), plus(71)]))[0].available;
    expect(free).toBe(1);
    for (let i = 0; i < free; i++) await run(anon, "select public.create_hold($1, $2, 2, 0, '[{\"room_type\":\"executive-family-suite\"}]'::jsonb, null)", [plus(70), plus(71)]);
    expect(await rejects(run(anon, "select public.create_hold($1, $2, 2, 0, '[{\"room_type\":\"executive-family-suite\"}]'::jsonb, null)", [plus(70), plus(71)]))).toMatch(/SOLD_OUT/);
  });

  it("failed payments: a rejected transfer and a gateway amount mismatch never count as paid", async () => {
    const h = (await run<{ h: { token: string; quote: { total: number } } }>(anon, "select public.create_hold($1, $2, 2, 0, '[{\"room_type\":\"connecting-queen-suite\"}]'::jsonb, null) as h", [plus(80), plus(82)])).h;
    const r = (await run<{ r: { reference: string; manage_token: string } }>(anon, "select public.confirm_hold($1, $2, 'Pay Fail', 'pf@example.com', '+8801711999000', '', '', '', false, 'pay_at_hotel', $3) as r", [h.token, randomUUID(), h.quote.total])).r;
    const p = (await run<{ p: { id: string } }>(anon, "select public.guest_submit_payment($1, 'bank_transfer', 1000, 'EBL-FAIL-1', '') as p", [r.manage_token])).p;
    await run(desk(), "select public.admin_verify_payment($1, false, 'Not in statement')", [p.id]);
    await db.query("update hotel_settings set payment_methods = array_append(payment_methods, 'card')");
    const i = (await run<{ i: { intent_id: string } }>(service, "select public.create_payment_intent($1, 500, 'card', $2) as i", [r.reference, randomUUID()])).i;
    expect((await run<{ o: string }>(service, "select public.record_gateway_event('card', 'ev-x', $1, 'T1', 'succeeded', 499, null, true, true) as o", [i.intent_id])).o).toBe("mismatch");
    expect((await one<{ amount_paid_bdt: number }>("select amount_paid_bdt from bookings where reference = $1", [r.reference])).amount_paid_bdt).toBe(0);
    const failures = (await one<{ n: number }>("select count(*)::int n from message_outbox m join bookings b on b.id = m.booking_id where b.reference = $1 and m.template = 'payment_failure'", [r.reference])).n;
    expect(failures).toBe(2);
  });

  it("expired sessions: an old booking token and an expired hold are refused", async () => {
    const h = (await run<{ h: { token: string; quote: { total: number } } }>(anon, "select public.create_hold($1, $2, 2, 0, '[{\"room_type\":\"standard-couple\"}]'::jsonb, null) as h", [plus(90), plus(91)])).h;
    const r = (await run<{ r: { manage_token: string } }>(anon, "select public.confirm_hold($1, $2, 'Old Token', 'ot@example.com', '+8801711000999', '', '', '', false, 'pay_at_hotel', $3) as r", [h.token, randomUUID(), h.quote.total])).r;
    await db.query("update booking_access_tokens set expires_at = now() - interval '1 minute'");
    expect(await rejects(peek(anon, "select public.guest_booking($1)", [r.manage_token]))).toMatch(/ACCESS_EXPIRED/);
    expect(await rejects(peek(anon, "select public.guest_cancel($1, 'x')", [r.manage_token]))).toMatch(/ACCESS_EXPIRED/);
    expect(await rejects(peek(anon, "select public.guest_booking($1)", ["f".repeat(64)]))).toMatch(/ACCESS_EXPIRED/);
  });

  it("upload restrictions: buckets limit type and size; only permitted staff may write room photos", async () => {
    const b = (await db.query<{ id: string; public: boolean; file_size_limit: number; allowed_mime_types: string[] }>("select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id")).rows;
    const room = b.find((x) => x.id === "room-photos")!;
    expect(room.allowed_mime_types.sort()).toEqual(expect.arrayContaining(["image/jpeg", "image/png", "image/webp"]));
    expect(room.allowed_mime_types).not.toContain("image/svg+xml");
    expect(room.file_size_limit).toBeLessThanOrEqual(10 * 1024 * 1024);
    expect(b.find((x) => x.id === "guest-documents")!.public).toBe(false);
    const insert = "insert into storage.objects (bucket_id, name) values ('room-photos', $1)";
    expect(await rejects(peek(anon, insert, [`x/${randomUUID()}.jpg`]))).toMatch(/row-level security|permission denied/);
    expect(await rejects(peek(hk(), insert, [`x/${randomUUID()}.jpg`]))).toMatch(/row-level security|permission denied/);
    await peek(editor(), insert, [`x/${randomUUID()}.jpg`]); // content editors may upload room photos
  });

  it("database integrity: ledger totals, no double-booked rooms, every booking has its lines", async () => {
    const bad = await one<{ ledger: number; overlap: number; nolines: number; negative: number }>(`
      select
        (select count(*)::int from bookings b where b.amount_paid_bdt <> greatest(0,
           coalesce((select sum(amount_bdt) from payments where booking_id = b.id and status = 'confirmed'), 0)
         - coalesce((select sum(amount_bdt) from refunds where booking_id = b.id and status = 'completed'), 0))) ledger,
        (select count(*)::int from booking_rooms a join booking_rooms c on a.room_id = c.room_id and a.id < c.id
           and a.active and c.active and a.check_in < c.check_out and c.check_in < a.check_out) overlap,
        (select count(*)::int from bookings b where not exists (select 1 from booking_rooms where booking_id = b.id)) nolines,
        (select count(*)::int from bookings where total_bdt < 0 or amount_paid_bdt < 0) negative`);
    expect(bad).toEqual({ ledger: 0, overlap: 0, nolines: 0, negative: 0 });
  });
});
