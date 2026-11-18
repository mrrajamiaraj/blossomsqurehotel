// Row-level security and permission tests against a real PostgreSQL with
// every migration applied (see tests/db/harness.ts). Each test runs as an API
// caller (anon / a signed-in user, with or without MFA) inside a transaction
// that is rolled back.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createDevDatabase, rejects, type Db } from "./harness";

let db: Db;

const id = {
  owner: randomUUID(),
  owner2: randomUUID(),
  superAdmin: randomUUID(),
  manager: randomUUID(),
  finance: randomUUID(),
  reception: randomUUID(),
  reception2: randomUUID(),
  editor: randomUUID(),
  housekeeper: randomUUID(),
  housekeeper2: randomUUID(),
  guest: randomUUID(),
  otherGuest: randomUUID(),
  newcomer: randomUUID(),
};

const anon = { kind: "anon" } as const;
const user = (uid: string, mfa = false) => ({ kind: "user", id: uid, aal: mfa ? "aal2" : "aal1" }) as const;

let bookingA: string; // the guest's booking
let bookingB: string; // someone else's
let bookingDone: string; // checked out, for reviews
let refA = "";
let roomCount = 0;
let roomA = "";

async function one<T>(q: Db["query"], sql: string, params: unknown[] = []): Promise<T> {
  const r = await q<T>(sql, params);
  return r.rows[0];
}

