import type { NextConfig } from "next";

// Room photos uploaded from the admin live in this Supabase Storage bucket.
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  // Lets phones on the local network load dev scripts (HMR, hydration).
  allowedDevOrigins: ["192.168.0.29"],
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/room-photos/**" }]
      : [],
  },
  experimental: {
    serverActions: {
      // Photos are resized in the browser first (about 0.3–1 MB); this leaves headroom.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
