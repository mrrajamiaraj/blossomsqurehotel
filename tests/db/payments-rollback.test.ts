// The payments & messaging rollback returns the schema to exactly the CMS &
// operations release, keeps the ledger, and the previous flows still work.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDevDatabase, type Db } from "./harness";

const PREVIOUS = "20261118180000_cms_and_operations.sql";
const RELEASE = "20261118230000_payments_and_messaging.sql";
const DOWN = readFileSync("supabase/rollbacks/20261118230000_payments_and_messaging.down.sql", "utf8");

const SNAPSHOT = `
select 'table' k, n.nspname || '.' || c.relname || ' rls=' || c.relrowsecurity i
  from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind in ('r', 'v', 'S') and n.nspname in ('public', 'private', 'audit')
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
  await after.query(`select public._reserve('website', 'pending', public._today() + 5, public._today() + 7, 2, 0,
    array[(select id from room_types where slug = 'deluxe-couple')], array[null]::uuid[], null, 'Roll Back', 'rb@example.com',
    '+8801711000444', '', '', '', null, false, 'pay_at_hotel', null, null)`);
  await after.query("insert into payments (booking_id, amount_bdt, method) select id, 1000, 'cash' from bookings");
  await after.query(`insert into payments (booking_id, amount_bdt, method, status, source, reference)
                     select id, 500, 'bank', 'pending', 'guest', 'EBL-ROLL-1' from bookings`);
  await after.query("select public._invoice_json(id, true) from bookings");
  await after.exec(`begin; ${DOWN}; commit;`);
}, 120_000);

afterAll(async () => Promise.all([before?.close(), after?.close()]));

describe("payments & messaging rollback", () => {
  it("restores the previous schema exactly", async () => {
    const a = await rows(before);
    const b = await rows(after);
    expect(b.filter((x) => !a.includes(x))).toEqual([]);
    expect(a.filter((x) => !b.includes(x))).toEqual([]);
  });

  it("keeps the ledger: confirmed money counts, reported transfers stay pending", async () => {
    const p = (await after.query<{ amount_bdt: number; status: string }>("select amount_bdt, status from payments order by amount_bdt")).rows;
    expect(p).toEqual([
      { amount_bdt: 500, status: "pending" },
      { amount_bdt: 1000, status: "confirmed" },
    ]);
    expect((await after.query<{ amount_paid_bdt: number }>("select amount_paid_bdt from bookings")).rows[0].amount_paid_bdt).toBe(1000);
  });

  it("the previous booking flow works after rollback", async () => {
    const h = (await after.query<{ h: { quote: { total: number } } }>(
      "select public.create_hold(public._today() + 20, public._today() + 22, 2, 0, '[{\"room_type\":\"deluxe-couple\"}]'::jsonb) as h")).rows[0].h;
    expect(h.quote.total).toBeGreaterThan(0);
  });
});