beforeAll(async () => {
  db = await createDevDatabase();
  const users: [string, string][] = [
    [id.owner, "owner@hotel.test"], [id.owner2, "owner2@hotel.test"], [id.superAdmin, "super@hotel.test"],
    [id.manager, "manager@hotel.test"], [id.finance, "finance@hotel.test"], [id.reception, "desk@hotel.test"],
    [id.reception2, "desk2@hotel.test"], [id.editor, "editor@hotel.test"], [id.housekeeper, "hk@hotel.test"],
    [id.housekeeper2, "hk2@hotel.test"], [id.guest, "guest.one@example.com"], [id.otherGuest, "guest.two@example.com"],
    [id.newcomer, "new@hotel.test"],
  ];
  for (const [uid, email] of users)
    await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [uid, email]);
  const staff: [string, string, string][] = [
    [id.owner, "Olivia Owner", "owner"], [id.superAdmin, "Sam Super", "super_admin"], [id.manager, "Mina Manager", "manager"],
    [id.finance, "Farid Finance", "finance"], [id.reception, "Rana Desk", "receptionist"], [id.reception2, "Rupa Desk", "receptionist"],
    [id.editor, "Esha Editor", "content_editor"], [id.housekeeper, "Hasan HK", "housekeeping"], [id.housekeeper2, "Hena HK", "housekeeping"],
  ];
  for (const [uid, name, role] of staff) await db.query("insert into public.staff (user_id, full_name, role) values ($1, $2, $3)", [uid, name, role]);

  // Real website bookings, created the way the site creates them.
  const make = async (email: string, phone: string, name: string, days: number) =>
    one<{ ref: string }>(
      db.query.bind(db),
      `select public.create_booking('deluxe-couple', current_date + $1::int, current_date + $1::int + 2, 1, 2, 0, $2, $3, $4, 'Bangladesh', '', '', false) as ref`,
      [days, name, email, phone],
    );
  refA = (await make("guest.one@example.com", "+880 1711-000001", "Guest One", 30)).ref;
  const refB = (await make("guest.two@example.com", "+880 1711-000002", "Guest Two", 40)).ref;
  const refC = (await make("guest.one@example.com", "+880 1711-000001", "Guest One", 50)).ref;
  bookingA = (await one<{ id: string }>(db.query.bind(db), "select id from bookings where reference = $1", [refA])).id;
  bookingB = (await one<{ id: string }>(db.query.bind(db), "select id from bookings where reference = $1", [refB])).id;
  bookingDone = (await one<{ id: string }>(db.query.bind(db), "select id from bookings where reference = $1", [refC])).id;
  await db.query("update bookings set status = 'checked_out' where id = $1", [bookingDone]);
  roomA = (await one<{ id: string }>(db.query.bind(db), "select id from rooms order by number limit 1")).id;
  roomCount = (await one<{ n: number }>(db.query.bind(db), "select count(*)::int as n from rooms")).n;
  await db.query("update guests set user_id = $1 where lower(email) = 'guest.one@example.com'", [id.guest]);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

/* ------------------------------------------------------------ structure */

describe("structure", () => {
  it("every table in public, private and audit has RLS enabled", async () => {
    const { rows } = await db.query<{ t: string }>(`
      select n.nspname || '.' || c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'r' and n.nspname in ('public', 'private', 'audit') and not c.relrowsecurity`);
    expect(rows).toEqual([]);
  });

  it("anon can't write to any table, and can read only the public catalogue", async () => {
    const { rows } = await db.query<{ table_name: string; privilege_type: string }>(`
      select table_name, privilege_type from information_schema.role_table_grants
      where grantee = 'anon' and table_schema = 'public' order by 1, 2`);
    expect(rows.filter((r) => r.privilege_type !== "SELECT")).toEqual([]);
    expect([...new Set(rows.map((r) => r.table_name))].sort()).toEqual(
      ["amenities", "hotel_settings", "promotions", "rate_plans", "room_images", "room_type_amenities", "room_types"].sort(),
    );
  });

  it("visitors and signed-in non-editors read only the published columns of site content, never drafts", async () => {
    for (const role of ["anon", "authenticated"]) {
      const { rows } = await db.query<{ column_name: string; privilege_type: string }>(
        `select column_name, privilege_type from information_schema.column_privileges where grantee = $1 and table_name = 'site_content'`,
        [role],
      );
      expect(rows.every((r) => r.privilege_type === "SELECT"), role).toBe(true);
      expect(rows.map((r) => r.column_name).sort(), role).toEqual(["body", "key", "locale", "published_at", "status", "title", "version"]);
    }
  });

  it("anon can read only the public columns of reviews", async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.column_privileges where grantee = 'anon' and table_name = 'reviews'`,
    );
    expect(rows.map((r) => r.column_name)).not.toContain("moderated_by");
    expect(rows.map((r) => r.column_name)).toContain("body");
  });

  it("no signed-in user can write staff, bookings, payments or refunds directly", async () => {
    const { rows } = await db.query<{ table_name: string; privilege_type: string }>(`
      select table_name, privilege_type from information_schema.role_table_grants
      where grantee = 'authenticated' and table_schema = 'public'
        and table_name in ('staff', 'bookings', 'payments', 'refunds', 'booking_events', 'inquiries', 'notifications', 'booking_rooms')
        and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')`);
    expect(rows).toEqual([]);
  });

  it("every SECURITY DEFINER function pins search_path", async () => {
    const { rows } = await db.query<{ proname: string }>(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'audit') and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
    expect(rows).toEqual([]);
  });

  it("internal helpers aren't callable from the API", async () => {
    for (const fn of ["_require(text)", "_free_units(uuid,date,date,uuid)", "_upsert_guest(text,text,text,text)", "_recalc_paid(uuid)"]) {
      const { rows } = await db.query<{ ok: boolean }>(`select has_function_privilege('authenticated', 'public.${fn}', 'execute') as ok`);
      expect(rows[0].ok, fn).toBe(false);
    }
  });
});

/* ---------------------------------------------------------------- anon */

