// Proves the rollback script: (all migrations + rollback) leaves exactly the
// schema that existed before the access-architecture migrations, and the app's
// existing flows still work afterwards.
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createDevDatabase, type Db } from "./harness";

const BEFORE = "20261117194819_guest_services_staff_grant.sql";
const DOWN = readFileSync("supabase/rollbacks/20261118100000_access_architecture.down.sql", "utf8");

// Everything that defines the API surface and its security.
const SNAPSHOT = `
select 'table' as kind, n.nspname || '.' || c.relname || ' rls=' || c.relrowsecurity as item
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'v') and n.nspname in ('public', 'private', 'audit')
union all
select 'column', table_name || '.' || column_name || ' ' || data_type || ' null=' || is_nullable || ' def=' || coalesce(column_default, '')
  from information_schema.columns where table_schema = 'public'
union all
select 'constraint', conrelid::regclass::text || ' ' || conname || ' ' || pg_get_constraintdef(oid)
  from pg_constraint where connamespace = 'public'::regnamespace
union all
select 'index', schemaname || '.' || indexname || ' ' || indexdef from pg_indexes where schemaname = 'public'
union all
select 'function', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') definer=' || p.prosecdef
       || ' config=' || coalesce(array_to_string(p.proconfig, ','), '') || ' body=' || md5(regexp_replace(p.prosrc, '\\s+', ' ', 'g'))
  from pg_proc p where p.pronamespace = 'public'::regnamespace
union all
select 'policy', schemaname || '.' || tablename || ' ' || policyname || ' ' || cmd || ' ' || array_to_string(roles, ',')
       || ' using=' || coalesce(qual, '') || ' check=' || coalesce(with_check, '')
  from pg_policies where schemaname in ('public', 'storage')
union all
select 'grant', grantee || ' ' || table_name || ' ' || privilege_type
  from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated')
union all
select 'colgrant', grantee || ' ' || table_name || '.' || column_name || ' ' || privilege_type
  from information_schema.column_privileges where table_schema = 'public' and grantee in ('anon', 'authenticated')
    and (grantee, table_name, privilege_type) not in (select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema = 'public')
union all
select 'execute', p.proname || ' ' || r.rolname
  from pg_proc p cross join (values ('anon'), ('authenticated')) r(rolname)
  where p.pronamespace = 'public'::regnamespace and has_function_privilege(r.rolname, p.oid, 'execute')
union all
select 'trigger', tgrelid::regclass::text || ' ' || tgname from pg_trigger where not tgisinternal
union all
select 'bucket', id || ' public=' || public from storage.buckets
union all
select 'schema', nspname from pg_namespace where nspname in ('private', 'audit')
order by 1, 2`;

let before: Db;
let after: Db;

beforeAll(async () => {
  [before, after] = await Promise.all([createDevDatabase({ upTo: BEFORE }), createDevDatabase()]);
  // Some real use first, so the rollback has data and staff roles to deal with.
  const owner = randomUUID();
  const desk = randomUUID();
  await after.query("insert into auth.users (id, email) values ($1, 'o@x.test'), ($2, 'd@x.test')", [owner, desk]);
  await after.query("insert into staff (user_id, full_name, role) values ($1, 'Owner', 'owner'), ($2, 'Desk', 'receptionist')", [owner, desk]);
  await after.query(
    "select public.create_booking('deluxe-couple', current_date + 10, current_date + 12, 1, 2, 0, 'Roll Back', 'rb@example.com', '+880 1711-111111', '', '', '', false)",
  );
  await after.exec(`begin; ${DOWN}; commit;`);
}, 120_000);

afterAll(async () => {
  await Promise.all([before?.close(), after?.close()]);
});

describe("rollback of the access-architecture migrations", () => {
  it("restores the schema exactly", async () => {
    const a = (await before.query<{ kind: string; item: string }>(SNAPSHOT)).rows.map((r) => `${r.kind}: ${r.item}`);
    const b = (await after.query<{ kind: string; item: string }>(SNAPSHOT)).rows.map((r) => `${r.kind}: ${r.item}`);
    expect(b.filter((x) => !a.includes(x))).toEqual([]);
    expect(a.filter((x) => !b.includes(x))).toEqual([]);
  });

  it("the comparison is sensitive: without the rollback, the schemas differ", async () => {
    const full = await createDevDatabase();
    try {
      const a = (await before.query<{ kind: string; item: string }>(SNAPSHOT)).rows.map((r) => `${r.kind}: ${r.item}`);
      const c = (await full.query<{ kind: string; item: string }>(SNAPSHOT)).rows.map((r) => `${r.kind}: ${r.item}`);
      expect(a.length).toBeGreaterThan(250);
      const added = c.filter((x) => !a.includes(x));
      expect(added.length).toBeGreaterThan(100);
      expect(added.some((x) => x.startsWith("function: _free_units"))).toBe(true); // changed body is detected
      expect(added.some((x) => x.startsWith("policy: public.bookings bookings: bookings.read"))).toBe(true);
    } finally {
      await full.close();
    }
  });

  it("keeps the data that existed, and maps staff back to the two old roles", async () => {
    expect((await after.query<{ n: number }>("select count(*)::int as n from bookings")).rows[0].n).toBe(1);
    expect((await after.query<{ role: string }>("select role from staff order by role")).rows.map((r) => r.role)).toEqual(["front_desk", "manager"]);
  });

  it("the existing desk flow works again with the old roles", async () => {
    const mgr = (await after.query<{ user_id: string }>("select user_id from staff where role = 'manager'")).rows[0].user_id;
    const b = (await after.query<{ id: string }>("select id from bookings limit 1")).rows[0].id;
    await as(after, { kind: "user", id: mgr }, async (q) => {
      await q("select public.admin_set_status($1, 'confirmed')", [b]);
      await q("select public.admin_record_payment($1, 1000, 'cash', '')", [b]);
      expect((await q<{ amount_paid_bdt: number }>("select amount_paid_bdt from bookings where id = $1", [b])).rows[0].amount_paid_bdt).toBe(1000);
    });
  });

  it("refuses to run while the private document bucket holds files", async () => {
    const db = await createDevDatabase();
    try {
      const bookingId = (await db.query<{ id: string }>(
        "select id from bookings where reference = public.create_booking('deluxe-couple', current_date + 10, current_date + 12, 1, 2, 0, 'Doc Test', 'doc@example.com', '+880 1711-222222', '', '', '', false)",
      )).rows[0]?.id;
      await db.query("insert into storage.objects (bucket_id, name) values ('guest-documents', $1)", [`bookings/${bookingId}/passport.pdf`]);
      await expect(db.exec(`begin; ${DOWN}; commit;`)).rejects.toThrow(/empty the site-media and guest-documents/);
      await db.exec("rollback").catch(() => undefined);
      expect((await db.query("select 1 from private.roles limit 1")).rows.length).toBe(1); // nothing was rolled back
    } finally {
      await db.close();
    }
  });
});
