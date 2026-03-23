// src/lib/env.ts
// Environment variable helper — gives us access to APP_SECRET (the pepper)
// and any other env vars from Cloudflare.
//
// In the old code, shared.js read env.APP_SECRET directly.
// In Next.js, we access it through getCloudflareContext().
//
// NOTE: APP_SECRET is a Cloudflare secret (set via `wrangler secret put`),
// so it doesn't appear in the generated CloudflareEnv type. We cast to
// access it safely.

import { getCloudflareContext } from "@opennextjs/cloudflare";

export function getEnv() {
  const ctx = getCloudflareContext();
  // Secrets aren't in the generated types, so we use a type assertion.
  const env = ctx.env as unknown as { APP_SECRET?: string; DB: D1Database };
  return {
    APP_SECRET: env.APP_SECRET || "",
  };
}
