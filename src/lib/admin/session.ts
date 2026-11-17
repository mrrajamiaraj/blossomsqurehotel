import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { previewEnabled } from "../data";
import { PreviewRepo } from "../data/preview-repo";
import type { AdminRepo } from "../data/repo";
import { SupabaseRepo } from "../data/supabase-repo";
import type { StaffRole } from "../data/types";
import { getSessionClient, isSupabaseConfigured } from "../supabase";

export type AdminContext = {
  mode: "live" | "preview";
  repo: AdminRepo;
  staff: { id: string; name: string; role: StaffRole; email: string | null };
};

type Resolved = AdminContext | { problem: "not_configured" | "signed_out" | "no_access" };

export const PREVIEW_ROLE_COOKIE = "bsq-preview-role";

/** Who is at the desk, resolved once per request. */
export const resolveAdmin = cache(async (): Promise<Resolved> => {
  // Admin pages are per-request and per-user: never prerender or cache them.
  await connection();
  if (previewEnabled()) {
    const role = (await cookies()).get(PREVIEW_ROLE_COOKIE)?.value === "front_desk" ? "front_desk" : "manager";
    const name = role === "manager" ? "Preview Manager" : "Front Desk (preview)";
    return {
      mode: "preview",
      repo: new PreviewRepo({ name, role }),
      staff: { id: `preview-${role}`, name, role, email: null },
    };
  }
  if (!isSupabaseConfigured()) return { problem: "not_configured" };

  const db = await getSessionClient();
  // getUser() re-validates the token with Supabase Auth (getSession() would trust the cookie).
  const { data } = await db.auth.getUser();
  if (!data.user) return { problem: "signed_out" };

  const { data: member } = await db
    .from("staff")
    .select("full_name, role, active")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!member || !member.active) return { problem: "no_access" };

  return {
    mode: "live",
    repo: new SupabaseRepo(db),
    // staff.role has a check constraint ('manager' | 'front_desk'); the generated type is plain text.
    staff: { id: data.user.id, name: member.full_name, role: member.role as StaffRole, email: data.user.email ?? null },
  };
});

/** For admin pages and actions: the context, or a redirect to sign-in/setup. */
export async function requireAdmin(): Promise<AdminContext> {
  const ctx = await resolveAdmin();
  if ("problem" in ctx) {
    if (ctx.problem === "not_configured") redirect("/admin/setup");
    redirect(ctx.problem === "no_access" ? "/admin/login?error=no_access" : "/admin/login");
  }
  return ctx;
}

export async function requireManager(): Promise<AdminContext> {
  const ctx = await requireAdmin();
  if (ctx.staff.role !== "manager") redirect("/admin?error=manager_only");
  return ctx;
}
