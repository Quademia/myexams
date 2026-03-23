import type { NextConfig } from "next";

// This import enables Cloudflare bindings (like our D1 database)
// to work during local development with `npm run dev`.
// In production, bindings are available automatically.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {};

export default nextConfig;
