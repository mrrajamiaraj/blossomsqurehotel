// The CMS & operations rollback returns the schema to exactly the booking-engine
// release, keeps bookings and published content, and the previous flows work.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDevDatabase, type Db } from "./harness";

const PREVIOUS = "20261118120000_booking_engine.sql";
const RELEASE = "20261118180000_cms_and_operations.sql";
const DOWN = readFileSync("supabase/rollbacks/20261118180000_cms_and_operations.down.sql", "utf8");

const SNAPSHOT = `
select 'table' k, n.nspname || '.' || c.relname || ' rls=' || c.relrowsecurity i
  from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind in ('r', 'v') and n.nspname in ('public', 'private', 'audit')
union all select 'column', table_name || '.' || column_name || ' ' || data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '')
  from information_schema.columns where table_schema = 'public'
union all select 'constraint', conrelid::regclass::text || ' ' || conname || ' ' || pg_get_constraintdef(oid) from pg_constraint where connamespace = 'public'::regnamespace
union all select 'index', indexname || ' ' || indexdef from pg_indexes where schemaname = 'public'
union all select 'function', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || md5(p.prosrc) || ' ' || p.prosecdef || ' ' || coalesce(array_to_string(p.proconfig, ','), '')
  from pg_proc p where p.pronamespace = 'public'::regnamespace
union all select 'execute', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || r.rolname
  from pg_proc p cross join (values ('anon'), ('authenticated'), ('service_role')) r(rolname)
  where p.pronamespace = 'public'::regnamespace and has_function_privilege(r.rolname, p.oid, 'execute')
union all select 'policy', tablename || ' ' || policyname || ' ' || coalesce(qual, '') || ' ' || coalesce(with_check, '') from pg_policies where schemaname in ('public', 'storage')
union all select 'grant', grantee || ' ' || table_name || ' ' || privilege_type from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated')
union all select 'colgrant', grantee || ' ' || table_name || '.' || column_name || ' ' || privilege_type from information_schema.column_privileges where table_schema = 'public' and grantee in ('anon', 'authenticated')
union all select 'trigger', tgrelid::regclass::text || ' ' || tgname from pg_trigger where not tgisinternal
order by 1, 2`;

let before: Db;
let after: Db;
const rows = async (d: Db) => (await d.query<{ k: string; i: string }>(SNAPSHOT)).rows.map((r) => `${r.k}: ${r.i}`);

beforeAll(async () => {
  [before, after] = await Promise.all([createDevDatabase({ upTo: PREVIOUS }), createDevDatabase({ upTo: RELEASE })]);
  // Use the release first so the rollback meets real rows.
  await after.query(`insert into promotions (code, name, discount_type, discount_value, starts_on, ends_on, is_active)
                     values ('ROLL10', 'Roll', 'percent', 10, public._today(), public._today() + 60, true)`);
  await after.query(`select public._reserve('website', 'pending', public._today() + 5, public._today() + 7, 2, 0,
    array[(select id from room_types where slug = 'deluxe-couple')], array[null]::uuid[], 'ROLL10', 'Roll Back', 'rb@example.com',
    '+8801711000444', '', '', '', null, false, 'pay_at_hotel', null, null)`);
  await after.query(`insert into site_content (key, title, body, status, version) values ('home', null, '{"hero_title":"Live"}', 'published', 1)`);
  await after.query(`update site_content set draft_body = '{"hero_title":"Unpublished"}' where key = 'home'`);
  await after.query(`insert into site_content (key, body, status, draft_body) values ('faq', '{}', 'draft', '{"intro":"Only a draft"}')`);
  await after.query("update rooms set housekeeping = 'cleaning' where number = (select min(number) from rooms)");
  await after.exec(`begin; ${DOWN}; commit;`);
}, 120_000);

afterAll(async () => Promise.all([before?.close(), after?.close()]));

describe("CMS & operations rollback", () => {
  it("restores the previous schema exactly", async () => {
    const a = await rows(before);
    const b = await rows(after);
    expect(b.filter((x) => !a.includes(x))).toEqual([]);
    expect(a.filter((x) => !b.includes(x))).toEqual([]);
  });

  it("keeps bookings with their discount, published text, and old-style drafts", async () => {
    const b = (await after.query<{ discount_bdt: number; promo: string }>(
      "select b.discount_bdt, p.code promo from bookings b join promotions p on p.id = b.promotion_id")).rows;
    expect(b).toHaveLength(1);
    expect(b[0].promo).toBe("ROLL10");
    expect(b[0].discount_bdt).toBeGreaterThan(0);
    const content = (await after.query<{ key: string; status: string; body: { hero_title?: string; intro?: string } }>(
      "select key, status, body from site_content order by key")).rows;
    expect(content).toEqual([
      { key: "faq", status: "draft", body: { intro: "Only a draft" } },
      { key: "home", status: "published", body: { hero_title: "Live" } },
    ]);
    expect((await after.query("select 1 from rooms where housekeeping = 'cleaning'")).rows).toEqual([]);
  });

  it("the previous booking flow and promo codes work after rollback", async () => {
    const h = (await after.query<{ h: { quote: { discount: number } } }>(
      "select public.create_hold(public._today() + 20, public._today() + 22, 2, 0, '[{\"room_type\":\"deluxe-couple\"}]'::jsonb, 'roll10') as h")).rows[0].h;
    expect(h.quote.discount).toBeGreaterThan(0);
  });
});
