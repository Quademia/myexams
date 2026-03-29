// src/lib/sessions.ts
// Session tracking — creates, counts, and expires session rows in D1.
// NextAuth uses JWT cookies for auth — it never writes to the sessions table
// with JWT strategy. We own this table entirely for our own session management.
//
// THREE FUNCTIONS:
// - createSession() — writes a new session row on login
// - countActiveSessions() — counts non-expired sessions for a user
// - expireSession() — marks a session as expired (logout or superseded)

import { getDb } from "@/lib/db";

// ---------- createSession ----------
// Writes one row to sessions when a user logs in.
// Fire-and-forget wrapped in try/catch — never throws.

interface CreateSessionParams {
  sessionToken: string;
  qaUserId: string;
  absoluteExpiresAt: string;
  meta: { ipHash: string | null; uaParsed: string | null };
}

export async function createSession(params: CreateSessionParams): Promise<void> {
  try {
    const { run } = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const expiresUnix = Math.floor(new Date(params.absoluteExpiresAt).getTime() / 1000);

    await run(
      `INSERT INTO sessions
         (id, sessionToken, userId, expires,
          qa_user_id, created_at, last_seen_at, absolute_expires_at,
          expired_at, expiry_reason, ip_hash, ua_parsed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        params.sessionToken,
        params.qaUserId,       // repurpose NextAuth's userId column
        expiresUnix,
        params.qaUserId,
        now,
        now,
        params.absoluteExpiresAt,
        null,                  // expired_at — null means active
        null,                  // expiry_reason
        params.meta.ipHash,
        params.meta.uaParsed,
      ]
    );
  } catch {
    // Fire-and-forget — session tracking must never break auth.
  }
}

// ---------- countActiveSessions ----------
// Counts sessions for a user that are still active:
//   - expired_at IS NULL (not manually expired)
//   - absolute_expires_at > now (not past hard expiry)
// Returns 0 on error.

export async function countActiveSessions(qaUserId: string): Promise<number> {
  try {
    const { first } = getDb();
    const now = new Date().toISOString();

    const row = await first<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM sessions
       WHERE qa_user_id = ? AND expired_at IS NULL AND absolute_expires_at > ?`,
      [qaUserId, now]
    );

    return row?.cnt ?? 0;
  } catch {
    // If count fails, return 0 — don't block logins because of a table issue.
    return 0;
  }
}

// ---------- expireSession ----------
// Marks a session as expired. Used on logout and when superseding old sessions.
// Fire-and-forget wrapped in try/catch — never throws.

export async function expireSession(sessionToken: string, reason: string): Promise<void> {
  try {
    const { run } = getDb();
    const now = new Date().toISOString();

    await run(
      `UPDATE sessions
       SET last_seen_at = ?, expired_at = ?, expiry_reason = ?
       WHERE sessionToken = ?`,
      [now, now, reason, sessionToken]
    );
  } catch {
    // Fire-and-forget — session cleanup must never break logout.
  }
}
