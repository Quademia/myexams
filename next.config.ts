import type { NextConfig } from "next";

// Only initialize Cloudflare dev bindings when running locally (npm run dev).
// In production, Cloudflare provides bindings automatically.
if (process.env.NODE_ENV === "development") {
  const { initOpenNextCloudflareForDev } = require("@opennextjs/cloudflare");
  initOpenNextCloudflareForDev();
}

const nextConfig: NextConfig = {
  // Ensure NextAuth's catch-all API route is never statically optimized.
  // The [...nextauth] route must run dynamically on every request because it
  // handles sign-in, callbacks, CSRF tokens, etc.
  // serverExternalPackages tells Next.js not to bundle these — they need
  // native/runtime resolution on Cloudflare Workers.
  serverExternalPackages: ["next-auth", "@auth/d1-adapter"],
};

export default nextConfig;
