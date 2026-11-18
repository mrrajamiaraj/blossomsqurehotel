import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import { resolveAdmin } from "@/lib/admin/session";

/**
 * Turns on draft preview for an editor and opens the page. Only staff with
 * content.manage get it; the drafts themselves are read with the editor's own
 * session, so the database decides what is shown.
 */
export async function GET(request: Request) {
  const ctx = await resolveAdmin();
  if ("problem" in ctx || !ctx.access.permissions.includes("content.manage")) redirect("/admin/login");
  const raw = new URL(request.url).searchParams.get("path") ?? "/";
  const path = /^\/(?!\/)[A-Za-z0-9/_-]*$/.test(raw) && !raw.startsWith("/admin") ? raw : "/";
  if (ctx.mode === "live") (await draftMode()).enable();
  redirect(path);
}
