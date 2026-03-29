// src/lib/auth-events.ts
// Auth event logging and login rate limiting.
//
// HOW IT WORKS:
// - logAuthEvent() inserts one row into the auth_events table every time
//   someone attempts to log in. It's fire-and-forget — wrapped in try/catch
//   so a logging failure never breaks the login flow.
// - checkLoginRateLimit() counts recent failed attempts across three
//   dimensions (identifier, IP, user) in two time windows (10 min, 24 hr).
//   If any dimension exceeds its threshold, the login is blocked.
//
// DESIGN NOTES:
// - We derive ip_hash, ua_hash, country, and ua_parsed from Cloudflare
//   request headers. These are hashed (IP and UA) for privacy.
// - All DB writes are fire-and-forget — they must never throw.

import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { sha256Hex } from "@/lib/auth";

// ---------- User-Agent parsing ----------
// Parses a raw UA string into a human-readable "OS · Browser" label.
// Detects the most common platforms and browsers.

function parseUserAgent(ua: string): string {
  let os = "Unknown";
  let browser = "Unknown";

  // Detect OS with version — order matters (e.g. "Android" contains "Linux")
  if (/android/i.test(ua)) {
    const m = ua.match(/Android\s+([\d.]+)/i);
    os = m ? `Android ${m[1].split(".")[0]}` : "Android";
  } else if (/iPad|iPhone|iPod/i.test(ua)) {
    const m = ua.match(/CPU\s+(?:iPhone\s+)?OS\s+(\d+)/i);
    os = m ? `iOS ${m[1]}` : "iOS";
  } else if (/windows/i.test(ua)) {
    const m = ua.match(/Windows NT\s+([\d.]+)/i);
    if (m) {
      const nt = m[1];
      if (nt === "10.0") os = "Windows 10/11";
      else if (nt === "6.3") os = "Windows 8.1";
      else if (nt === "6.1") os = "Windows 7";
      else os = `Windows NT ${nt}`;
    } else {
      os = "Windows";
    }
  } else if (/macintosh|mac os/i.test(ua)) {
    const m = ua.match(/Mac OS X\s+([\d_.]+)/i);
    os = m ? `macOS ${m[1].replace(/_/g, ".")}` : "macOS";
  } else if (/linux/i.test(ua)) {
    os = "Linux";
  }

  // Detect browser with major version — order matters (e.g. Edge contains "Chrome")
  if (/edg(e|\/)/i.test(ua)) {
    const m = ua.match(/Edg(?:e|\/)([\d]+)/i);
    browser = m ? `Edge ${m[1]}` : "Edge";
  } else if (/chrome|crios/i.test(ua)) {
    const m = ua.match(/(?:Chrome|CriOS)\/([\d]+)/i);
    browser = m ? `Chrome ${m[1]}` : "Chrome";
  } else if (/safari/i.test(ua) && !/chrome/i.test(ua)) {
    const m = ua.match(/Version\/([\d]+)/i);
    browser = m ? `Safari ${m[1]}` : "Safari";
  } else if (/firefox|fxios/i.test(ua)) {
    const m = ua.match(/(?:Firefox|FxiOS)\/([\d]+)/i);
    browser = m ? `Firefox ${m[1]}` : "Firefox";
  }

  if (os === "Unknown" && browser === "Unknown") return "Unknown";
  return `${os} / ${browser}`;
}

// ---------- Header helpers ----------
// Extracts and hashes request headers from Cloudflare.
// Returns the four derived values needed by auth_events and password_reset_log.

export async function getRequestMeta() {
  const h = await headers();

  // cf-connecting-ip is always a single IP. x-forwarded-for can be a
  // comma-separated list (e.g. "203.0.113.1, 10.0.0.1") — take only
  // the first token so the same client always produces the same hash.
  const cfIp = h.get("cf-connecting-ip");
  let rawIp: string | null = cfIp;
  if (!rawIp) {
    const xff = h.get("x-forwarded-for");
    rawIp = xff ? xff.split(",")[0].trim() : null;
  }

  const rawUa = h.get("user-agent") || "unknown";
  const country = h.get("cf-ipcountry") || "unknown";

  // If IP is unknown/null, store null rather than hashing the string "unknown".
  const ipHash = rawIp ? await sha256Hex(rawIp) : null;
  const uaHash = await sha256Hex(rawUa);
  const uaParsed = parseUserAgent(rawUa);

  return { ipHash, uaHash, country, uaParsed };
}

// ---------- logAuthEvent ----------
// Writes one row to auth_events. Fire-and-forget — never throws.
//
// Parameters:
//   kind            — LOGIN_EMAIL | LOGIN_USERNAME | LOGIN_GOOGLE | LOGIN_MICROSOFT
//   identifier      — what was submitted (email or username)
//   userId          — qa_users.id or null if user not found
//   ok              — true if login succeeded, false if failed, null for SSO initiation
//   errorCode       — e.g. "invalid_login", "too_many_attempts", or null
//   note            — human-readable detail, or null
//   tenantId        — tenant context or null
//   sessionId       — session identifier or null
//   loginMethodDetail — e.g. "returning", "first_time_sso", or null
//   failureCountAtTime — how many recent failures at time of this attempt, or null
//   meta            — { ipHash, uaHash, country, uaParsed } from getRequestMeta()

