// Booking engine: pricing, holds, idempotent confirmation, inventory and
// double-booking protection, modifications, cancellations, expiry, payment
// callbacks and status transitions — against a real PostgreSQL with every
// migration applied (tests/db/harness.ts).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { as, createDevDatabase, rejects, type Db } from "./harness";

let db: Db;
let SUN = ""; // a Sunday ~2 months ahead: Sun–Wed weekday nights, Thu+Fri weekend
const day = (n: number) => {
  const d = new Date(`${SUN}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const desk = randomUUID();
const manager = randomUUID();
const anon = { kind: "anon" } as const;
const staff = (id: string, aal: "aal1" | "aal2" = "aal1") => ({ kind: "user", id, aal }) as const;
const service = { kind: "service" } as const;

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query<T>(sql, params)).rows[0];
}
const lines = (...types: string[]) => JSON.stringify(types.map((t) => ({ room_type: t })));

/** Hold + confirm as the website does, committed. Returns the confirm result. */
async function book(opts: { types?: string[]; inN?: number; outN?: number; adults?: number; children?: number; email?: string; key?: string; promo?: string; option?: string } = {}) {
  const types = opts.types ?? ["deluxe-couple"];
  const hold = (
    await db.query<{ h: { token: string; quote: { total: number } } }>(
      "select public.create_hold($1, $2, $3, $4, $5::jsonb, $6) as h",
      [day(opts.inN ?? 0), day(opts.outN ?? 2), opts.adults ?? 2, opts.children ?? 0, lines(...types), opts.promo ?? null],
    )
  ).rows[0].h;
  const email = opts.email ?? `g${randomUUID().slice(0, 8)}@example.com`;
  const res = (
    await db.query<{ r: { reference: string; manage_token: string; total: number; replayed: boolean } }>(
      "select public.confirm_hold($1, $2, 'Test Guest', $3, $4, 'Bangladesh', '', '', false, $5, $6) as r",
      [hold.token, opts.key ?? randomUUID(), email, `+880 17${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}`, opts.option ?? "pay_at_hotel", hold.quote.total],
    )
  ).rows[0].r;
  return { ...res, hold };
}

const free = async (slug: string, inN: number, outN: number) =>
  (await one<{ available: number }>("select available from room_availability($1, $2) where slug = $3", [day(inN), day(outN), slug])).available;

beforeAll(async () => {
  db = await createDevDatabase();
  SUN = (await one<{ d: string }>("select to_char(public._today() + 60 + ((7 - extract(dow from public._today() + 60)::int) % 7), 'YYYY-MM-DD') as d")).d;
  await db.query("insert into auth.users (id, email) values ($1, 'desk@x.test'), ($2, 'mgr@x.test')", [desk, manager]);
  await db.query("insert into staff (user_id, full_name, role) values ($1, 'Desk', 'receptionist'), ($2, 'Mgr', 'manager')", [desk, manager]);
  // Two Standard Couple rooms for exact-count tests (the seed has none).
  await db.query("insert into rooms (number, room_type_id, floor) select n, id, '4th' from (values ('401'), ('402')) v(n), room_types where slug = 'standard-couple'");
}, 60_000);

afterAll(async () => db?.close());

// Each test starts from a clean booking state.
beforeEach(async () => {
  await db.exec(`
    delete from payments; delete from payment_intents; delete from refunds; delete from booking_requests;
    delete from booking_access_tokens; delete from housekeeping_tasks; delete from booking_events;
    delete from bookings; delete from booking_holds; delete from booking_lookup_attempts;
    delete from seasonal_rates; delete from promotions; delete from room_blocks;
    update rooms set out_of_service = false, housekeeping = 'clean';
    update hotel_settings set vat_percent = null, service_charge_percent = null, advance_percent = null;`);
});

/* ------------------------------------------------------------ pricing */

describe("pricing (server only)", () => {
  it("prices night by night: weekday and Thursday/Friday weekend rates", async () => {
    // Standard Couple: ৳2,500 weekday, ৳3,500 weekend. Sun→Sun = 5 weekday + 2 weekend nights.
    const r = await one<{ total: number; quote: { lines: { nights: { kind: string }[] }[] } }>(
      "select total, quote from search_availability($1, $2, 2, 0) where room_type = 'standard-couple'", [day(0), day(7)]);
    expect(r.total).toBe(5 * 2500 + 2 * 3500);
    expect(r.quote.lines[0].nights.map((n) => n.kind)).toEqual(["weekday", "weekday", "weekday", "weekday", "weekend", "weekend", "weekday"]);
  });

  it("seasonal rates override base prices for the nights they cover", async () => {
    await db.query("insert into seasonal_rates (room_type_id, name, starts_on, ends_on, price_bdt, weekend_price_bdt) select id, 'Eid', $1, $2, 9000, 9500 from room_types where slug = 'standard-couple'", [day(1), day(3)]);
    const r = await one<{ total: number }>("select total from search_availability($1, $2, 2, 0) where room_type = 'standard-couple'", [day(0), day(4)]);
    expect(r.total).toBe(2500 + 9000 + 9000 + 2500);
  });

  it("adds service charge then VAT, and works out the advance", async () => {
    await db.query("update hotel_settings set service_charge_percent = 10, vat_percent = 15, advance_percent = 30");
    const q = (await one<{ quote: { subtotal: number; service_charge: number; vat: number; total: number; advance_due: number; taxes_pending: boolean } }>(
      "select quote from search_availability($1, $2, 2, 0) where room_type = 'standard-couple'", [day(0), day(2)])).quote;
    expect(q).toMatchObject({ subtotal: 5000, service_charge: 500, vat: 825, total: 6325, advance_due: 1898, taxes_pending: false });
  });

  it("validates promo codes: percent, wrong code, wrong dates, too few nights, exhausted", async () => {
    await db.query(`insert into promotions (code, name, discount_type, discount_value, starts_on, ends_on, min_nights, is_active, max_redemptions)
                    values ('SEA10', 'Sea 10', 'percent', 10, $1, $2, 2, true, 1)`, [day(0), day(20)]);
    const h = (await one<{ h: { quote: { discount: number; total: number } } }>(
      "select public.create_hold($1, $2, 2, 0, $3::jsonb, 'sea10') as h", [day(0), day(2), lines("standard-couple")])).h;
    expect(h.quote.discount).toBe(500);
    expect(h.quote.total).toBe(4500);
    expect(await rejects(db.query("select public.create_hold($1, $2, 2, 0, $3::jsonb, 'NOPE')", [day(0), day(2), lines("standard-couple")]))).toMatch(/PROMO_INVALID/);
    expect(await rejects(db.query("select public.create_hold($1, $2, 2, 0, $3::jsonb, 'SEA10')", [day(25), day(27), lines("standard-couple")]))).toMatch(/PROMO_NOT_APPLICABLE/);
    expect(await rejects(db.query("select public.create_hold($1, $2, 2, 0, $3::jsonb, 'SEA10')", [day(0), day(1), lines("standard-couple")]))).toMatch(/PROMO_NOT_APPLICABLE/);
    await book({ types: ["deluxe-couple"], promo: "SEA10" }); // uses the single redemption
    expect(await rejects(db.query("select public.create_hold($1, $2, 2, 0, $3::jsonb, 'SEA10')", [day(4), day(6), lines("standard-couple")]))).toMatch(/PROMO_EXHAUSTED/);
  });

  it("never trusts a client total: a changed price stops the confirmation", async () => {
    const h = (await one<{ h: { token: string; quote: { total: number } } }>(
      "select public.create_hold($1, $2, 2, 0, $3::jsonb) as h", [day(0), day(2), lines("standard-couple")])).h;
    await db.query("update room_types set price_bdt = 2600 where slug = 'standard-couple'");
    try {
      expect(await rejects(db.query("select public.confirm_hold($1, $2, 'Guest', 'g@example.com', '+8801711000000', '', '', '', false, 'pay_at_hotel', $3)",
        [h.token, randomUUID(), h.quote.total]))).toMatch(/PRICE_CHANGED/);
      expect((await one<{ n: number }>("select count(*)::int n from bookings")).n).toBe(0);
    } finally {
      await db.query("update room_types set price_bdt = 2500 where slug = 'standard-couple'");
    }
  });
});

/* ---------------------------------------------------- inventory & holds */

describe("inventory, holds and double-booking protection", () => {
  it("a hold takes rooms out of sale; the last room can't be held twice", async () => {
    expect(await free("standard-couple", 0, 2)).toBe(2);
    await db.query("select public.create_hold($1, $2, 2, 0, $3::jsonb)", [day(0), day(2), lines("standard-couple", "standard-couple")]);
    expect(await free("standard-couple", 0, 2)).toBe(0);
    expect(await rejects(db.query("select public.create_hold($1, $2, 2, 0, $3::jsonb)", [day(1), day(3), lines("standard-couple")]))).toMatch(/SOLD_OUT/);
  });

  it("expired or released holds stop counting at once", async () => {
    const h = (await one<{ h: { token: string } }>("select public.create_hold($1, $2, 2, 0, $3::jsonb) as h", [day(0), day(2), lines("standard-couple", "standard-couple")])).h;
    await db.query("update booking_holds set expires_at = now() - interval '1 second'");
    expect(await free("standard-couple", 0, 2)).toBe(2);
    expect((await one<{ n: number }>("select public.expire_holds() as n")).n).toBe(1);
    const h2 = (await one<{ h: { token: string } }>("select public.create_hold($1, $2, 2, 0, $3::jsonb) as h", [day(0), day(2), lines("standard-couple")])).h;
    await db.query("select public.release_hold($1)", [h2.token]);
    expect(await free("standard-couple", 0, 2)).toBe(2);
    expect(h.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("counts availability night by night (back-to-back stays don't block a longer one)", async () => {
    await book({ types: ["standard-couple"], inN: 0, outN: 2 });
    await book({ types: ["standard-couple"], inN: 2, outN: 4 }); // check-out day = next check-in: allowed
    expect(await free("standard-couple", 0, 4)).toBe(1);
  });

  it("concurrent-style race: many requests for the last room, exactly one wins", async () => {
    // Inside one database the engine serialises on the room-type lock; the
    // staging test (scripts/concurrency-check.mts) fires truly parallel requests.
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => db.query("select public.create_hold($1, $2, 2, 0, $3::jsonb)", [day(0), day(1), lines("standard-couple", "standard-couple")])),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected").every((r) => String((r as PromiseRejectedResult).reason).includes("SOLD_OUT"))).toBe(true);
  });

  it("a physical room can't be given to two overlapping stays", async () => {
    const a = await book({ types: ["standard-couple"] });
    const b = await book({ types: ["standard-couple"] });
    const room = (await one<{ id: string }>("select id from rooms where number = '401'")).id;
    const ida = (await one<{ id: string }>("select id from bookings where reference = $1", [a.reference])).id;
    const idb = (await one<{ id: string }>("select id from bookings where reference = $1", [b.reference])).id;
    await as(db, staff(desk), async (q) => {
      await q("select public.admin_assign_room($1, $2)", [ida, room]);
      expect(await rejects(q("select public.admin_assign_room($1, $2)", [idb, room]))).toMatch(/ROOM_TAKEN/);
    });
    // Even bypassing the functions, the table constraint refuses it.
    await db.query("update bookings set room_id = $2 where id = $1", [ida, room]);
    expect(await rejects(db.query("update booking_rooms set room_id = $1 where booking_id = $2", [room, idb]))).toMatch(/booking_rooms_no_overlap|exclusion/);
  });

  it("maintenance blocks reduce inventory and refuse to strand sold rooms", async () => {
    const room = (await one<{ id: string }>("select id from rooms where number = '401'")).id;
    await as(db, staff(manager, "aal2"), async (q) => {
      await q("select public.admin_block_room($1, $2, $3, 'Painting')", [room, day(10), day(12)]);
    });
    await db.query("insert into room_blocks (room_id, starts_on, ends_on, reason) values ($1, $2, $3, 'Painting')", [room, day(10), day(12)]);
    expect(await free("standard-couple", 10, 12)).toBe(1);
    await book({ types: ["standard-couple"], inN: 10, outN: 12 }); // last sellable room
    expect(await rejects(db.query("select public.create_hold($1, $2, 2, 0, $3::jsonb)", [day(10), day(11), lines("standard-couple")]))).toMatch(/SOLD_OUT/);
    const other = (await one<{ id: string }>("select id from rooms where number = '402'")).id;
    await as(db, staff(manager, "aal2"), async (q) => {
      expect(await rejects(q("select public.admin_block_room($1, $2, $3, 'Leak')", [other, day(10), day(11)]))).toMatch(/ROOM_NEEDED/);
      expect(await rejects(q("update rooms set out_of_service = true where id = $1", [other]))).toMatch(/ROOM_NEEDED/);
    });
  });

  it("assigned rooms can't be taken out of service, and blocked rooms can't be assigned", async () => {
    const a = await book({ types: ["standard-couple"], inN: 5, outN: 7 });
    const ida = (await one<{ id: string }>("select id from bookings where reference = $1", [a.reference])).id;
    const r401 = (await one<{ id: string }>("select id from rooms where number = '401'")).id;
    const r402 = (await one<{ id: string }>("select id from rooms where number = '402'")).id;
    await db.query("insert into room_blocks (room_id, starts_on, ends_on, reason) values ($1, $2, $3, 'Repair')", [r402, day(5), day(6)]);
    await as(db, staff(manager, "aal2"), async (q) => {
      expect(await rejects(q("select public.admin_assign_room($1, $2)", [ida, r402]))).toMatch(/ROOM_BLOCKED/);
      await q("select public.admin_assign_room($1, $2)", [ida, r401]);
      expect(await rejects(q("update rooms set out_of_service = true where id = $1", [r401]))).toMatch(/ROOM_IN_USE/);
    });
  });
});

/* -------------------------------------------- confirmation & idempotency */

describe("confirmation", () => {
  it("is idempotent: retrying with the same key returns the same booking", async () => {
    const key = randomUUID();
    const h = (await one<{ h: { token: string; quote: { total: number } } }>("select public.create_hold($1, $2, 2, 0, $3::jsonb) as h", [day(0), day(2), lines("deluxe-couple")])).h;
    const args = [h.token, key, "Retry Guest", "retry@example.com", "+8801711999999", "", "", "", false, "pay_at_hotel", h.quote.total];
    const sql = "select public.confirm_hold($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) as r";
    const first = (await one<{ r: { reference: string; replayed: boolean } }>(sql, args)).r;
    const again = (await one<{ r: { reference: string; replayed: boolean } }>(sql, args)).r;
    expect(again.reference).toBe(first.reference);
    expect(again.replayed).toBe(true);
    expect((await one<{ n: number }>("select count(*)::int n from bookings")).n).toBe(1);
    // A key already used for another hold is refused.
    const h2 = (await one<{ h: { token: string } }>("select public.create_hold($1, $2, 2, 0, $3::jsonb) as h", [day(3), day(5), lines("deluxe-couple")])).h;
    expect(await rejects(db.query(sql, [h2.token, ...args.slice(1)]))).toMatch(/IDEMPOTENCY_CONFLICT/);
  });

  it("an expired hold still converts if its rooms are free, not if someone took them", async () => {
    const h = (await one<{ h: { token: string; quote: { total: number } } }>("select public.create_hold($1, $2, 2, 0, $3::jsonb) as h", [day(0), day(2), lines("standard-couple", "standard-couple")])).h;
    await db.query("update booking_holds set expires_at = now() - interval '1 minute'");
    const sql = "select public.confirm_hold($1, $2, 'Late Guest', 'late@example.com', '+8801711888888', '', '', '', false, 'pay_at_hotel', $3) as r";
    const ok = (await one<{ r: { reference: string } }>(sql, [h.token, randomUUID(), h.quote.total])).r;
    expect(ok.reference).toMatch(/^BSQ-\d{5}$/);

    await db.query("delete from bookings");
    const h2 = (await one<{ h: { token: string; quote: { total: number } } }>("select public.create_hold($1, $2, 2, 0, $3::jsonb) as h", [day(0), day(2), lines("standard-couple")])).h;
    await db.query("update booking_holds set expires_at = now() - interval '1 minute' where status = 'active'");
    await book({ types: ["standard-couple", "standard-couple"] }); // someone else takes both rooms
    expect(await rejects(db.query(sql, [h2.token, randomUUID(), h2.quote.total]))).toMatch(/HOLD_EXPIRED/);
  });

  it("books several room types in one reservation, with capacity checked", async () => {
    const r = await book({ types: ["connecting-king-suite", "deluxe-couple"], adults: 6, children: 1 });
    const b = await one<{ rooms: number; total_bdt: number }>("select rooms, total_bdt from bookings where reference = $1", [r.reference]);
    expect(b.rooms).toBe(2);
    expect((await one<{ n: number }>("select count(*)::int n from booking_rooms br join bookings b on b.id = br.booking_id where reference = $1", [r.reference])).n).toBe(2);
    expect(b.total_bdt).toBe(r.total);
    expect(await rejects(db.query("select public.create_hold($1, $2, 7, 0, $3::jsonb)", [day(0), day(2), lines("connecting-king-suite", "deluxe-couple")]))).toMatch(/TOO_MANY_GUESTS/);
  });

  it("validates dates: past, zero nights, over 30 nights, more than a year ahead", async () => {
    const h = (from: string, to: string) => db.query("select public.create_hold($1::date, $2::date, 2, 0, $3::jsonb)", [from, to, lines("deluxe-couple")]);
    expect(await rejects(h("2000-01-01", "2000-01-03"))).toMatch(/PAST_DATE/);
    expect(await rejects(h(day(0), day(0)))).toMatch(/BAD_DATES/);
    expect(await rejects(h(day(0), day(31)))).toMatch(/BAD_DATES/);
    const far = await one<{ a: string; b: string }>("select (public._today() + 400)::text a, (public._today() + 402)::text b");
    expect(await rejects(h(far.a, far.b))).toMatch(/TOO_FAR/);
  });

  it("the website can't send a price, a room id or an unpublished room", async () => {
    await db.query("update room_types set is_published = false where slug = 'premium-twin'");
    try {
      expect(await rejects(db.query("select public.create_hold($1, $2, 2, 0, '[{\"room_type\":\"premium-twin\"}]'::jsonb)", [day(0), day(2)]))).toMatch(/NO_ROOM/);
      // Extra fields (price, room id) are simply ignored; the server prices it.
      const h = (await one<{ h: { quote: { total: number } } }>(
        "select public.create_hold($1, $2, 2, 0, '[{\"room_type\":\"standard-couple\",\"price\":1,\"room_id\":\"x\"}]'::jsonb) as h", [day(0), day(2)])).h;
      expect(h.quote.total).toBe(5000);
    } finally {
      await db.query("update room_types set is_published = true where slug = 'premium-twin'");
    }
  });
});

/* ------------------------------------------------ modification & staff */

describe("modifications and the front desk", () => {
  it("date changes re-check availability and re-price; the room stays assigned", async () => {
    const r = await book({ types: ["standard-couple"], inN: 0, outN: 2 });
    const id = (await one<{ id: string }>("select id from bookings where reference = $1", [r.reference])).id;
    const room = (await one<{ id: string }>("select id from rooms where number = '401'")).id;
    await as(db, staff(desk), async (q) => {
      await q("select public.admin_assign_room($1, $2)", [id, room]);
      await q("select public.admin_modify_booking($1, 'standard-couple', $2, $3, 1, 2, 0)", [id, day(3), day(6)]); // Wed, Thu, Fri
      const b = (await q<{ total_bdt: number; room_id: string }>("select total_bdt, room_id from bookings where id = $1", [id])).rows[0];
      expect(b.total_bdt).toBe(2500 + 3500 + 3500);
      expect(b.room_id).toBe(room);
    });
  });

  it("a change into sold-out dates is refused and nothing changes", async () => {
    const a = await book({ types: ["standard-couple"], inN: 0, outN: 2 });
    await book({ types: ["standard-couple", "standard-couple"], inN: 5, outN: 7 });
    const id = (await one<{ id: string }>("select id from bookings where reference = $1", [a.reference])).id;
    await as(db, staff(desk), async (q) => {
      expect(await rejects(q("select public.admin_modify_booking($1, 'standard-couple', $2, $3, 1, 2, 0)", [id, day(5), day(6)]))).toMatch(/SOLD_OUT/);
    });
    expect((await one<{ check_in: string }>("select check_in::text from bookings where id = $1", [id])).check_in).toBe(day(0));
  });

  it("phone bookings use the same inventory and prices", async () => {
    await book({ types: ["standard-couple", "standard-couple"], inN: 0, outN: 2 });
    await as(db, staff(desk), async (q) => {
      expect(await rejects(q("select public.admin_create_booking('standard-couple', $1, $2, 1, 2, 0, 'Walk In', null, '+8801711000111', '', '', '', false, 'walk_in', 'confirmed')", [day(1), day(2)]))).toMatch(/SOLD_OUT/);
      const ref = (await q<{ r: string }>("select public.admin_create_booking('deluxe-couple', $1, $2, 1, 2, 0, 'Walk In', null, '+8801711000111', '', '', '', false, 'walk_in', 'confirmed') as r", [day(0), day(2)])).rows[0].r;
      const b = (await q<{ total_bdt: number; status: string }>("select total_bdt, status from bookings where reference = $1", [ref])).rows[0];
      expect(b).toEqual({ total_bdt: 7000, status: "confirmed" });
    });
  });

  it("check-in needs every room assigned; check-out marks rooms for cleaning", async () => {
    const ref = (await one<{ r: string }>(
      "select public._insert_booking('standard-couple', public._today(), public._today() + 1, 2, 2, 0, 'Today Guest', null, '+8801711000222', '', null, '', false, 'walk_in', 'confirmed', null) as r")).r;
    const id = (await one<{ id: string }>("select id from bookings where reference = $1", [ref])).id;
    await as(db, staff(desk), async (q) => {
      expect(await rejects(q("select public.admin_set_status($1, 'checked_in')", [id]))).toMatch(/ASSIGN_ROOM/);
      expect((await q<{ n: number }>("select public.admin_auto_assign($1) as n", [id])).rows[0].n).toBe(2);
      await q("select public.admin_set_status($1, 'checked_in')", [id]);
      await q("select public.admin_set_status($1, 'checked_out')", [id]);
      const dirty = (await q<{ n: number }>("select count(*)::int n from rooms where housekeeping = 'dirty'")).rows[0].n;
      expect(dirty).toBe(2);
      expect((await q<{ n: number }>("select count(*)::int n from housekeeping_tasks where booking_id = $1", [id])).rows[0].n).toBe(2);
    });
  });

  it("no-show and illegal transitions", async () => {
    const ref = (await one<{ r: string }>(
      "select public._insert_booking('deluxe-couple', public._today(), public._today() + 1, 1, 2, 0, 'No Show', null, '+8801711000333', '', null, '', false, 'phone', 'confirmed', null) as r")).r;
    const id = (await one<{ id: string }>("select id from bookings where reference = $1", [ref])).id;
    await as(db, staff(desk), async (q) => {
      expect(await rejects(q("select public.admin_set_status($1, 'checked_out')", [id]))).toMatch(/BAD_TRANSITION/);
      await q("select public.admin_set_status($1, 'no_show')", [id]);
      expect(await rejects(q("select public.admin_set_status($1, 'confirmed')", [id]))).toMatch(/BAD_TRANSITION/);
    });
  });
});

/* -------------------------------------------- guest access & cancellation */

describe("guest access", () => {
  it("needs reference + matching contact, gives a short-lived token, masks contact details", async () => {
    const r = await book({ types: ["deluxe-couple"], email: "private.guest@example.com" });
    expect(await as(db, anon, async (q) => (await q<{ t: unknown }>("select public.verify_booking_access($1, 'someone@example.com') as t", [r.reference])).rows[0].t)).toBeNull();
    const t = await as(db, anon, async (q) => (await q<{ t: { token: string } }>("select public.verify_booking_access($1, 'PRIVATE.guest@example.com') as t", [r.reference])).rows[0].t);
    // Commit the token for the next calls (as() rolls back), then read as anon.
    await db.query("select public.verify_booking_access($1, 'private.guest@example.com')", [r.reference]).then(() => undefined);
    const token = (await one<{ t: { token: string } }>("select public.verify_booking_access($1, 'private.guest@example.com') as t", [r.reference])).t.token;
    const view = await as(db, anon, async (q) => (await q<{ v: { email: string; phone: string; reference: string } }>("select public.guest_booking($1) as v", [token])).rows[0].v);
    expect(view.reference).toBe(r.reference);
    expect(view.email).toBe("p•••@example.com");
    expect(view.phone).toMatch(/^•••• \d{3}$/);
    expect(t.token).toMatch(/^[0-9a-f]{64}$/);
    await db.query("update booking_access_tokens set expires_at = now() - interval '1 second'");
    expect(await rejects(as(db, anon, (q) => q("select public.guest_booking($1)", [token])))).toMatch(/ACCESS_EXPIRED/);
  });

  it("brute force on one reference is throttled", async () => {
    const r = await book({ types: ["deluxe-couple"] });
    for (let i = 0; i < 8; i++) expect((await one<{ t: unknown }>("select public.verify_booking_access($1, $2) as t", [r.reference, `x${i}@example.com`])).t).toBeNull();
    expect(await rejects(db.query("select public.verify_booking_access($1, 'y@example.com')", [r.reference]))).toMatch(/RATE_LIMITED/);
  });

  it("unpaid pending bookings cancel at once and free the room; others become requests", async () => {
    const a = await book({ types: ["standard-couple", "standard-couple"] });
    expect(await free("standard-couple", 0, 2)).toBe(0);
    expect((await one<{ s: string }>("select public.guest_cancel($1, 'Plans changed') as s", [a.manage_token])).s).toBe("cancelled");
    expect(await free("standard-couple", 0, 2)).toBe(2);

    const b = await book({ types: ["deluxe-couple"] });
    const id = (await one<{ id: string }>("select id from bookings where reference = $1", [b.reference])).id;
    await as(db, staff(desk), (q) => q("select public.admin_set_status($1, 'confirmed')", [id]));
    await db.query("select public._transition($1, 'confirmed', null)", [id]);
    expect((await one<{ s: string }>("select public.guest_cancel($1, 'Please cancel') as s", [b.manage_token])).s).toBe("requested");
    expect((await one<{ n: number }>("select count(*)::int n from booking_requests where booking_id = $1 and kind = 'cancel'", [id])).n).toBe(1);
    const change = (await one<{ r: { available: boolean } }>("select public.guest_request_change($1, $2, $3, 'Later please') as r", [b.manage_token, day(8), day(10)])).r;
    expect(change.available).toBe(true);
  });
});

/* -------------------------------------------- expiry & payment callbacks */

describe("expiry and payments", () => {
  it("advance bookings unpaid by the deadline are cancelled; paid ones are not", async () => {
    await db.query("update hotel_settings set advance_percent = 30");
    const unpaid = await book({ types: ["deluxe-couple"], option: "advance" });
    const paid = await book({ types: ["deluxe-couple"], option: "advance" });
    const pid = (await one<{ id: string }>("select id from bookings where reference = $1", [paid.reference])).id;
    await db.query("insert into payments (booking_id, amount_bdt, method) values ($1, 2100, 'bkash')", [pid]);
    await db.query("update bookings set payment_due_at = now() - interval '1 minute' where payment_option = 'advance'");
    expect((await one<{ n: number }>("select public.expire_overdue_bookings() as n")).n).toBe(1);
    expect((await one<{ s: string }>("select status as s from bookings where reference = $1", [unpaid.reference])).s).toBe("cancelled");
    expect((await one<{ s: string }>("select status as s from bookings where reference = $1", [paid.reference])).s).toBe("pending");
  });

  it("payment callbacks apply once, reject wrong amounts, and only the server may call them", async () => {
    const r = await book({ types: ["deluxe-couple"] });
    expect(await rejects(as(db, anon, (q) => q("select public.create_payment_intent($1, 1000, 'testpay', 'intent-key-1')", [r.reference])))).toMatch(/permission denied/);
    const intent = await as(db, service, async (q) => (await q<{ i: { intent_id: string } }>("select public.create_payment_intent($1, 1000, 'testpay', 'intent-key-1') as i", [r.reference])).rows[0].i);
    // as() rolls back, so create it for real:
    const i = (await one<{ i: { intent_id: string } }>("select public.create_payment_intent($1, 1000, 'testpay', 'intent-key-2') as i", [r.reference])).i;
    expect(intent.intent_id).toBeTruthy();
    const cb = (status: string, amount: number, ref = "PSP-1") => one<{ r: string }>("select public.apply_payment_callback('testpay', $1, $2, $3, $4) as r", [i.intent_id, ref, status, amount]);
    expect((await cb("succeeded", 1000)).r).toBe("applied");
    expect((await cb("succeeded", 1000)).r).toBe("duplicate");
    expect((await cb("failed", 1000)).r).toBe("ignored");
    expect((await one<{ paid: number }>("select amount_paid_bdt paid from bookings where reference = $1", [r.reference])).paid).toBe(1000);

    const j = (await one<{ i: { intent_id: string } }>("select public.create_payment_intent($1, 500, 'testpay', 'intent-key-3') as i", [r.reference])).i;
    expect((await one<{ r: string }>("select public.apply_payment_callback('testpay', $1, 'PSP-2', 'succeeded', 499) as r", [j.intent_id])).r).toBe("mismatch");
    const k = (await one<{ i: { intent_id: string } }>("select public.create_payment_intent($1, 500, 'testpay', 'intent-key-4') as i", [r.reference])).i;
    expect((await one<{ r: string }>("select public.apply_payment_callback('testpay', $1, 'PSP-3', 'failed', 500) as r", [k.intent_id])).r).toBe("applied");
    expect((await one<{ paid: number }>("select amount_paid_bdt paid from bookings where reference = $1", [r.reference])).paid).toBe(1000);
    // Same idempotency key → the same intent.
    expect((await one<{ i: { intent_id: string; replayed: boolean } }>("select public.create_payment_intent($1, 1000, 'testpay', 'intent-key-2') as i", [r.reference])).i)
      .toMatchObject({ intent_id: i.intent_id, replayed: true });
  });

  it("anonymous visitors can't touch holds, tokens or intents directly", async () => {
    for (const t of ["booking_holds", "booking_hold_rooms", "booking_access_tokens", "payment_intents", "booking_requests"])
      expect(await rejects(as(db, anon, (q) => q(`select * from public.${t}`))), t).toMatch(/permission denied/);
    expect(await rejects(as(db, anon, (q) => q("select public.expire_holds()")))).toMatch(/permission denied/);
    expect(await rejects(as(db, anon, (q) => q("select public._quote(array[]::uuid[], array[]::uuid[], current_date, current_date + 1, null, false)")))).toMatch(/permission denied/);
  });
});
