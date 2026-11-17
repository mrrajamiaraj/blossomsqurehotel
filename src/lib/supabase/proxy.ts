import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";
import type { Database } from "./database.types";

/**
 * Refreshes the Supabase session cookies for this request and reports whether
 * a valid access token is present. getClaims() verifies the JWT signature
 * (locally with asymmetric signing keys, via Auth otherwise) — it never just
 * trusts the cookie.
 *
 * This is the optimistic first check only. Pages and actions still re-verify
 * the user AND their staff row on the server (src/lib/admin/session.ts).
 */
export async function updateSession(
  request: NextRequest,
): Promise<{ response: NextResponse; signedIn: boolean; configured: boolean }> {
  let response = NextResponse.next({ request });
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return { response, signedIn: false, configured: false };

  const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
        // Cache-busting headers from @supabase/ssr, so a CDN never caches a Set-Cookie.
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  // Do not run code between createServerClient and getClaims().
  const { data } = await supabase.auth.getClaims();
  return { response, signedIn: Boolean(data?.claims?.sub), configured: true };
}