interface LogAuthEventParams {
  kind: string;
  identifier: string;
  userId: string | null;
  ok: boolean | null;
  errorCode: string | null;
  note: string | null;
  tenantId: string | null;
  sessionId: string | null;
  loginMethodDetail: string | null;
  failureCountAtTime: number | null;
  meta: { ipHash: string | null; uaHash: string | null; country: string | null; uaParsed: string | null };
}

export async function logAuthEvent(params: LogAuthEventParams): Promise<void> {
  try {
    const { run } = getDb();
    const id = crypto.randomUUID();
    const tsUtc = new Date().toISOString();

    // ok column: 1 = success, 0 = failure, NULL = unknown (SSO redirect)
    const okValue = params.ok === null ? null : params.ok ? 1 : 0;

    await run(
      `INSERT INTO auth_events
         (id, ts_utc, kind, identifier, user_id, ip_hash, ua_hash, ok,
          error_code, note, tenant_id, session_id, country,
          login_method_detail, failure_count_at_time, ua_parsed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        tsUtc,
        params.kind,
        params.identifier,
        params.userId,
        params.meta.ipHash,
        params.meta.uaHash,
        okValue,
        params.errorCode,
        params.note,
        params.tenantId,
        params.sessionId,
        params.meta.country,
        params.loginMethodDetail,
        params.failureCountAtTime,
        params.meta.uaParsed,
      ]
    );
  } catch {
    // Fire-and-forget — logging must never break auth.
  }
}

// ---------- checkLoginRateLimit ----------
// Checks failed login attempts across three dimensions:
//   1. identifier (email/username submitted)
//   2. IP address (hashed)
//   3. user_id (if known)
//
// Two windows:
//   Short (10 min): 5 failures on any dimension → blocked
//   Long  (24 hr):  10 failures on any dimension → blocked
//
// Returns { blocked: true, window, counts } or { blocked: false }.

interface RateLimitResult {
  blocked: boolean;
  window?: "short" | "long";
  counts?: { identifier: number; ip: number; user: number };
}

export async function checkLoginRateLimit(
  identifier: string,
  userId: string | null,
  ipHash: string
): Promise<RateLimitResult> {
  try {
    const { first } = getDb();

    // --- Short window: 10 minutes ---
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    // Count by identifier
    const shortId = await first<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM auth_events
       WHERE ok = 0 AND identifier = ? AND ts_utc > ?`,
      [identifier, tenMinAgo]
    );
    const shortIdentifier = shortId?.cnt ?? 0;

    // Count by IP
    const shortIpRow = await first<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM auth_events
       WHERE ok = 0 AND ip_hash = ? AND ts_utc > ?`,
      [ipHash, tenMinAgo]
    );
    const shortIp = shortIpRow?.cnt ?? 0;

    // Count by user_id (only if we know the user)
    let shortUser = 0;
    if (userId) {
      const shortUserRow = await first<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM auth_events
         WHERE ok = 0 AND user_id = ? AND ts_utc > ?`,
        [userId, tenMinAgo]
      );
      shortUser = shortUserRow?.cnt ?? 0;
    }

    if (shortIdentifier >= 5 || shortIp >= 5 || shortUser >= 5) {
      return {
        blocked: true,
        window: "short",
        counts: { identifier: shortIdentifier, ip: shortIp, user: shortUser },
      };
    }

    // --- Long window: 24 hours ---
    const twentyFourHAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const longId = await first<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM auth_events
       WHERE ok = 0 AND identifier = ? AND ts_utc > ?`,
      [identifier, twentyFourHAgo]
    );
    const longIdentifier = longId?.cnt ?? 0;

    const longIpRow = await first<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM auth_events
       WHERE ok = 0 AND ip_hash = ? AND ts_utc > ?`,
      [ipHash, twentyFourHAgo]
    );
    const longIp = longIpRow?.cnt ?? 0;

    let longUser = 0;
    if (userId) {
      const longUserRow = await first<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM auth_events
         WHERE ok = 0 AND user_id = ? AND ts_utc > ?`,
        [userId, twentyFourHAgo]
      );
      longUser = longUserRow?.cnt ?? 0;
    }

    if (longIdentifier >= 10 || longIp >= 10 || longUser >= 10) {
      return {
        blocked: true,
        window: "long",
        counts: { identifier: longIdentifier, ip: longIp, user: longUser },
      };
    }

    return { blocked: false };
  } catch {
    // If rate limit check fails, allow the login — don't lock people out
    // because of a logging table issue.
    return { blocked: false };
  }
}
