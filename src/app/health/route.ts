// src/app/health/route.ts
// Diagnostic route — returns a JSON response confirming the app is running
// and the database is reachable. No authentication required.
//
// HOW IT WORKS:
// 1. Runs a simple COUNT query against the users table
// 2. If the query succeeds → returns { status: "ok", users: <count> }
// 3. If anything goes wrong → returns { status: "error", message: "..." } with a 500

import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const { first } = getDb();
    const row = await first<{ n: number }>("SELECT COUNT(*) AS n FROM users");
    return Response.json({ status: "ok", users: row?.n ?? 0 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ status: "error", message }, { status: 500 });
  }
}
