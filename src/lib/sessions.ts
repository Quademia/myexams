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
// Fire-and-forget wrapped in try/catch — never throws.

interface CreateSessionParams {
  sessionToken: string;
  qaUserId: string;
  absoluteExpiresAt: string;
  meta: { ipHash: string | null; uaParsed: string | null };
}

export async function createSession(db: D1Database, params: CreateSessionParams): Promise<void> {
  try {
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
      "",                    // userId — empty string, not used; qa_user_id is authoritative
      expiresUnix,
      params.qaUserId,
      now,
      now,
      params.absoluteExpiresAt,
      params.meta.ipHash,
      params.meta.uaParsed,
    ).run();
  } catch {
    // Fire-and-forget — session tracking must never break auth.
  }
}

// ---------- countActiveSessions ----------
// Counts sessions for a user that are still active:
//   - expired_at IS NULL (not manually expired)
//   - absolute_expires_at > now (not past hard expiry)
// Returns 0 on error.

export async function countActiveSessions(db: D1Database, qaUserId: string): Promise<number> {
  try {
    const now = new Date().toISOString();
    const row = await db.prepare(
      `SELECT COUNT(*) AS cnt FROM sessions
       WHERE qa_user_id = ? AND expired_at IS NULL AND absolute_expires_at > ?`
    ).bind(qaUserId, now).first<{ cnt: number }>();
    return row?.cnt ?? 0;
  } catch {
    // If count fails, return 0 — don't block logins because of a table issue.
    return 0;
  }
}

// ---------- isSessionExpired ----------
// Checks if a session has been force-expired (e.g. by password reset).
// Used in the jwt callback to detect revoked sessions and force logout.
// Returns false on error — don't lock people out because of a table issue.

export async function isSessionExpired(db: D1Database, sessionToken: string): Promise<boolean> {
  try {
    const row = await db.prepare(
      `SELECT expired_at FROM sessions WHERE sessionToken = ?`
    ).bind(sessionToken).first<{ expired_at: string | null }>();

    // If no row found, session doesn't exist — treat as expired.
    if (!row) return true;

    // If expired_at is set, the session was force-expired.
    return row.expired_at !== null;
  } catch {
    // On error, don't block — assume session is still valid.
    return false;
  }
}

// ---------- expireAllUserSessions ----------
// Expires every active session for a given user. Used after password reset
// to force-logout all existing sessions — if a session was compromised,
// the attacker's JWT may still be valid but the D1 row will be marked
// expired, so the concurrent session counter treats it as dead.
// Fire-and-forget wrapped in try/catch — never throws.

export async function expireAllUserSessions(db: D1Database, qaUserId: string, reason: string): Promise<void> {
  try {
    const now = new Date().toISOString();
    await db.prepare(
      `UPDATE sessions
       SET last_seen_at = ?, expired_at = ?, expiry_reason = ?
       WHERE qa_user_id = ? AND expired_at IS NULL`
    ).bind(now, now, reason, qaUserId).run();
  } catch {
    // Fire-and-forget — session cleanup must never break the reset flow.
  }
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
