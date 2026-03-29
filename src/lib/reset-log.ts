// src/lib/reset-log.ts
// Password reset request logging and rate limiting.
//
// HOW IT WORKS:
// - logResetRequest() inserts one row into password_reset_log every time
//   someone submits the forgot-password form. It's fire-and-forget — wrapped
//   in try/catch so a logging failure never breaks the reset flow.
// - checkResetRateLimit() counts recent reset requests for an email in two
//   time windows (10 min, 24 hr). The thresholds are tight because reset
//   emails cost money and could be used to spam a user's inbox.
//
// DESIGN NOTES:
// - We derive ip_hash, ua_hash, ip_country, and ua_parsed from Cloudflare
//   request headers using getRequestMeta() from auth-events.ts.
// - All DB writes are fire-and-forget — they must never throw.

import { getDb } from "@/lib/db";
import { getRequestMeta } from "@/lib/auth-events";

// ---------- logResetRequest ----------
// Writes one row to password_reset_log. Fire-and-forget — never throws.
//
// Parameters:
//   identifierRaw — exactly what was typed into the form
//   email         — resolved email or null
//   username      — resolved username or null
//   userId        — qa_users.id or null
//   tenantId      — tenant context or null
//   actionNote    — human-readable description of what happened
//   resetToken    — raw token string or null
//   status        — NO_USER | RATE_LIMITED | RATE_LIMITED_24H | EMAIL_SENT
//   meta          — { ipHash, uaHash, country, uaParsed } from getRequestMeta()

interface LogResetRequestParams {
  identifierRaw: string;
  email: string | null;
  username: string | null;
  userId: string | null;
  tenantId: string | null;
  actionNote: string;
  resetToken: string | null;
  status: string;
  meta: { ipHash: string | null; uaHash: string; country: string; uaParsed: string };
}

export async function logResetRequest(params: LogResetRequestParams): Promise<void> {
  try {
    const { run } = getDb();
    const id = crypto.randomUUID();
    const requestedUtc = new Date().toISOString();

    await run(
      `INSERT INTO password_reset_log
         (id, identifier_raw, email, username, user_id, requested_utc,
          action_note, ip_hash, ua_hash, reset_token, status, tenant_id,
          ip_country, ua_parsed, delivery_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [
        id,
        params.identifierRaw,
        params.email,
        params.username,
        params.userId,
        requestedUtc,
        params.actionNote,
        params.meta.ipHash,
        params.meta.uaHash,
        params.resetToken,
        params.status,
        params.tenantId,
        params.meta.country,
        params.meta.uaParsed,
      ]
    );
  } catch {
    // Fire-and-forget — logging must never break the reset flow.
  }
}

// ---------- checkResetRateLimit ----------
// Counts recent password reset requests for an email.
//
// Two windows:
//   Short (10 min): 1 request (any status except NO_USER) → blocked
//   Long  (24 hr):  3 requests (any status except NO_USER) → blocked
//
// Returns { blocked: true, window } or { blocked: false }.

interface ResetRateLimitResult {
  blocked: boolean;
  window?: "short" | "long";
}

export async function checkResetRateLimit(email: string): Promise<ResetRateLimitResult> {
  try {
    const { first } = getDb();

    // --- Short window: 10 minutes ---
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const shortRow = await first<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM password_reset_log
       WHERE email = ? AND requested_utc > ? AND status NOT IN ('NO_USER')`,
      [email, tenMinAgo]
    );
    const shortCount = shortRow?.cnt ?? 0;

    if (shortCount >= 1) {
      return { blocked: true, window: "short" };
    }

    // --- Long window: 24 hours ---
    const twentyFourHAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const longRow = await first<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM password_reset_log
       WHERE email = ? AND requested_utc > ? AND status NOT IN ('NO_USER')`,
      [email, twentyFourHAgo]
    );
    const longCount = longRow?.cnt ?? 0;

    if (longCount >= 3) {
      return { blocked: true, window: "long" };
    }

    return { blocked: false };
  } catch {
    // If rate limit check fails, allow the request — don't lock people out.
    return { blocked: false };
  }
}

// Re-export getRequestMeta for convenience — the forgot-password page
// needs it and can import from either file.
export { getRequestMeta } from "@/lib/auth-events";
