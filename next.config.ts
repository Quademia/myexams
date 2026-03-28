import type { NextConfig } from "next";

// Only initialize Cloudflare dev bindings when running locally (npm run dev).
// In production, Cloudflare provides bindings automatically.
if (process.env.NODE_ENV === "development") {
  const { initOpenNextCloudflareForDev } = require("@opennextjs/cloudflare");
  initOpenNextCloudflareForDev();
}

const nextConfig: NextConfig = {
  // NextAuth and its D1 adapter should be bundled (not external) on Cloudflare
  // Workers, because Workers doesn't have a Node.js module resolution system
  // at runtime. Everything must be bundled into the single worker script.
};

export default nextConfig;
