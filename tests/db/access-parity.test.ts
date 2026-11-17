// The TypeScript copy of roles and permissions (src/lib/access.ts) must match
// the database seed exactly; the UI relies on it for menus and labels.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assignableRoles, canManage, PERMISSIONS, ROLE_PERMISSIONS, ROLES } from "@/lib/access";
import { createDevDatabase, type Db } from "./harness";

let db: Db;
beforeAll(async () => {
  db = await createDevDatabase();
}, 60_000);
afterAll(async () => db?.close());

describe("access model parity", () => {
  it("roles, ranks and MFA match", async () => {
    const { rows } = await db.query<{ code: string; name: string; rank: number; requires_mfa: boolean }>(
      "select code, name, rank, requires_mfa from private.roles order by rank desc",
    );
    expect(rows.map((r) => ({ code: r.code, name: r.name, rank: r.rank, requiresMfa: r.requires_mfa }))).toEqual(ROLES.map((r) => ({ ...r })));
  });

  it("permissions match", async () => {
    const { rows } = await db.query<{ code: string }>("select code from private.permissions order by code");
    expect(rows.map((r) => r.code)).toEqual([...PERMISSIONS].sort());
  });

  it("each role's permissions match", async () => {
    const { rows } = await db.query<{ role_code: string; perms: string[] }>(
      "select role_code, array_agg(permission_code order by permission_code) as perms from private.role_permissions group by role_code",
    );
    const db_ = Object.fromEntries(rows.map((r) => [r.role_code, r.perms]));
    for (const role of ROLES) expect(db_[role.code], role.code).toEqual([...ROLE_PERMISSIONS[role.code]].sort());
  });

  it("rank rules: below you only, owners may appoint owners", () => {
    expect(assignableRoles("manager")).toEqual(["finance", "receptionist", "content_editor", "housekeeping"]);
    expect(assignableRoles("owner")).toContain("owner");
    expect(assignableRoles("super_admin")).not.toContain("super_admin");
    expect(canManage("manager", "super_admin")).toBe(false);
    expect(canManage("owner", "owner")).toBe(true);
  });
});
