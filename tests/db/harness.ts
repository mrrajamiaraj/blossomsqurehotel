// A disposable PostgreSQL (PGlite, in-process) with the parts of Supabase the
// migrations rely on: the anon / authenticated / service_role roles, auth.uid()
// and auth.jwt() driven by request.jwt.claims, auth.users, auth.mfa_factors and
// a minimal storage schema. Every migration in supabase/migrations is applied
// in filename order, exactly as `supabase db reset` would.
//
// Used by the RLS / permission tests; also runnable as a development database
// with `npm run db:dev`.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");

const SUPABASE_STUBS = `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role supabase_storage_admin nologin;
grant anon, authenticated, service_role to postgres;

create schema extensions;
create schema auth;
create schema storage;
grant usage on schema public, extensions, auth, storage to anon, authenticated, service_role;

-- Supabase grants every new public table/function to the API roles by default;
-- migrations are expected to tighten this (least_privilege_grants does).
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_app_meta_data jsonb not null default '{}',
  raw_user_meta_data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table auth.mfa_factors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  factor_type text not null default 'totp',
  status text not null default 'verified',
  created_at timestamptz not null default now()
);

create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', 'anon')
$$;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  owner uuid,
  created_at timestamptz not null default now()
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  metadata jsonb,
  created_at timestamptz not null default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
create policy "buckets readable" on storage.buckets for select using (true);
grant select on storage.buckets to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant all on storage.objects, storage.buckets to service_role;

create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
create function storage.filename(name text) returns text language sql immutable as $$
  select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)]
$$;
grant execute on all functions in schema storage to anon, authenticated, service_role;
`;

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => /^\d{14}_.+\.sql$/.test(f))
    .sort();
}

export type Db = PGlite;

/** A fresh database with every migration applied. */
export async function createDevDatabase(opts: { upTo?: string; dataDir?: string } = {}): Promise<Db> {
  const db = await PGlite.create(opts.dataDir ?? "memory://", { extensions: { btree_gist } });
  await db.exec(SUPABASE_STUBS);
  for (const file of migrationFiles()) {
    if (opts.upTo && file > opts.upTo) break;
    const sql = readFileSync(path.join(MIGRATIONS, file), "utf8");
    try {
      await db.exec(sql);
    } catch (err) {
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    }
  }
  return db;
}

export type Actor =
  | { kind: "anon" }
  | { kind: "user"; id: string; aal?: "aal1" | "aal2" }
  | { kind: "service" };

/**
 * Runs `fn` as an API caller, inside a transaction that is always rolled
 * back (so tests never leak state into each other). Mirrors what PostgREST
 * does: SET ROLE plus request.jwt.claims.
 */
export async function as<T>(db: Db, actor: Actor, fn: (q: Db["query"]) => Promise<T>): Promise<T> {
  const role = actor.kind === "anon" ? "anon" : actor.kind === "service" ? "service_role" : "authenticated";
  const claims =
    actor.kind === "user"
      ? { sub: actor.id, role: "authenticated", aal: actor.aal ?? "aal1" }
      : { role };
  await db.exec("begin");
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await db.exec(`set local role ${role}`);
    return await fn(db.query.bind(db));
  } finally {
    await db.exec("rollback");
  }
}

/** Like `as`, but commits (for fixtures created through the real functions). */
export async function commitAs<T>(db: Db, actor: Actor, fn: (q: Db["query"]) => Promise<T>): Promise<T> {
  const role = actor.kind === "anon" ? "anon" : actor.kind === "service" ? "service_role" : "authenticated";
  const claims = actor.kind === "user" ? { sub: actor.id, role: "authenticated", aal: actor.aal ?? "aal1" } : { role };
  await db.exec("begin");
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await db.exec(`set local role ${role}`);
    const out = await fn(db.query.bind(db));
    await db.exec("commit");
    return out;
  } catch (err) {
    await db.exec("rollback");
    throw err;
  } finally {
    await db.exec("reset role");
  }
}

/** Expect a call to fail; returns the error message. */
export async function rejects(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    return (err as Error).message;
  }
  throw new Error("Expected the call to be rejected, but it succeeded");
}
