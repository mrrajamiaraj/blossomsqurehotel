// The booking-engine rollback returns the schema to exactly the previous release,
// and the previous flows work afterwards.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDevDatabase, type Db } from "./harness";

const PREVIOUS = "20261117204245_storage.sql";
const RELEASE = "20261118120000_booking_engine.sql";
const DOWN = readFileSync("supabase/rollbacks/20261118120000_booking_engine.down.sql", "utf8");

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
union all select 'trigger', tgrelid::regclass::text || ' ' || tgname from pg_trigger where not tgisinternal
order by 1, 2`;

let before: Db;
let after: Db;
const rows = async (d: Db) => (await d.query<{ k: string; i: string }>(SNAPSHOT)).rows.map((r) => `${r.k}: ${r.i}`);

beforeAll(async () => {
  [before, after] = await Promise.all([createDevDatabase({ upTo: PREVIOUS }), createDevDatabase({ upTo: RELEASE })]);
  // Use the engine first so the rollback meets real rows.
  await after.query(`select public._insert_booking('deluxe-couple', public._today() + 5, public._today() + 7, 1, 2, 0,
    'Roll Back', 'rb@example.com', '+8801711000444', '', null, '', false, 'website', 'pending', null)`);
  await after.query("select public.create_hold(public._today() + 9, public._today() + 10, 2, 0, '[{\"room_type\":\"deluxe-couple\"}]'::jsonb)");
  await after.exec(`begin; ${DOWN}; commit;`);
}, 120_000);

afterAll(async () => Promise.all([before?.close(), after?.close()]));

describe("booking-engine rollback", () => {
  it("restores the previous schema exactly", async () => {
    const a = await rows(before);
    const b = await rows(after);
    expect(b.filter((x) => !a.includes(x))).toEqual([]);
    expect(a.filter((x) => !b.includes(x))).toEqual([]);
  });

  it("keeps existing bookings and the previous website booking works again", async () => {
    expect((await after.query<{ n: number }>("select count(*)::int n from bookings")).rows[0].n).toBe(1);
    const ref = (await after.query<{ r: string }>(
      "select public.create_booking('deluxe-couple', public._today() + 20, public._today() + 22, 1, 2, 0, 'After Rollback', 'ar@example.com', '+8801711000555', '', '', '', false) as r",
    ).catch(async () =>
      // _today() is dropped by the rollback; use the date directly.
      after.query<{ r: string }>(
        "select public.create_booking('deluxe-couple', (now() at time zone 'Asia/Dhaka')::date + 20, (now() at time zone 'Asia/Dhaka')::date + 22, 1, 2, 0, 'After Rollback', 'ar@example.com', '+8801711000555', '', '', '', false) as r",
      ),
    )).rows[0].r;
    expect(ref).toMatch(/^BSQ-\d{5}$/);
  });

  it("refuses to run while a reservation mixes room types", async () => {
    const db = await createDevDatabase({ upTo: RELEASE });
    try {
      await db.query(`select public._reserve('website', 'pending', public._today() + 3, public._today() + 4, 2, 0,
        array[(select id from room_types where slug = 'deluxe-couple'), (select id from room_types where slug = 'connecting-king-suite')],
        array[null, null]::uuid[], null, 'Mixed', 'mx@example.com', '+8801711000666', '', '', '', null, false, 'pay_at_hotel', null, null)`);
      await expect(db.exec(`begin; ${DOWN}; commit;`)).rejects.toThrow(/mix room types/);
    } finally {
      await db.close();
    }
  });
});
