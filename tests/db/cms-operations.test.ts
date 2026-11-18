// Content management and daily operations: draft/publish, media library,
// room setup, housekeeping, promotions with stacking rules, and the staff
// rules that stop anyone raising their own access — against a real
// PostgreSQL with every migration applied (tests/db/harness.ts).
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

const id = { owner: randomUUID(), manager: randomUUID(), desk: randomUUID(), editor: randomUUID(), hk: randomUUID(), hk2: randomUUID() };
const anon = { kind: "anon" } as const;
const user = (uid: string, mfa = false) => ({ kind: "user", id: uid, aal: mfa ? "aal2" : "aal1" }) as const;
const mgr = () => user(id.manager, true);

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query<T>(sql, params)).rows[0];
}
const lines = (...types: string[]) => JSON.stringify(types.map((t) => ({ room_type: t })));
const typeId = async (slug: string) => (await one<{ id: string }>("select id from room_types where slug = $1", [slug])).id;

type Quote = { subtotal: number; discount: number; total: number; code_status: string | null; promotions: { code: string | null; name: string; discount: number }[] };
const quote = async (inN: number, outN: number, types: string[], promo: string | null = null) =>
  (await one<{ h: { token: string; quote: Quote } }>("select public.create_hold($1, $2, 2, 0, $3::jsonb, $4) as h", [day(inN), day(outN), lines(...types), promo])).h;

