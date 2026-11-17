// Replays every migration into a fresh in-process PostgreSQL and prints a
// summary. `npm run db:dev:check`. Exits non-zero on the first failing migration.
import { createDevDatabase, migrationFiles } from "../tests/db/harness";

const started = Date.now();
const db = await createDevDatabase();
const { rows } = await db.query<{ schema: string; tables: number; rls_off: string[] }>(`
  select n.nspname as schema,
         count(*)::int as tables,
         coalesce(array_agg(c.relname) filter (where not c.relrowsecurity), '{}') as rls_off
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'r' and n.nspname in ('public', 'private', 'audit')
  group by n.nspname order by 1`);
console.log(`Applied ${migrationFiles().length} migrations in ${Date.now() - started} ms`);
for (const r of rows) console.log(`  ${r.schema}: ${r.tables} tables${r.rls_off.length ? `  (RLS off: ${r.rls_off.join(", ")})` : ""}`);
await db.close();