describe("anonymous visitor", () => {
  it("reads the public catalogue", () =>
    as(db, anon, async (q) => {
      expect((await q("select * from room_types")).rows.length).toBe(7);
      expect((await q("select * from amenities")).rows.length).toBeGreaterThan(5);
      expect((await q("select * from rate_plans")).rows.length).toBe(7);
      expect((await q("select * from room_availability(current_date + 60, current_date + 62)")).rows.length).toBe(7);
    }));

  it("can't read reservations, guests, payments, staff, enquiries or notifications", async () => {
    for (const t of ["bookings", "guests", "payments", "refunds", "staff", "inquiries", "notifications", "booking_guests", "seasonal_rates"])
      expect(await rejects(as(db, anon, (q) => q(`select * from public.${t}`))), t).toMatch(/permission denied/);
  });

  it("can't reach the private or audit schemas", async () => {
    expect(await rejects(as(db, anon, (q) => q("select * from private.roles")))).toMatch(/permission denied/);
    expect(await rejects(as(db, anon, (q) => q("select * from audit.logs")))).toMatch(/permission denied/);
  });

  it("can book, enquire and look up a booking with the right contact only", () =>
    as(db, anon, async (q) => {
      expect((await one<{ r: string }>(q, "select public.submit_inquiry('general','Visitor','v@example.com',null,'Is the pool open in winter?',null,null) as r")).r).toMatch(/^ENQ-/);
      expect((await q("select * from lookup_booking($1, 'guest.one@example.com')", [refA])).rows.length).toBe(1);
      expect((await q("select * from lookup_booking($1, 'guest.two@example.com')", [refA])).rows.length).toBe(0);
    }));

  it("can't call any admin function or change staff", async () => {
    expect(await rejects(as(db, anon, (q) => q("select public.admin_record_payment($1, 100, 'cash', '')", [bookingA])))).toMatch(/permission denied/);
    expect(await rejects(as(db, anon, (q) => q("select public.admin_upsert_staff($1, 'X', 'owner')", [id.newcomer])))).toMatch(/permission denied/);
    expect(await rejects(as(db, anon, (q) => q("select public.my_bookings()")))).toMatch(/permission denied/);
  });

  it("sees only approved reviews and published content", () =>
    as(db, anon, async (q) => {
      expect((await q("select id, author_name, body from reviews")).rows).toEqual([]);
      expect((await q("select key, body from site_content")).rows).toEqual([]);
      expect(await rejects(q("select draft_body from site_content"))).toMatch(/permission denied/);
    }));

  it("can't review a stay that isn't finished, or with the wrong contact", async () => {
    expect(await rejects(as(db, anon, (q) => q("select public.submit_review($1, 'guest.one@example.com', 5, '', 'Lovely stay, great staff.')", [refA])))).toMatch(/NOT_ELIGIBLE/);
  });

  it("can't upload to any bucket", async () => {
    expect(await rejects(as(db, anon, (q) => q("insert into storage.objects (bucket_id, name) values ('room-photos', 'x.jpg')")))).toMatch(/row-level security/);
    expect(await rejects(as(db, anon, (q) => q("insert into storage.objects (bucket_id, name) values ('guest-documents', $1)", [`bookings/${bookingA}/id.pdf`])))).toMatch(/row-level security/);
  });
});

/* --------------------------------------------------------------- guest */

describe("signed-in guest (not staff)", () => {
  const me = () => user(id.guest);

  it("sees their own reservations through my_bookings(), never other guests'", () =>
    as(db, me(), async (q) => {
      const rows = (await q<{ reference: string }>("select * from my_bookings()")).rows;
      expect(rows.length).toBe(2);
      expect(rows.every((r) => r.reference !== null)).toBe(true);
      expect((await q("select * from bookings")).rows).toEqual([]); // no direct table access
      expect((await q("select * from payments")).rows).toEqual([]);
    }));

  it("sees and edits only their own guest profile, in allowed columns", () =>
    as(db, me(), async (q) => {
      const rows = (await q<{ email: string }>("select email from guests")).rows;
      expect(rows).toEqual([{ email: "guest.one@example.com" }]);
      expect((await q("update guests set phone = '+880 1711-999999'")).affectedRows).toBe(1);
      expect(await rejects(q("update guests set email = 'stolen@example.com'"))).toMatch(/permission denied/);
      expect(await rejects(q("update guests set staff_notes = 'vip'"))).toMatch(/permission denied/);
    }));

  it("another guest sees nothing of theirs", () =>
    as(db, user(id.otherGuest), async (q) => {
      expect((await q("select * from my_bookings()")).rows).toEqual([]);
      expect((await q("select * from guests")).rows).toEqual([]);
    }));

  it("can link their account by verified email, but not someone else's profile", async () => {
    await as(db, user(id.otherGuest), async (q) => {
      expect((await one<{ g: string }>(q, "select public.claim_guest_profile() as g")).g).toBeTruthy();
      expect((await q<{ email: string }>("select email from guests")).rows).toEqual([{ email: "guest.two@example.com" }]);
    });
  });

  it("can't make themselves staff or call staff functions", async () => {
    expect(await rejects(as(db, me(), (q) => q("insert into staff (user_id, full_name, role) values ($1, 'Me', 'owner')", [id.guest])))).toMatch(/permission denied/);
    expect(await rejects(as(db, me(), (q) => q("select public.admin_upsert_staff($1, 'Me', 'owner')", [id.guest])))).toMatch(/NOT_STAFF/);
    expect(await rejects(as(db, me(), (q) => q("select public.admin_record_payment($1, 100, 'cash', '')", [bookingA])))).toMatch(/NOT_STAFF/);
    expect(await rejects(as(db, me(), (q) => q("select * from admin_audit_log()")))).toMatch(/NOT_STAFF/);
    expect(await rejects(as(db, me(), (q) => q("select * from private.role_permissions")))).toMatch(/permission denied/);
  });
});

