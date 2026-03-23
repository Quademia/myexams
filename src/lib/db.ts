// src/lib/db.ts
// Database helper — gives us easy access to D1 from any server component or API route.
//
// HOW IT WORKS:
// - getCloudflareContext() reaches into the Cloudflare runtime to get our bindings
// - env.DB is the D1 database we configured in wrangler.jsonc
// - We export three helper functions that match what shared.js had:
//   - first() — run a query and get the first row (or null)
//   - all()   — run a query and get all rows as an array
//   - run()   — run an INSERT/UPDATE/DELETE (no data returned)
//
// USAGE EXAMPLE:
//   import { getDb } from "@/lib/db";
//   const { first, all, run } = getDb();
//   const user = await first("SELECT * FROM users WHERE id=?", ["abc"]);

import { getCloudflareContext } from "@opennextjs/cloudflare";

// Returns the raw D1 database instance from Cloudflare bindings.
// Every time we need to talk to the database, we call this.
function getD1() {
  return getCloudflareContext().env.DB;
}

// Returns our three database helper functions.
// This pattern keeps things simple — import getDb, destructure what you need.
export function getDb() {
  const db = getD1();

  // Run a query and return the first matching row, or null if none found.
  // Example: const user = await first("SELECT * FROM users WHERE email=?", ["sam@test.com"]);
  const first = async <T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): Promise<T | null> => {
    return await db.prepare(sql).bind(...params).first<T>();
  };

  // Run a query and return ALL matching rows as an array.
  // Example: const courses = await all("SELECT * FROM courses WHERE tenant_id=?", [tenantId]);
  const all = async <T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): Promise<T[]> => {
    const res = await db.prepare(sql).bind(...params).all<T>();
    return res.results;
  };

  // Run an INSERT, UPDATE, or DELETE. Returns nothing — just executes.
  // Example: await run("DELETE FROM sessions WHERE token_hash=?", [hash]);
  const run = async (sql: string, params: unknown[] = []) => {
    await db.prepare(sql).bind(...params).run();
  };

  return { first, all, run, db };
}
