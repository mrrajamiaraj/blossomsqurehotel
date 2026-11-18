import type { NextConfig } from "next";

/* ---------------------------------------------------------------------------
 * Build-time guard: a Supabase secret must never reach the browser bundle.
 * Anything prefixed NEXT_PUBLIC_ is inlined into client JavaScript, so fail
 * the build if an elevated key is exposed that way.
 * ------------------------------------------------------------------------- */
function assertNoPublicSecrets() {
  const leaks: string[] = [];
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith("NEXT_PUBLIC_") || !value) continue;
    if (/SECRET|SERVICE_ROLE/i.test(name) || value.startsWith("sb_secret_")) leaks.push(name);
    // Legacy JWT keys: reject one whose payload says role=service_role.
    const payload = value.split(".")[1];
    if (value.startsWith("eyJ") && payload) {
      try {
        const role = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))?.role;
        if (role === "service_role") leaks.push(name);
      } catch {
        // Not a JWT; nothing to check.
      }
    }
  }
  if (leaks.length) {
    throw new Error(
      `Refusing to build: ${[...new Set(leaks)].join(", ")} would expose a Supabase secret/service-role key to the browser. ` +
        "Use SUPABASE_SECRET_KEY (no NEXT_PUBLIC_ prefix) for server-only keys.",
    );
  }
}
assertNoPublicSecrets();

// Room photos uploaded from the admin live in this Supabase Storage bucket.
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return null;
  }
})();

/** Baseline security headers for every response. A full CSP is a later phase (see docs/AUDIT.md). */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Lets phones on the local network load dev scripts (HMR, hydration).
  // Set DEV_LAN_ORIGINS="192.168.0.29,…" in .env.local to override.
  allowedDevOrigins: (process.env.DEV_LAN_ORIGINS ?? "192.168.0.29")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  poweredByHeader: false,
  images: {
    // Vercel's image optimizer is a paid quota (it returned 402 and broke every
    // photo). The photos in public/ are already web-sized and admin uploads are
    // shrunk in the browser, so serve the files as they are.
    unoptimized: true,
    remotePatterns: supabaseHost
      ? [
          { protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/room-photos/**" },
          { protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/site-media/**" },
        ]
      : [],
  },
  experimental: {
    serverActions: {
      // Photos are resized in the browser first (about 0.3–1 MB); this leaves headroom.
      bodySizeLimit: "4mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