/* -------------------------------------------------------- receptionist */

describe("receptionist", () => {
  const me = () => user(id.reception);

  it("reads reservations and guests, but not the audit log or seasonal admin", () =>
    as(db, me(), async (q) => {
      expect((await q("select * from bookings")).rows.length).toBe(3);
      expect((await q("select * from guests")).rows.length).toBe(2);
      expect(await rejects(q("select * from admin_audit_log()"))).toMatch(/NOT_ALLOWED/);
    }));

  it("runs the desk: confirm, assign, take payment — totals come from the ledger", () =>
    as(db, me(), async (q) => {
      await q("select public.admin_set_status($1, 'confirmed')", [bookingA]);
      const room = await one<{ id: string }>(q, "select r.id from rooms r join room_types t on t.id = r.room_type_id where t.slug = 'deluxe-couple' limit 1");
      await q("select public.admin_assign_room($1, $2)", [bookingA, room.id]);
      await q("select public.admin_record_payment($1, 1500, 'bkash', 'TrxID 123')", [bookingA]);
      const b = await one<{ amount_paid_bdt: number; payment_status: string }>(q, "select amount_paid_bdt, payment_status from bookings where id = $1", [bookingA]);
      expect(b).toEqual({ amount_paid_bdt: 1500, payment_status: "partial" });
      expect((await q("select * from payments where booking_id = $1", [bookingA])).rows.length).toBe(1);
      const br = await one<{ room_id: string }>(q, "select room_id from booking_rooms where booking_id = $1", [bookingA]);
      expect(br.room_id).toBe(room.id);
    }));

  it("can't edit totals, paid amounts, prices or inventory directly", () =>
    as(db, me(), async (q) => {
      expect(await rejects(q("update bookings set total_bdt = 1 where id = $1", [bookingA]))).toMatch(/permission denied/);
      expect(await rejects(q("insert into payments (booking_id, amount_bdt, method) values ($1, 99999, 'cash')", [bookingA]))).toMatch(/permission denied/);
      expect((await q("update room_types set price_bdt = 1")).affectedRows).toBe(0);
      expect(await rejects(q("update rooms set out_of_service = true where id = $1", [roomA]))).toMatch(/NOT_ALLOWED/);
      expect(await rejects(q("update rooms set number = 'X1' where id = $1", [roomA]))).toMatch(/permission denied/);
      expect((await q("update rooms set housekeeping = 'dirty' where id = $1", [roomA])).affectedRows).toBe(1);
    }));

  it("can request a refund but not approve it, nor manage staff, rates or blocks", () =>
    as(db, me(), async (q) => {
      await q("select public.admin_record_payment($1, 2000, 'cash', '')", [bookingA]);
      const r = await one<{ id: string }>(q, "select public.admin_request_refund($1, 500, 'cash', 'Changed plans') as id", [bookingA]);
      expect(await rejects(q("select public.admin_decide_refund($1, true)", [r.id]))).toMatch(/NOT_ALLOWED/);
      expect(await rejects(q("select public.admin_request_refund($1, 99999, 'cash', 'Too much')", [bookingA]))).toMatch(/REFUND_TOO_LARGE/);
      expect(await rejects(q("select public.admin_set_staff_role($1, 'manager')", [id.reception2]))).toMatch(/NOT_ALLOWED/);
      expect(await rejects(q("select public.admin_block_room($1, current_date + 5, current_date + 6, 'Paint')", [roomA]))).toMatch(/NOT_ALLOWED/);
      expect(await rejects(q("insert into seasonal_rates (room_type_id, name, starts_on, ends_on, price_bdt) select id, 'Eid', current_date, current_date + 3, 9000 from room_types limit 1"))).toMatch(/row-level security/);
    }));

  it("uploads guest documents only to a real booking's folder, and can't touch site media", () =>
    as(db, me(), async (q) => {
      await q("insert into storage.objects (bucket_id, name, owner) values ('guest-documents', $1, $2)", [`bookings/${bookingA}/passport.pdf`, id.reception]);
      expect(await rejects(q("insert into storage.objects (bucket_id, name) values ('guest-documents', 'loose/passport.pdf')"))).toMatch(/row-level security/);
      expect(await rejects(q("insert into storage.objects (bucket_id, name) values ('guest-documents', $1)", [`bookings/${randomUUID()}/x.pdf`]))).toMatch(/row-level security/);
      expect(await rejects(q("insert into storage.objects (bucket_id, name) values ('site-media', 'hero.jpg')"))).toMatch(/row-level security/);
      expect((await q("delete from storage.objects where bucket_id = 'guest-documents'")).affectedRows).toBe(0);
    }));
});