/** An offer row, inserted directly (the admin function is tested separately). */
async function offer(o: Record<string, unknown>) {
  const row = {
    code: null, name: "Offer", discount_type: "percent", discount_value: 10, starts_on: day(-30), ends_on: day(60),
    min_nights: 1, room_type_ids: "{}", is_active: true, stackable: false, max_redemptions: null, max_discount_bdt: null,
    bookable_from: null, bookable_until: null, ...o,
  } as Record<string, unknown>;
  row.auto_apply = row.code === null;
  const cols = Object.keys(row);
  return (await one<{ id: string }>(
    `insert into promotions (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    Object.values(row),
  )).id;
}

beforeAll(async () => {
  db = await createDevDatabase();
  SUN = (await one<{ d: string }>("select to_char(public._today() + 60 + ((7 - extract(dow from public._today() + 60)::int) % 7), 'YYYY-MM-DD') as d")).d;
  const people: [string, string, string][] = [
    [id.owner, "Olivia Owner", "owner"], [id.manager, "Mina Manager", "manager"], [id.desk, "Rana Desk", "receptionist"],
    [id.editor, "Esha Editor", "content_editor"], [id.hk, "Hasan HK", "housekeeping"], [id.hk2, "Hena HK", "housekeeping"],
  ];
  for (const [uid, name, role] of people) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [uid, `${uid.slice(0, 8)}@hotel.test`]);
    await db.query("insert into staff (user_id, full_name, role) values ($1, $2, $3)", [uid, name, role]);
  }
  await db.query("insert into rooms (number, room_type_id, floor) select n, id, '4th' from (values ('401'), ('402')) v(n), room_types where slug = 'standard-couple'");
}, 60_000);

afterAll(async () => db?.close());

beforeEach(async () => {
  await db.exec(`
    delete from booking_promotions; delete from payments; delete from booking_requests; delete from booking_access_tokens;
    delete from housekeeping_tasks; delete from booking_events; delete from bookings; delete from booking_holds;
    delete from promotions; delete from seasonal_rates; delete from notifications;
    delete from site_content; delete from site_content_versions; delete from media_assets; delete from storage.objects;
    update rooms set out_of_service = false, housekeeping = 'clean';
    update hotel_settings set vat_percent = null, service_charge_percent = null, max_discount_percent = 50;`);
});

/* ------------------------------------------------------------ content */

describe("website content: draft and publish", () => {
  it("drafts stay private; publishing makes them public and keeps history", async () => {
    await as(db, user(id.editor), async (q) => {
      const t1 = (await q<{ t: string }>("select public.admin_save_content_draft('home', 'en', null, '{\"hero_title\":\"Hello sea\"}', null) as t")).rows[0].t;
      // Visitors see nothing yet.
      await q("set local role anon");
      await q(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
      expect((await q("select key from site_content")).rows).toEqual([]);
      await q("reset role");
      await q("set local role authenticated");
      await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: id.editor, role: "authenticated", aal: "aal1" })]);
      expect((await q<{ v: number }>("select public.admin_publish_content('home', 'en', $1) as v", [t1])).rows[0].v).toBe(1);
      const t2 = (await q<{ t: string }>("select public.admin_save_content_draft('home', 'en', null, '{\"hero_title\":\"Hello again\"}', null) as t")).rows[0].t;
      await q("select public.admin_publish_content('home', 'en', $1)", [t2]);
      const row = (await q<{ body: { hero_title: string }; version: number }>("select body, version from site_content where key = 'home'")).rows[0];
      expect(row).toEqual({ body: { hero_title: "Hello again" }, version: 2 });
      const history = (await q<{ version: number }>("select version from admin_content_versions('home', 'en')")).rows.map((r) => r.version);
      expect(history).toEqual([2, 1]);
      // Restore version 1 into the draft; the live text doesn't change until it's published.
      await q("select public.admin_restore_content_version('home', 'en', 1)");
      const listed = (await q<{ body: { hero_title: string }; draft_body: { hero_title: string } }>("select body, draft_body from admin_list_content() where key = 'home'")).rows[0];
      expect(listed).toEqual({ body: { hero_title: "Hello again" }, draft_body: { hero_title: "Hello sea" } });
    });
  });

  it("refuses to overwrite a colleague's newer draft, and publishing a stale draft", () =>
    as(db, user(id.editor), async (q) => {
      const t1 = (await q<{ t: string }>("select public.admin_save_content_draft('faq', 'en', null, '{\"a\":1}', null) as t")).rows[0].t;
      await q("select public.admin_save_content_draft('faq', 'en', null, '{\"a\":2}', $1)", [t1]);
      expect(await rejects(q("select public.admin_save_content_draft('faq', 'en', null, '{\"a\":3}', $1)", [t1]))).toMatch(/CONTENT_CONFLICT/);
      expect(await rejects(q("select public.admin_publish_content('faq', 'en', $1)", [t1]))).toMatch(/CONTENT_CONFLICT/);
      expect(await rejects(q("select public.admin_publish_content('nothing', 'en', null)"))).toMatch(/NOTHING_TO_PUBLISH/);
      expect(await rejects(q("select public.admin_save_content_draft('Bad Key!', 'en', null, '{}', null)"))).toMatch(/BAD_CONTENT/);
      expect(await rejects(q("select public.admin_save_content_draft('faq2', 'en', null, '[1,2]', null)"))).toMatch(/BAD_CONTENT/);
    }));

  it("discarding a never-published draft returns the page to its built-in text", () =>
    as(db, user(id.editor), async (q) => {
      await q("select public.admin_save_content_draft('dining', 'en', null, '{\"x\":1}', null)");
      await q("select public.admin_discard_content_draft('dining', 'en')");
      expect((await q("select key from admin_list_content() where key = 'dining'")).rows).toEqual([]);
    }));

  it("only content editors (and managers) can edit; desk staff and visitors can't", async () => {
    expect(await rejects(as(db, user(id.desk), (q) => q("select public.admin_save_content_draft('home', 'en', null, '{}', null)")))).toMatch(/NOT_ALLOWED/);
    expect(await rejects(as(db, user(id.hk), (q) => q("select * from admin_list_content()")))).toMatch(/NOT_ALLOWED/);
    expect(await rejects(as(db, anon, (q) => q("select public.admin_save_content_draft('home', 'en', null, '{}', null)")))).toMatch(/permission denied/);
    await as(db, mgr(), (q) => q("select public.admin_save_content_draft('home', 'en', null, '{}', null)"));
  });
});

/* -------------------------------------------------------------- media */

describe("media library", () => {
  const url = (path: string) => `https://example.supabase.co/storage/v1/object/public/site-media/${path}`;

  async function upload(q: Db["query"], path: string, alt = "") {
    await q("insert into storage.objects (bucket_id, name) values ('site-media', $1)", [path]);
    return (await q<{ id: string }>("select public.admin_register_media('site-media', $1, $2, $3, 'home', 1600, 1067, 220000, 'image/webp') as id", [path, url(path), alt])).rows[0].id;
  }

  it("records only files that were really uploaded, with a matching URL", () =>
    as(db, user(id.editor), async (q) => {
      expect(await rejects(q("select public.admin_register_media('site-media', 'home/ghost.webp', $1, '', 'home', 1, 1, 1, 'image/webp')", [url("home/ghost.webp")]))).toMatch(/BAD_MEDIA/);
      await q("insert into storage.objects (bucket_id, name) values ('site-media', 'home/a.webp')");
      expect(await rejects(q("select public.admin_register_media('site-media', 'home/a.webp', $1, '', 'home', 1, 1, 1, 'image/webp')", [url("home/other.webp")]))).toMatch(/BAD_MEDIA/);
      expect(await rejects(q("select public.admin_register_media('site-media', 'home/a.webp', $1, '', 'home', 1, 1, 1, 'image/gif')", [url("home/a.webp")]))).toMatch(/BAD_MEDIA/);
    }));

  it("won't delete an image that a page or a room uses; replace swaps it everywhere", () =>
    as(db, user(id.manager, true), async (q) => {
      const a = await upload(q, "home/hero-a.webp", "Pool at dusk");
      const t = (await q<{ t: string }>("select public.admin_save_content_draft('home', 'en', null, $1::jsonb, null) as t", [JSON.stringify({ hero: { src: url("home/hero-a.webp"), alt: "Pool" } })])).rows[0].t;
      await q("select public.admin_publish_content('home', 'en', $1)", [t]);
      await q("update room_types set gallery = array_append(gallery, $1) where slug = 'deluxe-couple'", [url("home/hero-a.webp")]);
      const usage = (await q<{ kind: string; ref: string }>("select kind, ref from admin_media_usage($1) order by kind", [a])).rows;
      expect(usage).toEqual([{ kind: "content", ref: "home" }, { kind: "room_type", ref: "deluxe-couple" }]);
      expect(await rejects(q("select public.admin_delete_media($1)", [a]))).toMatch(/MEDIA_IN_USE/);

      const b = await upload(q, "home/hero-b.webp");
      expect((await q<{ p: string }>("select public.admin_replace_media($1, $2) as p", [a, b])).rows[0].p).toBe("home/hero-a.webp");
      const body = (await q<{ body: { hero: { src: string } } }>("select body from site_content where key = 'home'")).rows[0].body;
      expect(body.hero.src).toBe(url("home/hero-b.webp"));
      const gallery = (await q<{ gallery: string[] }>("select gallery from room_types where slug = 'deluxe-couple'")).rows[0].gallery;
      expect(gallery).toContain(url("home/hero-b.webp"));
      expect(gallery).not.toContain(url("home/hero-a.webp"));
      expect((await q<{ alt: string }>("select alt from media_assets where id = $1", [b])).rows[0].alt).toBe("Pool at dusk");

      const c = await upload(q, "home/spare.webp");
      expect((await q<{ p: string }>("select public.admin_delete_media($1) as p", [c])).rows[0].p).toBe("home/spare.webp");
    }));

  it("desk and housekeeping staff can't manage media", async () => {
    expect(await rejects(as(db, user(id.desk), (q) => q("select public.admin_delete_media(gen_random_uuid())")))).toMatch(/NOT_FOUND|NOT_ALLOWED/);
    expect(await rejects(as(db, user(id.hk), async (q) => {
      await q("insert into storage.objects (bucket_id, name) values ('site-media', 'x/y.webp')");
    }))).toMatch(/row-level security/);
  });
});

/* -------------------------------------------------------- room setup */

describe("room setup", () => {
  it("creates a room type with its standard rate, unpublished, with a unique address", () =>
    as(db, mgr(), async (q) => {
      const a = (await q<{ id: string }>("select public.admin_create_room_type('Garden Twin', 'DELUXE', 'Two single beds', 2, 3000, 3800, 'Quiet, garden side.', '') as id")).rows[0].id;
      const b = (await q<{ id: string }>("select public.admin_create_room_type('Garden Twin', 'DELUXE', 'Two single beds', 2, 3000, null, '', '') as id")).rows[0].id;
      const rows = (await q<{ slug: string; is_published: boolean; plans: number }>(
        "select slug, is_published, (select count(*)::int from rate_plans where room_type_id = rt.id and code = 'STANDARD') plans from room_types rt where id in ($1, $2) order by slug", [a, b])).rows;
      expect(rows).toEqual([{ slug: "garden-twin", is_published: false, plans: 1 }, { slug: "garden-twin-2", is_published: false, plans: 1 }]);
      expect(await rejects(q("select public.admin_create_room_type('X', 'DELUXE', 'Bed', 2, 3000, null, '', '')"))).toMatch(/BAD_ROOM_TYPE/);
      expect(await rejects(q("select public.admin_create_room_type('Big Room', 'DELUXE', 'Bed', 40, 3000, null, '', '')"))).toMatch(/BAD_ROOM_TYPE/);
    }));

  it("desk staff can't create room types or change seasons", async () => {
    expect(await rejects(as(db, user(id.desk), (q) => q("select public.admin_create_room_type('Nope Room', 'DELUXE', 'Bed', 2, 3000, null, '', '')")))).toMatch(/NOT_ALLOWED/);
    const t = await typeId("standard-couple");
    expect(await rejects(as(db, user(id.desk), (q) => q("select public.admin_save_seasonal_rate(null, $1, 'Eid', $2, $3, 9000, null, true)", [t, day(1), day(4)])))).toMatch(/NOT_ALLOWED/);
  });

  it("seasonal rates: overlapping seasons are refused with a clear reason, and prices follow them", async () => {
    const t = await typeId("standard-couple");
    await as(db, mgr(), async (q) => {
      await q("select public.admin_save_seasonal_rate(null, $1, 'Eid', $2, $3, 9000, null, true)", [t, day(1), day(4)]);
      expect(await rejects(q("select public.admin_save_seasonal_rate(null, $1, 'Puja', $2, $3, 8000, null, true)", [t, day(3), day(6)]))).toMatch(/SEASON_OVERLAP/);
      expect(await rejects(q("select public.admin_save_seasonal_rate(null, $1, 'Back', $2, $3, 8000, null, true)", [t, day(5), day(4)]))).toMatch(/BAD_SEASON/);
      // A switched-off season doesn't block another.
      await q("select public.admin_save_seasonal_rate(null, $1, 'Puja', $2, $3, 8000, null, false)", [t, day(3), day(6)]);
    });
    await as(db, mgr(), async (q) => {
      await q("select public.admin_save_seasonal_rate(null, $1, 'Eid', $2, $3, 9000, null, true)", [t, day(1), day(4)]);
      const total = (await q<{ total: number }>("select total from search_availability($1, $2, 2, 0) where room_type = 'standard-couple'", [day(0), day(2)])).rows[0].total;
      expect(total).toBe(2500 + 9000);
    });
  });
});

/* ------------------------------------------------------- housekeeping */

describe("housekeeping", () => {
  const room = async () => (await one<{ id: string }>("select id from rooms where number = '401'")).id;

  it("a cleaning moves the room dirty → cleaning → clean; an inspection marks it inspected", async () => {
    const r = await room();
    await db.query("update rooms set housekeeping = 'dirty' where id = $1", [r]);
    await as(db, user(id.desk), async (q) => {
      const t = (await q<{ id: string }>("select public.admin_create_task($1, 'clean', null, $2, '') as id", [r, id.hk])).rows[0].id;
      const i = (await q<{ id: string }>("select public.admin_create_task($1, 'inspect', null, null, '') as id", [r])).rows[0].id;
      await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: id.hk, role: "authenticated", aal: "aal1" })]);
      const status = async () => (await q<{ h: string }>("select housekeeping h from rooms where id = $1", [r])).rows[0].h;
      await q("select public.admin_update_task($1, 'in_progress')", [t]);
      expect(await status()).toBe("cleaning");
      await q("select public.admin_update_task($1, 'done', 'Linen changed')", [t]);
      expect(await status()).toBe("clean");
      await q("select public.admin_update_task($1, 'done')", [i]);
      expect(await status()).toBe("inspected");
    });
  });

  it("the board shows occupied and out-of-service rooms without guest details", async () => {
    const r = await room();
    const ref = (await one<{ r: string }>(
      "select public._insert_booking('standard-couple', public._today(), public._today() + 2, 1, 2, 0, 'Secret Guest', 'sg@example.com', '+8801711000777', '', null, '', false, 'phone', 'confirmed', null) as r")).r;
    await db.query("update bookings set room_id = $1 where reference = $2", [r, ref]);
    await db.query("update bookings set status = 'checked_in' where reference = $1", [ref]);
    await db.query("update rooms set out_of_service = true, service_note = 'AC repair' where number = '402'");
    await as(db, user(id.hk), async (q) => {
      const board = (await q<Record<string, unknown>>("select * from housekeeping_board()")).rows;
      const a = board.find((b) => b.number === "401")!;
      const b = board.find((b) => b.number === "402")!;
      expect(a).toMatchObject({ occupied: true, departing: false });
      expect(b).toMatchObject({ out_of_service: true, service_note: "AC repair" });
      expect(JSON.stringify(board)).not.toContain("Secret Guest");
      expect((await q("select * from bookings")).rows).toEqual([]);
    });
  });

  it("housekeepers report repairs and maintenance managers are told; only the desk assigns tasks", async () => {
    const r = await room();
    await as(db, user(id.hk), async (q) => {
      const task = (await q<{ id: string }>("select public.report_maintenance_issue($1, 'Shower is leaking', true) as id", [r])).rows[0].id;
      const t = (await q<{ kind: string; priority: number }>("select kind, priority from housekeeping_tasks where id = $1", [task])).rows[0];
      expect(t).toEqual({ kind: "maintenance", priority: 1 });
      expect(await rejects(q("select public.admin_assign_task($1, $2)", [task, id.hk2]))).toMatch(/NOT_ALLOWED/);
      expect(await rejects(q("select public.report_maintenance_issue($1, 'x', false)", [r]))).toMatch(/BAD_TASK/);
      // The manager's inbox has it.
      await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: id.manager, role: "authenticated", aal: "aal2" })]);
      const inbox = (await q<{ title: string }>("select title from notifications")).rows.map((n) => n.title);
      expect(inbox).toContain("Urgent repair: room 401");
      await q("select public.admin_assign_task($1, $2)", [task, id.hk2]);
      expect(await rejects(q("select public.admin_assign_task($1, $2)", [task, id.editor]))).toMatch(/NOT_FOUND/);
    });
  });

  it("knows the six statuses: four set by staff, occupied and out of service derived", async () => {
    const r = await room();
    await as(db, user(id.hk), async (q) => {
      for (const s of ["dirty", "cleaning", "clean", "inspected"]) await q("update rooms set housekeeping = $1 where id = $2", [s, r]);
      expect(await rejects(q("update rooms set housekeeping = 'occupied' where id = $1", [r]))).toMatch(/check constraint/);
      expect(await rejects(q("update rooms set out_of_service = true where id = $1", [r]))).toMatch(/NOT_ALLOWED/);
    });
  });
});

