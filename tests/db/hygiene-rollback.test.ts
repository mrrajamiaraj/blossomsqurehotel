// The operational-hygiene rollback returns the schema to exactly the
// content-editor release (functions, triggers, privileges).
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDevDatabase, type Db } from "./harness";

const PREVIOUS = "20261119090000_content_editor_room_copy.sql";
const DOWN = readFileSync("supabase/rollbacks/20261119100000_operational_hygiene.down.sql", "utf8");

const SNAPSHOT = `
select 'function' k, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || md5(p.prosrc) i from pg_proc p where p.pronamespace = 'public'::regnamespace
union all select 'execute', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || r.rolname
  from pg_proc p cross join (values ('anon'), ('authenticated'), ('service_role')) r(rolname)
  where p.pronamespace = 'public'::regnamespace and has_function_privilege(r.rolname, p.oid, 'execute')
union all select 'trigger', tgrelid::regclass::text || ' ' || tgname from pg_trigger where not tgisinternal
order by 1, 2`;

let before: Db;
let after: Db;
const rows = async (d: Db) => (await d.query<{ k: string; i: string }>(SNAPSHOT)).rows.map((r) => `${r.k}: ${r.i}`);

beforeAll(async () => {
  [before, after] = await Promise.all([createDevDatabase({ upTo: PREVIOUS }), createDevDatabase()]);
  await after.exec(`begin; ${DOWN}; commit;`);
}, 120_000);
afterAll(async () => Promise.all([before?.close(), after?.close()]));

describe("operational hygiene rollback", () => {
  it("restores functions, triggers and EXECUTE rights exactly", async () => {
    const a = await rows(before);
    const b = await rows(after);
    expect(b.filter((x) => !a.includes(x))).toEqual([]);
    expect(a.filter((x) => !b.includes(x))).toEqual([]);
  });
});