/* -------------------------------------------------------- housekeeping */

describe("housekeeping", () => {
  it("sees tasks and rooms but no reservations, guests or payments", () =>
    as(db, user(id.housekeeper), async (q) => {
      expect((await q("select * from bookings")).rows).toEqual([]);
      expect((await q("select * from guests")).rows).toEqual([]);
      expect((await q("select * from payments")).rows).toEqual([]);
      expect((await q("select * from rooms")).rows.length).toBe(roomCount);
      expect(await rejects(q("select public.admin_set_status($1, 'confirmed')", [bookingA]))).toMatch(/NOT_ALLOWED/);
    }));

  it("updates their own tasks, not a colleague's", async () => {
    await as(db, user(id.reception), async (q) => {
      const mine = await one<{ id: string }>(q, "select public.admin_create_task($1, 'clean', null, $2, '') as id", [roomA, id.housekeeper]);
      const theirs = await one<{ id: string }>(q, "select public.admin_create_task($1, 'inspect', null, $2, '') as id", [roomA, id.housekeeper2]);
      // Switch to the housekeeper inside the same transaction.
      await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: id.housekeeper, role: "authenticated", aal: "aal1" })]);
      await q("select public.admin_update_task($1, 'done')", [mine.id]);
      expect((await one<{ housekeeping: string }>(q, "select housekeeping from rooms where id = $1", [roomA])).housekeeping).toBe("clean");
      expect(await rejects(q("select public.admin_update_task($1, 'done')", [theirs.id]))).toMatch(/NOT_ALLOWED/);
    });
  });
});

/* ------------------------------------------------------ content editor */

