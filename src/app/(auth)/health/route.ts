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
    const start = Date.now();
    const { first } = getDb();
    const row = await first<{ n: number }>("SELECT COUNT(*) AS n FROM qa_users");
    const response_time_ms = Date.now() - start;
    return Response.json({
      status: "ok",
      db: "connected",
      users: row?.n ?? 0,
      response_time_ms,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({
      status: "error",
      db: "unreachable",
      message,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
