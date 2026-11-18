// The hotel's own setting (20261119120000): no role is forced to use an
// authenticator app, so a password-only (aal1) session gets the role's normal
// permissions. Permissions still apply — the code only removes the second step.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createDevDatabase, rejects, type Actor, type Db } from "./harness";

let db: Db;
const id = { owner: randomUUID(), finance: randomUUID(), desk: randomUUID() };
const aal1 = (uid: string): Actor => ({ kind: "user", id: uid, aal: "aal1" });

beforeAll(async () => {
  db = await createDevDatabase();
  for (const [uid, name, role] of [[id.owner, "Olivia Owner", "owner"], [id.finance, "Farah Finance", "finance"], [id.desk, "Rana Desk", "receptionist"]]) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [uid, `${uid.slice(0, 8)}@hotel.test`]);
    await db.query("insert into staff (user_id, full_name, role) values ($1, $2, $3)", [uid, name, role]);
  }
}, 60_000);
afterAll(async () => db?.close());

describe("authenticator app optional", () => {
  it("no role requires it", async () => {
    const r = await db.query<{ n: number }>("select count(*)::int n from private.roles where requires_mfa");
    expect(r.rows[0].n).toBe(0);
  });

  it("an owner signed in with just a password has full access", async () => {
    const a = await as(db, aal1(id.owner), async (q) => (await q<{ a: { mfa_ok: boolean; permissions: string[] } }>("select public.my_access() a")).rows[0].a);
    expect(a.mfa_ok).toBe(true);
    expect(a.permissions).toContain("staff.manage");
    const log = await as(db, aal1(id.owner), async (q) => (await q("select * from public.admin_audit_log(null, null, 5)")).rows);
    expect(Array.isArray(log)).toBe(true);
  });

  it("finance works with just a password; roles still limit what each person can do", async () => {
    const f = await as(db, aal1(id.finance), async (q) => (await q<{ a: { permissions: string[] } }>("select public.my_access() a")).rows[0].a);
    expect(f.permissions).toContain("payments.record");
    expect(f.permissions).toContain("refunds.approve");
    expect(await rejects(as(db, aal1(id.desk), async (q) => q("select * from public.admin_audit_log(null, null, 5)")))).toMatch(/NOT_ALLOWED/);
  });
});