describe("content editor", () => {
  it("publishes content and moderates reviews, nothing operational", () =>
    as(db, user(id.editor), async (q) => {
      const base = await one<{ t: string }>(q, "select public.admin_save_content_draft('home.hero', 'en', 'Hello', '{\"title\":\"Hi\"}', null) as t");
      await q("select public.admin_publish_content('home.hero', 'en', $1)", [base.t]);
      await q("select public.admin_save_content_draft('home.draft', 'en', 'Draft', '{}', null)");
      expect(await rejects(q("insert into site_content (key, title, body, status) values ('x.y', 'X', '{}', 'published')"))).toMatch(/permission denied/);
      expect((await q("select * from bookings")).rows).toEqual([]);
      expect((await q("update room_types set price_bdt = 1")).affectedRows).toBe(0);
      expect(await rejects(q("select public.admin_add_review('A Guest', 5, null, 'Great place to stay.', 'google', null, null)"))).toMatch(/BAD_REVIEW/);
      const r = await one<{ id: string }>(q, "select public.admin_add_review('A Guest', 5, null, 'Great place to stay.', 'google', 'https://maps.app.goo.gl/x', null) as id");
      await q("select public.admin_moderate_review($1, 'approved')", [r.id]);
      await q("insert into storage.objects (bucket_id, name) values ('site-media', 'hero.jpg')");
      // Anonymous visitors now see the published page and the approved review, not the draft.
      await q("set local role anon");
      await q(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
      expect((await q<{ key: string }>("select key from site_content")).rows).toEqual([{ key: "home.hero" }]);
      expect((await q("select author_name from reviews")).rows.length).toBe(1);
    }));
});

/* ------------------------------------------------------------- manager */

describe("manager", () => {
  it("is refused everything until signed in with a second factor", async () => {
    await as(db, user(id.manager, false), async (q) => {
      expect((await q("select * from bookings")).rows).toEqual([]);
      expect((await one<{ m: { mfa_ok: boolean; requires_mfa: boolean } }>(q, "select public.my_access() as m")).m).toMatchObject({ requires_mfa: true, mfa_ok: false });
    });
    expect(await rejects(as(db, user(id.manager, false), (q) => q("select public.admin_set_status($1, 'confirmed')", [bookingA])))).toMatch(/MFA_REQUIRED/);
  });

  it("with MFA: sets prices, blocks rooms, reads the audit log", () =>
    as(db, user(id.manager, true), async (q) => {
      expect((await q("update room_types set price_bdt = 3600 where slug = 'deluxe-couple'")).affectedRows).toBe(1);
      await q("select public.admin_block_room($1, current_date + 100, current_date + 103, 'Repainting')", [roomA]);
      const free = await one<{ n: number }>(q, "select public._free_units(room_type_id, current_date + 100, current_date + 101, null) as n from rooms where id = $1", [roomA]).catch(() => null);
      expect(free).toBeNull(); // _free_units is internal even for managers
      const log = (await q<{ table_name: string; actor_role: string }>("select table_name, actor_role from admin_audit_log('room_types')")).rows;
      expect(log[0]).toMatchObject({ table_name: "room_types", actor_role: "manager" });
    }));

  it("blocks reduce what the website can sell", () =>
    as(db, user(id.manager, true), async (q) => {
      const type = await one<{ room_type_id: string; slug: string }>(q, "select r.room_type_id, t.slug from rooms r join room_types t on t.id = r.room_type_id where r.id = $1", [roomA]);
      const before = await one<{ available: number }>(q, "select available from room_availability(current_date + 200, current_date + 201) where slug = $1", [type.slug]);
      await q("select public.admin_block_room($1, current_date + 200, current_date + 202, 'Plumbing')", [roomA]);
      const after = await one<{ available: number }>(q, "select available from room_availability(current_date + 200, current_date + 201) where slug = $1", [type.slug]);
      expect(after.available).toBe(before.available - 1);
    }));

  it("manages the team below them only", () =>
    as(db, user(id.manager, true), async (q) => {
      await q("select public.admin_upsert_staff($1, 'New Desk', 'receptionist')", [id.newcomer]);
      expect(await rejects(q("select public.admin_set_staff_role($1, 'manager')", [id.newcomer]))).toMatch(/RANK/);
      expect(await rejects(q("select public.admin_set_staff_role($1, 'owner')", [id.newcomer]))).toMatch(/RANK/);
      expect(await rejects(q("select public.admin_set_staff_active($1, false)", [id.superAdmin]))).toMatch(/RANK/);
      expect(await rejects(q("select public.admin_set_staff_role($1, 'owner')", [id.manager]))).toMatch(/SELF_CHANGE/);
      expect(await rejects(q("update staff set role = 'owner' where user_id = $1", [id.manager]))).toMatch(/permission denied/);
    }));

  it("can't approve refunds (finance or owner does)", () =>
    as(db, user(id.manager, true), async (q) => {
      await q("select public.admin_record_payment($1, 3000, 'cash', '')", [bookingB]);
      const r = await one<{ id: string }>(q, "select public.admin_request_refund($1, 1000, 'cash', 'Overcharged') as id", [bookingB]);
      expect(await rejects(q("select public.admin_decide_refund($1, true)", [r.id]))).toMatch(/NOT_ALLOWED/);
    }));
});

/* ------------------------------------------------------------- finance */

describe("finance", () => {
  it("approves and completes someone else's refund; paid amount follows the ledger", () =>
    as(db, user(id.reception), async (q) => {
      await q("select public.admin_record_payment($1, 3000, 'bkash', '')", [bookingB]);
      const r = await one<{ id: string }>(q, "select public.admin_request_refund($1, 1000, 'bkash', 'Room change') as id", [bookingB]);
      await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: id.finance, role: "authenticated", aal: "aal2" })]);
      await q("select public.admin_decide_refund($1, true)", [r.id]);
      await q("select public.admin_complete_refund($1, 'BK-778')", [r.id]);
      const b = await one<{ amount_paid_bdt: number }>(q, "select amount_paid_bdt from bookings where id = $1", [bookingB]);
      expect(b.amount_paid_bdt).toBe(2000);
      expect(await rejects(q("select public.admin_set_status($1, 'confirmed')", [bookingB]))).toMatch(/NOT_ALLOWED/);
    }));

  it("can't approve their own refund request (four eyes)", () =>
    as(db, user(id.finance, true), async (q) => {
      await q("select public.admin_record_payment($1, 1000, 'cash', '')", [bookingB]);
      const r = await one<{ id: string }>(q, "select public.admin_request_refund($1, 500, 'cash', 'Mine') as id", [bookingB]);
      expect(await rejects(q("select public.admin_decide_refund($1, true)", [r.id]))).toMatch(/SAME_PERSON/);
    }));

  it("needs MFA too", async () => {
    expect(await rejects(as(db, user(id.finance, false), (q) => q("select public.admin_void_payment(gen_random_uuid(), 'x')")))).toMatch(/MFA_REQUIRED/);
  });
});

