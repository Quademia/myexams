// src/lib/sessions.ts
// Session tracking — creates, counts, and expires session rows in D1.
// NextAuth uses JWT cookies for auth — it never writes to the sessions table
// with JWT strategy. We own this table entirely for our own session management.
//
// All three functions accept a D1Database binding as their first argument.
// This avoids calling getCloudflareContext() internally, which fails silently
// inside the NextAuth jwt callback on Cloudflare Workers. Instead, the caller
// (src/auth.ts or logout/route.ts) passes the binding it already has.
//
// THREE FUNCTIONS:
// - createSession() — writes a new session row on login
// - countActiveSessions() — counts non-expired sessions for a user
// - expireSession() — marks a session as expired (logout or superseded)

// ---------- createSession ----------
// Writes one row to sessions when a user logs in.
// DEBUG: try/catch removed to expose errors.

interface CreateSessionParams {
  sessionToken: string;
  qaUserId: string;
  absoluteExpiresAt: string;
  meta: { ipHash: string | null; uaParsed: string | null };
}

export async function createSession(db: D1Database, params: CreateSessionParams): Promise<void> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresUnix = Math.floor(new Date(params.absoluteExpiresAt).getTime() / 1000);

  await db.prepare(
    `INSERT INTO sessions
       (id, sessionToken, userId, expires,
        qa_user_id, created_at, last_seen_at, absolute_expires_at,
        expired_at, expiry_reason, ip_hash, ua_parsed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`
  ).bind(
    id,
    params.sessionToken,
    params.qaUserId,
    expiresUnix,
    params.qaUserId,
    now,
    now,
    params.absoluteExpiresAt,
    params.meta.ipHash,
    params.meta.uaParsed,
  ).run();
}

// ---------- countActiveSessions ----------
// Counts sessions for a user that are still active:
//   - expired_at IS NULL (not manually expired)
//   - absolute_expires_at > now (not past hard expiry)
// DEBUG: try/catch removed to expose errors.

export async function countActiveSessions(db: D1Database, qaUserId: string): Promise<number> {
  const now = new Date().toISOString();
  const row = await db.prepare(
    `SELECT COUNT(*) AS cnt FROM sessions
     WHERE qa_user_id = ? AND expired_at IS NULL AND absolute_expires_at > ?`
  ).bind(qaUserId, now).first<{ cnt: number }>();
  return row?.cnt ?? 0;
}

// ---------- expireSession ----------
// Marks a session as expired. Used on logout and when superseding old sessions.
// Fire-and-forget wrapped in try/catch — never throws.

export async function expireSession(db: D1Database, sessionToken: string, reason: string): Promise<void> {
  try {
    const now = new Date().toISOString();

    await db
      .prepare(
        `UPDATE sessions
         SET last_seen_at = ?, expired_at = ?, expiry_reason = ?
         WHERE sessionToken = ?`
      )
      .bind(now, now, reason, sessionToken)
      .run();
  } catch {
    // Fire-and-forget — session cleanup must never break logout.
  }
}