/* --------------------------------------------------------- promotions */

describe("promotions: types, limits and stacking", () => {
  it("an automatic offer applies without a code; a percentage and a fixed amount", async () => {
    await offer({ name: "Winter", discount_value: 10 });
    expect((await quote(0, 2, ["standard-couple"])).quote).toMatchObject({ subtotal: 5000, discount: 500, total: 4500 });
    await db.query("delete from promotions");
    await offer({ name: "Flat", discount_type: "amount", discount_value: 700 });
    expect((await quote(0, 2, ["standard-couple"])).quote).toMatchObject({ discount: 700, total: 4300 });
  });

  it("room-specific and date-limited: only covered rooms and nights are discounted", async () => {
    const deluxe = await typeId("deluxe-couple");
    await offer({ name: "Deluxe only", discount_value: 20, room_type_ids: `{${deluxe}}` });
    // Standard Couple ৳2,500 ×2, Deluxe Couple ৳3,500 ×2 → 20% of 7,000.
    expect((await quote(0, 2, ["standard-couple", "deluxe-couple"])).quote.discount).toBe(1400);
    await db.query("delete from promotions");
    await offer({ name: "Two nights only", discount_value: 50, starts_on: day(0), ends_on: day(1) });
    expect((await quote(0, 2, ["standard-couple"])).quote.discount).toBe(1250); // first night only
    expect((await quote(2, 3, ["standard-couple"])).quote.discount).toBe(0); // check-in after the offer
  });

  it("booking window: an offer only applies while it can be booked", async () => {
    await offer({ name: "Early bird", discount_value: 15, bookable_from: day(-200), bookable_until: day(-150) });
    expect((await quote(0, 2, ["standard-couple"])).quote.discount).toBe(0);
  });

  it("stackable offers add up; an exclusive offer stands alone; the guest gets the better result", async () => {
    await offer({ name: "Stack A", discount_value: 10, stackable: true });
    await offer({ name: "Stack B", discount_type: "amount", discount_value: 300, stackable: true });
    const q1 = (await quote(0, 2, ["standard-couple"])).quote; // 500 + 300 = 800
    expect(q1.discount).toBe(800);
    expect(q1.promotions.map((p) => p.name).sort()).toEqual(["Stack A", "Stack B"]);
    await offer({ name: "Exclusive 20", discount_value: 20 }); // 1,000 beats 800
    const q2 = (await quote(0, 2, ["standard-couple"])).quote;
    expect(q2).toMatchObject({ discount: 1000 });
    expect(q2.promotions.map((p) => p.name)).toEqual(["Exclusive 20"]);
  });

  it("a code that isn't better than the automatic offer is reported, not silently applied", async () => {
    await offer({ name: "Exclusive 20", discount_value: 20 });
    await offer({ name: "Code 5", code: "FIVE", discount_value: 5 });
    const q = (await quote(0, 2, ["standard-couple"], "five")).quote;
    expect(q).toMatchObject({ discount: 1000, code_status: "not_better" });
    await offer({ name: "Code 30", code: "THIRTY", discount_value: 30 });
    expect((await quote(0, 2, ["standard-couple"], "THIRTY")).quote).toMatchObject({ discount: 1500, code_status: "applied" });
    expect(await rejects(quote(4, 6, ["standard-couple"], "MISSING"))).toMatch(/PROMO_INVALID/);
  });

  it("caps: an offer's own maximum, and the hotel's overall maximum discount", async () => {
    await offer({ name: "Big", discount_value: 80, max_discount_bdt: 1200 });
    expect((await quote(0, 2, ["standard-couple"])).quote.discount).toBe(1200);
    await db.query("delete from promotions");
    await offer({ name: "S1", discount_value: 40, stackable: true });
    await offer({ name: "S2", discount_value: 40, stackable: true });
    await db.query("update hotel_settings set max_discount_percent = 50");
    const q = (await quote(0, 2, ["standard-couple"])).quote;
    expect(q.discount).toBe(2500); // 80% asked, 50% allowed
    expect(q.promotions.reduce((s, p) => s + p.discount, 0)).toBe(2500);
  });

  it("records each offer on the booking and counts redemptions from that record", async () => {
    const p = await offer({ name: "Only one", code: "ONCE", discount_value: 10, max_redemptions: 1 });
    const h = await quote(0, 2, ["standard-couple"], "ONCE");
    const res = (await one<{ r: { reference: string } }>(
      "select public.confirm_hold($1, $2, 'Promo Guest', 'pg@example.com', '+8801711000888', '', '', '', false, 'pay_at_hotel', $3) as r",
      [h.token, randomUUID(), h.quote.total])).r;
    const used = await one<{ discount_bdt: number }>("select bp.discount_bdt from booking_promotions bp join bookings b on b.id = bp.booking_id where b.reference = $1 and bp.promotion_id = $2", [res.reference, p]);
    expect(used.discount_bdt).toBe(500);
    expect(await rejects(quote(4, 6, ["standard-couple"], "ONCE"))).toMatch(/PROMO_EXHAUSTED/);
    // Changing the booking keeps its own redemption.
    const b = await one<{ id: string }>("select id from bookings where reference = $1", [res.reference]);
    // New dates re-price with the same offer, even though its only redemption is this booking's.
    await as(db, user(id.desk), async (q) => {
      await q("select public.admin_modify_booking($1, 'standard-couple', $2, $3, 1, 2, 0)", [b.id, day(0), day(3)]);
      const after = (await q<{ discount_bdt: number }>("select discount_bdt from bookings where id = $1", [b.id])).rows[0];
      expect(after.discount_bdt).toBe(750);
    });
  });

  it("if an offer runs out between seeing the price and confirming, nothing is booked", async () => {
    await offer({ name: "Last one", discount_value: 10, max_redemptions: 1 });
    const first = await quote(0, 2, ["standard-couple"]);
    const second = await quote(4, 6, ["standard-couple"]);
    expect(second.quote.discount).toBe(700); // Thursday + Friday: 2 × ৳3,500 weekend nights
    await db.query("select public.confirm_hold($1, $2, 'First', 'f@example.com', '+8801711000901', '', '', '', false, 'pay_at_hotel', $3)", [first.token, randomUUID(), first.quote.total]);
    expect(await rejects(db.query("select public.confirm_hold($1, $2, 'Second', 's@example.com', '+8801711000902', '', '', '', false, 'pay_at_hotel', $3)",
      [second.token, randomUUID(), second.quote.total]))).toMatch(/PRICE_CHANGED/);
    expect((await one<{ n: number }>("select count(*)::int n from bookings")).n).toBe(1);
  });

  it("managing offers needs promotions.manage; codes are unique; used offers can't be deleted", async () => {
    const body = (o: Record<string, unknown> = {}) =>
      JSON.stringify({ code: "SUMMER", name: "Summer", discount_type: "percent", discount_value: 10, starts_on: day(0), ends_on: day(30), is_active: true, ...o });
    expect(await rejects(as(db, user(id.desk), (q) => q("select public.admin_save_promotion(null, $1::jsonb)", [body()])))).toMatch(/NOT_ALLOWED/);
    expect(await rejects(as(db, user(id.desk), (q) => q("insert into promotions (code, name, discount_type, discount_value, starts_on, ends_on) values ('X1X', 'X', 'percent', 5, current_date, current_date + 2)")))).toMatch(/permission denied/);
    await as(db, mgr(), async (q) => {
      const pid = (await q<{ id: string }>("select public.admin_save_promotion(null, $1::jsonb) as id", [body()])).rows[0].id;
      expect(await rejects(q("select public.admin_save_promotion(null, $1::jsonb)", [body({ code: "summer" })]))).toMatch(/PROMO_CODE_TAKEN/);
      expect(await rejects(q("select public.admin_save_promotion(null, $1::jsonb)", [body({ code: "P2", discount_value: 95 })]))).toMatch(/BAD_PROMO/);
      expect(await rejects(q("select public.admin_save_promotion(null, $1::jsonb)", [body({ code: "P3", ends_on: day(-1) })]))).toMatch(/BAD_PROMO/);
      const auto = (await q<{ id: string }>("select public.admin_save_promotion(null, $1::jsonb) as id", [body({ code: "", name: "Automatic" })])).rows[0].id;
      expect((await q<{ auto_apply: boolean }>("select auto_apply from promotions where id = $1", [auto])).rows[0].auto_apply).toBe(true);
      await q("select public.admin_set_promotion_active($1, false)", [pid]);
      await q("select public.admin_delete_promotion($1)", [pid]);
    });
    const used = await offer({ name: "Used", discount_value: 10 });
    const h = await quote(0, 2, ["standard-couple"]);
    await db.query("select public.confirm_hold($1, $2, 'Used Guest', 'ug@example.com', '+8801711000903', '', '', '', false, 'pay_at_hotel', $3)", [h.token, randomUUID(), h.quote.total]);
    expect(await rejects(as(db, mgr(), (q) => q("select public.admin_delete_promotion($1)", [used])))).toMatch(/PROMO_IN_USE/);
  });
});

