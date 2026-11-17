import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

const PUBLIC_ADMIN_PATHS = ["/admin/login", "/admin/setup", "/admin/auth"];

/**
 * Keeps staff sessions fresh and sends signed-out visitors to the sign-in
 * page. This is only the first, optimistic check: every admin page and
 * action re-verifies the user and their staff role on the server
 * (src/lib/admin/session.ts). Public pages are deliberately not matched, so
 * they stay static and never touch auth cookies.
 */
export async function proxy(request: NextRequest) {
  const { response, signedIn, configured } = await updateSession(request);
  if (!configured) return response;

  const path = request.nextUrl.pathname;
  if (!signedIn && !PUBLIC_ADMIN_PATHS.some((p) => path.startsWith(p))) {
    const login = request.nextUrl.clone();
    login.pathname = "/admin/login";
    login.search = "";
    const redirect = NextResponse.redirect(login);
    // Carry any refreshed/cleared auth cookies onto the redirect.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }
  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
