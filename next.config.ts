import type { NextConfig } from "next";

// Only initialize Cloudflare dev bindings when running locally (npm run dev).
// In production, Cloudflare provides bindings automatically.
if (process.env.NODE_ENV === "development") {
  const { initOpenNextCloudflareForDev } = require("@opennextjs/cloudflare");
  initOpenNextCloudflareForDev();
}

const nextConfig: NextConfig = {};

export default nextConfig;
