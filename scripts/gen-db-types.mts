// Generates src/lib/supabase/database.types.ts from the migrations, in the
// same shape as `supabase gen types typescript`, by replaying them into the
// in-process development database. `npm run db:types:dev`.
//
// Use this while a migration isn't in any Supabase project yet; once it is,
// `npm run db:types` (from the linked project) gives the same result.
import { readFileSync, writeFileSync } from "node:fs";
import { createDevDatabase } from "../tests/db/harness";

const OUT = "src/lib/supabase/database.types.ts";
const db = await createDevDatabase();

const scalar = (udt: string): string => {
  if (udt.startsWith("_")) return `${scalar(udt.slice(1))}[]`;
  if (["int2", "int4", "int8", "numeric", "float4", "float8"].includes(udt)) return "number";
  if (udt === "bool") return "boolean";
  if (udt === "json" || udt === "jsonb") return "Json";
  return "string";
};

type Col = { table_name: string; column_name: string; udt_name: string; is_nullable: string; column_default: string | null; is_identity: string; identity_generation: string | null; is_generated: string };
const cols = (
  await db.query<Col>(`
    select c.table_name, c.column_name, c.udt_name, c.is_nullable, c.column_default, c.is_identity, c.identity_generation, c.is_generated
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
    order by c.table_name, c.column_name`)
).rows;
const viewCols = (
  await db.query<Col>(`
    select c.table_name, c.column_name, c.udt_name, 'YES' as is_nullable, null as column_default, 'NO' as is_identity, null as identity_generation, 'NEVER' as is_generated
    from information_schema.columns c join information_schema.views v on v.table_schema = c.table_schema and v.table_name = c.table_name
    where c.table_schema = 'public' order by c.table_name, c.column_name`)
).rows;
const fks = (
  await db.query<{ conname: string; tbl: string; cols: string[]; ref: string; refcols: string[]; one: boolean }>(`
    select con.conname, cl.relname as tbl,
      array(select a.attname from unnest(con.conkey) k join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k order by a.attname) as cols,
      rf.relname as ref,
      array(select a.attname from unnest(con.confkey) k join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k order by a.attname) as refcols,
      exists (select 1 from pg_index i where i.indrelid = con.conrelid and i.indisunique and i.indkey::int2[] @> con.conkey and array_length(i.indkey::int2[], 1) = array_length(con.conkey, 1)) as one
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid join pg_namespace n on n.oid = cl.relnamespace
    join pg_class rf on rf.oid = con.confrelid join pg_namespace rn on rn.oid = rf.relnamespace
    where con.contype = 'f' and n.nspname = 'public' and rn.nspname = 'public'
    order by cl.relname, con.conname`)
).rows;

const group = <T extends { table_name: string }>(rows: T[]) =>
  rows.reduce<Record<string, T[]>>((acc, r) => ((acc[r.table_name] ??= []).push(r), acc), {});

const pad = (n: number) => " ".repeat(n);
const tableBlock = (name: string, rows: Col[]) => {
  const row = rows.map((c) => `${pad(10)}${c.column_name}: ${scalar(c.udt_name)}${c.is_nullable === "YES" ? " | null" : ""}`);
  const ins = rows.map((c) => {
    const never = c.identity_generation === "ALWAYS" || c.is_generated === "ALWAYS";
    const optional = c.is_nullable === "YES" || c.column_default !== null || c.is_identity === "YES";
    return `${pad(10)}${c.column_name}${optional || never ? "?" : ""}: ${never ? "never" : `${scalar(c.udt_name)}${c.is_nullable === "YES" ? " | null" : ""}`}`;
  });
  const upd = rows.map((c) => {
    const never = c.identity_generation === "ALWAYS" || c.is_generated === "ALWAYS";
    return `${pad(10)}${c.column_name}?: ${never ? "never" : `${scalar(c.udt_name)}${c.is_nullable === "YES" ? " | null" : ""}`}`;
  });
  const rel = fks
    .filter((f) => f.tbl === name)
    .map(
      (f) =>
        `${pad(10)}{\n${pad(12)}foreignKeyName: "${f.conname}"\n${pad(12)}columns: [${f.cols.map((c) => `"${c}"`).join(", ")}]\n${pad(12)}isOneToOne: ${f.one}\n${pad(12)}referencedRelation: "${f.ref}"\n${pad(12)}referencedColumns: [${f.refcols.map((c) => `"${c}"`).join(", ")}]\n${pad(10)}},`,
    );
  return `${pad(6)}${name}: {\n${pad(8)}Row: {\n${row.join("\n")}\n${pad(8)}}\n${pad(8)}Insert: {\n${ins.join("\n")}\n${pad(8)}}\n${pad(8)}Update: {\n${upd.join("\n")}\n${pad(8)}}\n${pad(8)}Relationships: ${rel.length ? `[\n${rel.join("\n")}\n${pad(8)}]` : "[]"}\n${pad(6)}}`;
};

