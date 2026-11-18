import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static guards for the security model. They read the source, so a mistake
 * fails `npm test` before it can reach a build or a deploy.
 */

const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");
const MIGRATIONS = join(ROOT, "supabase", "migrations");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const sourceFiles = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));
const read = (f: string) => readFileSync(f, "utf8");
const rel = (f: string) => relative(ROOT, f).replace(/\\/g, "/");
const isClientModule = (src: string) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(src);

describe("Supabase keys never reach the browser", () => {
  it("no source file reads a secret key through a NEXT_PUBLIC_ variable", () => {
    const offenders = sourceFiles.filter((f) => /NEXT_PUBLIC_[A-Z_]*(SECRET|SERVICE_ROLE)/.test(read(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it("only the server-only admin module reads the secret / service-role key", () => {
    const readers = sourceFiles.filter((f) => /process\.env\.(SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY)/.test(read(f)));
    expect(readers.map(rel)).toEqual(["src/lib/supabase/admin.ts"]);
  });

  it("server-side Supabase modules are guarded with server-only", () => {
    for (const f of ["admin.ts", "server.ts", "index.ts"]) {
      expect(read(join(SRC, "lib", "supabase", f)), f).toMatch(/^import "server-only";/);
    }
  });

  it("client components import only the browser Supabase client", () => {
    const offenders = sourceFiles.filter((f) => {
      const src = read(f);
      if (!isClientModule(src)) return false;
      return /from ["']@\/lib\/supabase(?:\/(?:server|admin|index))?["']/.test(src) || /lib\/data\/(supabase-repo|index)/.test(src);
    });
    expect(offenders.map(rel)).toEqual([]);
  });
});

describe("Payment and messaging secrets never reach the browser", () => {
  const SECRET_ENV = /(RESEND_API_KEY|RESEND_WEBHOOK_SECRET|WHATSAPP_ACCESS_TOKEN|WHATSAPP_APP_SECRET|WHATSAPP_VERIFY_TOKEN|BKASH_[A-Z_]+|SSLCOMMERZ_[A-Z_]+|NAGAD_[A-Z_]+|CRON_SECRET)/;
  const isRoute = (f: string) => /src[\\/]app[\\/]api[\\/].*route\.ts$/.test(f);

  it("no NEXT_PUBLIC_ variable carries a payment or messaging secret", () => {
    const offenders = sourceFiles.filter((f) => new RegExp(`NEXT_PUBLIC_${SECRET_ENV.source}`).test(read(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it("only server-only modules and API route handlers read those secrets", () => {
    const readers = sourceFiles.filter((f) => SECRET_ENV.test(read(f)) && /process\.env|env\(/.test(read(f)));
    expect(readers.length).toBeGreaterThan(3);
    const unsafe = readers.filter((f) => !isRoute(f) && !/^import "server-only";/m.test(read(f)) && !/messaging[\\/]templates\.ts$/.test(f));
    expect(unsafe.map(rel)).toEqual([]);
  });

  it("client components don't import the gateway, provider or worker modules", () => {
    const offenders = sourceFiles.filter((f) => {
      const src = read(f);
      if (!isClientModule(src)) return false;
      return /from ["']@\/lib\/(payments\/(gateways|service|guest)|messaging\/(providers|worker)|integrations|data\/payments)["']/.test(src.replace(/import type [^;]+;/g, ""));
    });
    expect(offenders.map(rel)).toEqual([]);
  });
});

describe("Database migrations", () => {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  const sql = files.map((f) => read(join(MIGRATIONS, f))).join("\n");

  it("use unique 14-digit versions", () => {
    const versions = files.map((f) => f.split("_")[0]);
    expect(versions.every((v) => /^\d{14}$/.test(v))).toBe(true);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("enable Row Level Security on every public table", () => {
    const tables = [...sql.matchAll(/create table (?:if not exists )?public\.(\w+)/gi)].map((m) => m[1]);
    expect(tables.length).toBeGreaterThan(0);
    const missing = tables.filter(
      (t) => !new RegExp(`alter table public\\.${t} enable row level security`, "i").test(sql),
    );
    expect(missing).toEqual([]);
  });

  it("pin search_path on every SECURITY DEFINER function", () => {
    // Each `security definer` must be followed (within the header) by `set search_path`.
    const headers = [...sql.matchAll(/security definer([\s\S]{0,120})/gi)].map((m) => m[1]);
    expect(headers.every((h) => /set search_path/i.test(h))).toBe(true);
  });
});
