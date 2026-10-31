import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets phones on the local network load dev scripts (HMR, hydration).
  allowedDevOrigins: ["192.168.0.29"],
};

export default nextConfig;
