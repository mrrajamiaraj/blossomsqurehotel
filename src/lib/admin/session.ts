import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { isStaffRole, permissionsOf, roleInfo, type Access, type Permission, type StaffRole } from "../access";
import { previewEnabled } from "../data";
import { PreviewRepo } from "../data/preview-repo";
import type { AdminRepo } from "../data/repo";
import { SupabaseRepo } from "../data/supabase-repo";
import { getSessionClient, isSupabaseConfigured } from "../supabase";

export type AdminContext = {
  mode: "live" | "preview";
  repo: AdminRepo;
  staff: { id: string; name: string; role: StaffRole; email: string | null };
  access: Access;
};

type Problem = "not_configured" | "signed_out" | "no_access" | "mfa_required";
type Resolved = AdminContext | { problem: Problem; name?: string; role?: StaffRole };

export const PREVIEW_ROLE_COOKIE = "bsq-preview-role";

/**
 * Who is at the desk, resolved once per request.
 *
 * Live: getUser() re-validates the session with Supabase Auth, the staff row
 * must be active, and my_access() (in the database) reports the role, its
 * permissions and whether this session satisfies MFA. Privileged roles
 * without a second factor are sent to /admin/mfa — the database refuses
 * them anyway, this just explains why.
 */
export const resolveAdmin = cache(async (): Promise<Resolved> => {
  // Admin pages are per-request and per-user: never prerender or cache them.
  await connection();
  if (previewEnabled()) {
    const cookie = (await cookies()).get(PREVIEW_ROLE_COOKIE)?.value;
    const role: StaffRole = isStaffRole(cookie) ? cookie : "manager";
    const name = `${roleInfo(role).name} (preview)`;
    return {
      mode: "preview",
      repo: new PreviewRepo({ name, role }),
      staff: { id: `preview-${role}`, name, role, email: null },
      access: { role, permissions: permissionsOf(role), requiresMfa: roleInfo(role).requiresMfa, mfaOk: true },
    };
  }
  if (!isSupabaseConfigured()) return { problem: "not_configured" };

  const db = await getSessionClient();
  const { data } = await db.auth.getUser();
  if (!data.user) return { problem: "signed_out" };

  const [{ data: member }, { data: raw }] = await Promise.all([
    db.from("staff").select("full_name, role, active").eq("user_id", data.user.id).maybeSingle(),
    db.rpc("my_access"),
  ]);
  if (!member || !member.active || !isStaffRole(member.role)) return { problem: "no_access" };

  const info = (raw ?? {}) as { permissions?: string[]; requires_mfa?: boolean; mfa_ok?: boolean };
  const access: Access = {
    role: member.role,
    permissions: (info.permissions ?? []) as Permission[],
    requiresMfa: Boolean(info.requires_mfa),
    mfaOk: Boolean(info.mfa_ok),
  };
  if (access.requiresMfa && !access.mfaOk) return { problem: "mfa_required", name: member.full_name, role: member.role };

  return {
    mode: "live",
    repo: new SupabaseRepo(db),
    staff: { id: data.user.id, name: member.full_name, role: member.role, email: data.user.email ?? null },
    access,
  };
});

/** For admin pages and actions: the context, or a redirect to sign-in / setup / MFA. */
export async function requireAdmin(): Promise<AdminContext> {
  const ctx = await resolveAdmin();
  if ("problem" in ctx) {
    if (ctx.problem === "not_configured") redirect("/admin/setup");
    if (ctx.problem === "mfa_required") redirect("/admin/mfa");
    redirect(ctx.problem === "no_access" ? "/admin/login?error=no_access" : "/admin/login");
  }
  return ctx;
}

/** Pages and actions that need one permission. The database checks it again. */
export async function requirePermission(permission: Permission): Promise<AdminContext> {
  const ctx = await requireAdmin();
  if (!ctx.access.permissions.includes(permission)) redirect("/admin?error=not_allowed");
  return ctx;
}

/** @deprecated use requirePermission with the specific permission. */
export async function requireManager(): Promise<AdminContext> {
  return requirePermission("settings.manage");
}
