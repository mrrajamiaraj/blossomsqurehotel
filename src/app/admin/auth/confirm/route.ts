import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionClient, isSupabaseConfigured } from "@/lib/supabase";

/**
 * Landing point for invitation and password-reset emails. Verifies the
 * one-time token server-side, starts the session, then continues to `next`
 * (only same-site admin paths are allowed).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/admin";
  const next = nextParam.startsWith("/admin") && !nextParam.startsWith("//") ? nextParam : "/admin";

  const fail = NextResponse.redirect(new URL("/admin/login?error=link", url.origin));
  if (!isSupabaseConfigured()) return fail;

  const db = await getSessionClient();
  if (tokenHash && type) {
    const { error } = await db.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) return fail;
  } else if (code) {
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (error) return fail;
  } else {
    return fail;
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