/* --------------------------------------------------------------- owner */

describe("owner", () => {
  it("appoints any role, including another owner", () =>
    as(db, user(id.owner, true), async (q) => {
      await q("select public.admin_upsert_staff($1, 'Second Owner', 'owner')", [id.owner2]);
      await q("select public.admin_set_staff_role($1, 'manager')", [id.superAdmin]);
      expect((await one<{ role: string }>(q, "select role from staff where user_id = $1", [id.superAdmin])).role).toBe("manager");
    }));

  it("the last owner can't be removed, and nobody changes their own role", () =>
    as(db, user(id.owner, true), async (q) => {
      expect(await rejects(q("select public.admin_set_staff_role($1, 'manager')", [id.owner]))).toMatch(/SELF_CHANGE/);
      await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: id.superAdmin, role: "authenticated", aal: "aal2" })]);
      expect(await rejects(q("select public.admin_set_staff_active($1, false)", [id.owner]))).toMatch(/RANK/);
    }));

  it("every role change is in the audit log, and the log can't be altered", async () => {
    await as(db, user(id.owner, true), async (q) => {
      await q("select public.admin_upsert_staff($1, 'Audit Me', 'housekeeping')", [id.newcomer]);
      const rows = (await q<{ action: string; actor_name: string; new_data: { role: string } }>("select action, actor_name, new_data from admin_audit_log('staff', $1)", [id.newcomer])).rows;
      expect(rows[0]).toMatchObject({ action: "INSERT", actor_name: "Olivia Owner", new_data: { role: "housekeeping" } });
      expect(await rejects(q("update audit.logs set actor = null"))).toMatch(/permission denied/);
    });
    // Even the database owner can't rewrite history (short of dropping the trigger).
    await db.query("insert into audit.logs (action, table_name) values ('INSERT', 'test')");
    expect(await rejects(db.query("update audit.logs set table_name = 'tampered'"))).toMatch(/AUDIT_IMMUTABLE/);
    expect(await rejects(db.query("delete from audit.logs"))).toMatch(/AUDIT_IMMUTABLE/);
  });

  it("aal1 owner session is refused too", async () => {
    expect(await rejects(as(db, user(id.owner, false), (q) => q("select public.admin_upsert_staff($1, 'X', 'owner')", [id.newcomer])))).toMatch(/MFA_REQUIRED/);
  });
});

/* ------------------------------------------------------- notifications */

describe("notifications", () => {
  it("new website bookings reach the desk, and each person sees only their own inbox", async () => {
    await as(db, user(id.reception), async (q) => {
      const n = (await q<{ title: string }>("select title from notifications")).rows;
      expect(n.some((x) => x.title.includes(refA))).toBe(true);
      expect(await rejects(q("update notifications set read_at = now()"))).toMatch(/permission denied/);
      expect((await one<{ n: number }>(q, "select public.mark_notifications_read() as n")).n).toBeGreaterThan(0);
    });
    await as(db, user(id.housekeeper), async (q) => {
      expect((await q("select * from notifications")).rows).toEqual([]);
    });
  });
});

/* ----------------------------------------------------- reviews by guests */

describe("guest reviews", () => {
  it("a finished stay can be reviewed once, and stays hidden until approved", async () => {
    const ref = (await one<{ reference: string }>(db.query.bind(db), "select reference from bookings where id = $1", [bookingDone])).reference;
    await as(db, anon, async (q) => {
      await q("select public.submit_review($1, '01711000001', 5, 'Lovely', 'Clean rooms and a great breakfast.')", [ref]);
      expect(await rejects(q("select public.submit_review($1, '01711000001', 4, '', 'Second review attempt here.')", [ref]))).toMatch(/ALREADY_REVIEWED/);
      expect((await q("select id, author_name, body from reviews")).rows).toEqual([]);
    });
  });
});