/* -------------------------------------------------------------- staff */

describe("staff can't raise their own access", () => {
  it("nobody changes their own role or writes the staff table", async () => {
    for (const [uid, mfa] of [[id.desk, false], [id.hk, false], [id.manager, true]] as const) {
      expect(await rejects(as(db, user(uid, mfa), (q) => q("select public.admin_set_staff_role($1, 'owner')", [uid])))).toMatch(/SELF_CHANGE|NOT_ALLOWED/);
      expect(await rejects(as(db, user(uid, mfa), (q) => q("update staff set role = 'owner' where user_id = $1", [uid])))).toMatch(/permission denied/);
      expect(await rejects(as(db, user(uid, mfa), (q) => q("insert into private.role_permissions values ('housekeeping', 'staff.manage')")))).toMatch(/permission denied/);
    }
  });

  it("a manager can't appoint someone above themselves or reactivate a superior", () =>
    as(db, mgr(), async (q) => {
      expect(await rejects(q("select public.admin_set_staff_role($1, 'owner')", [id.desk]))).toMatch(/RANK/);
      expect(await rejects(q("select public.admin_set_staff_active($1, false)", [id.owner]))).toMatch(/RANK/);
      await q("select public.admin_set_staff_role($1, 'housekeeping')", [id.desk]);
    }));
});