const viewBlock = (name: string, rows: Col[]) =>
  `${pad(6)}${name}: {\n${pad(8)}Row: {\n${rows.map((c) => `${pad(10)}${c.column_name}: ${scalar(c.udt_name)} | null`).join("\n")}\n${pad(8)}}\n${pad(8)}Relationships: []\n${pad(6)}}`;

type Fn = { name: string; args: { name: string; type: string; hasDefault: boolean }[]; ret: string; retset: boolean; cols: { name: string; type: string }[] | null };
const fnRows = (
  await db.query<{ proname: string; argnames: string[] | null; argtypes: string[]; nargdefaults: number; rettype: string; retset: boolean; outnames: string[] | null; outtypes: string[] | null }>(`
    select p.proname,
      p.proargnames as argnames,
      array(select t.typname from unnest(p.proargtypes::oid[]) with ordinality a(oid, i) join pg_type t on t.oid = a.oid order by a.i) as argtypes,
      p.pronargdefaults as nargdefaults,
      rt.typname as rettype, p.proretset as retset,
      case when p.proargmodes is not null then array(select p.proargnames[i] from generate_subscripts(p.proargmodes, 1) i where p.proargmodes[i] = 't') end as outnames,
      case when p.proargmodes is not null then array(select t.typname from generate_subscripts(p.proargmodes, 1) i join pg_type t on t.oid = p.proallargtypes[i] where p.proargmodes[i] = 't') end as outtypes
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type rt on rt.oid = p.prorettype
    where n.nspname = 'public' and p.prokind = 'f' and rt.typname <> 'trigger'
    order by p.proname`)
).rows;
const fns: Fn[] = fnRows.map((f) => ({
  name: f.proname,
  args: f.argtypes.map((t, i) => ({ name: f.argnames?.[i] ?? `arg${i}`, type: scalar(t), hasDefault: i >= f.argtypes.length - f.nargdefaults })),
  ret: f.rettype === "void" ? "undefined" : f.rettype === "record" ? "Json" : scalar(f.rettype),
  retset: f.retset,
  cols: f.outnames?.length ? f.outnames.map((n, i) => ({ name: n, type: scalar(f.outtypes![i]) })) : null,
}));

const fnBlock = (f: Fn) => {
  const args = f.args.length
    ? `{ ${[...f.args].sort((a, b) => a.name.localeCompare(b.name)).map((a) => `${a.name}${a.hasDefault ? "?" : ""}: ${a.type}`).join("; ")} }`
    : "never";
  const ret = f.cols
    ? `{\n${[...f.cols].sort((a, b) => a.name.localeCompare(b.name)).map((c) => `${pad(10)}${c.name}: ${c.type}`).join("\n")}\n${pad(8)}}[]`
    : `${f.ret}${f.retset ? "[]" : ""}`;
  return `${pad(6)}${f.name}: {\n${pad(8)}Args: ${args}\n${pad(8)}Returns: ${ret}\n${pad(6)}}`;
};

const tables = group(cols);
const views = group(viewCols);
const header = `// Generated by scripts/gen-db-types.mts from supabase/migrations. Do not edit by hand.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
${Object.entries(tables).map(([n, r]) => tableBlock(n, r)).join("\n")}
    }
    Views: {
${Object.entries(views).map(([n, r]) => viewBlock(n, r)).join("\n")}
    }
    Functions: {
${fns.map(fnBlock).join("\n")}
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
`;

// Keep the helper types (Tables<>, TablesInsert<>, …) from the current file.
const current = readFileSync(OUT, "utf8");
const tail = current.slice(current.indexOf("type DatabaseWithoutInternals"));
writeFileSync(OUT, `${header}\n${tail}`);
console.log(`Wrote ${OUT}: ${Object.keys(tables).length} tables, ${Object.keys(views).length} views, ${fns.length} functions`);
await db.close();
