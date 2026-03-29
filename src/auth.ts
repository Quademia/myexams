// src/auth.ts
// NextAuth v5 configuration for Cloudflare Workers + D1.
//
// HOW IT WORKS:
// - NextAuth handles authentication (sign-in, sign-out, session management).
// - We do NOT use the D1 adapter in the main config. With JWT session strategy,
//   NextAuth doesn't need to store sessions in D1. And for credentials login,
//   users already live in qa_users — the adapter would try to write them into
//   NextAuth's own users table, causing a "server configuration" error.
// - For Google/Microsoft SSO, the signIn callback manually writes to qa_users.
// - Three providers are configured:
//     1. Credentials — email + password (checks against qa_users table).
//     2. Google — OAuth via Google.
//     3. Microsoft Entra ID — OAuth via Microsoft (Azure AD).
// - We use JWT sessions because Cloudflare Workers is an edge runtime and
//   cannot use database sessions (no persistent connections).
// - The signIn callback auto-creates a qa_users row for first-time SSO users,
//   so they appear in our app's user table immediately.
// - The jwt callback stores a custom active_tenant_id field in the token,
//   which tracks which school the user is currently viewing.

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import MicrosoftEntraId from "next-auth/providers/microsoft-entra-id";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { pbkdf2Hex } from "@/lib/auth";
import { logAuthEvent, getRequestMeta } from "@/lib/auth-events";
import { createSession, countActiveSessions, expireSession, updateLastSeen } from "@/lib/sessions";

// Build and export the NextAuth handler + helpers.
// We wrap everything in a function so we can await getCloudflareContext()
// (needed on Cloudflare Workers to access the D1 binding at request time).
//
// unstable_update lets us write custom data into the JWT (e.g. active_tenant_id)
// from anywhere in the app. It's called "unstable" because the API may change
// in future NextAuth releases, but it's the official way to do this today.

export const { handlers, signIn, signOut, auth, unstable_update } = NextAuth(async () => {
  // Grab the D1 database binding from Cloudflare's runtime environment.
  // The { async: true } flag is required for OpenNext on Workers.
  const { env: rawEnv } = await getCloudflareContext({ async: true });

  // Secrets (set via `wrangler secret put`) aren't in the generated CloudflareEnv
  // type, so we cast once here — same pattern as src/lib/env.ts.
  const env = rawEnv as unknown as {
    DB: D1Database;
    APP_SECRET?: string;
    AUTH_SECRET?: string;
    AUTH_GOOGLE_ID?: string;
    AUTH_GOOGLE_SECRET?: string;
    AUTH_MICROSOFT_ENTRA_ID_ID?: string;
    AUTH_MICROSOFT_ENTRA_ID_SECRET?: string;
  };

  const APP_SECRET = env.APP_SECRET || "";

  // Single source of truth for session lifetime — used by both NextAuth's
  // JWT maxAge and our D1 session row absolute_expires_at. Change this one
  // constant and both stay in sync. (30 min for testing — production: 4 * 60 * 60)
  const SESSION_MAX_AGE_SECS = 30 * 60;

  // Bridge between signIn and jwt callbacks — signIn has access to request
  // headers (IP, User-Agent) but doesn't create the session row. jwt creates
  // the session row but can't call headers(). This closure variable lets signIn
  // stash the metadata so jwt can pick it up on the same request cycle.
  let pendingSessionMeta: { ipHash: string | null; uaParsed: string | null } | null = null;

  return {
    // ── Providers ────────────────────────────────────────────────────────
    providers: [
      // 1. Credentials — email + password login.
      //    The authorize function looks up the user in qa_users, hashes the
      //    password with PBKDF2 + the APP_SECRET pepper, and compares.
      Credentials({
        name: "Email & Password",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials) {
          const email = (credentials?.email as string || "").toLowerCase().trim();
          const password = credentials?.password as string || "";
          if (!email || !password) return null;

          // Look up the user in our platform table (qa_users), not NextAuth's users table.
          const db = env.DB;
          const u = await db
            .prepare(
              "SELECT id, email, name, password_salt, password_hash, password_iter FROM qa_users WHERE email = ? AND status = 'ACTIVE'"
            )
            .bind(email)
            .first<{
              id: string;
              email: string;
              name: string;
              password_salt: string;
              password_hash: string;
              password_iter: number;
            }>();

          if (!u) return null;

          // Hash the provided password with the same salt + pepper and compare.
          // The pepper (APP_SECRET) is appended to the password before hashing,
          // exactly as the old login code did.
          const check = await pbkdf2Hex(
            password + "|" + APP_SECRET,
            u.password_salt,
            Number(u.password_iter)
          );

          if (check !== u.password_hash) return null;

          // Password matches — return a user object for NextAuth.
          // NextAuth will encode this into the JWT.
          return { id: u.id, email: u.email, name: u.name };
        },
      }),

      // 2. Google OAuth — reads client ID and secret from environment variables.
      Google({
        clientId: env.AUTH_GOOGLE_ID,
        clientSecret: env.AUTH_GOOGLE_SECRET,
      }),

      // 3. Microsoft Entra ID (Azure AD) OAuth — personal accounts only.
      //    Using the "consumers" tenant so only personal Microsoft accounts
      //    (Outlook.com, Hotmail, Xbox, etc.) can sign in.
      MicrosoftEntraId({
        clientId: env.AUTH_MICROSOFT_ENTRA_ID_ID,
        clientSecret: env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
        issuer: `https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0`,
      }),
    ],

    // ── Session strategy ────────────────────────────────────────────────
    // JWT = the session lives in a signed cookie, not in the database.
    // This is required on Cloudflare Workers where we can't hold DB
    // connections open between requests.
    session: {
      strategy: "jwt",
      maxAge: SESSION_MAX_AGE_SECS,
    },

    // ── Secret ──────────────────────────────────────────────────────────
    // Used to sign/encrypt the JWT. Must be a long random string stored
    // in your Cloudflare Workers environment variables.
    secret: env.AUTH_SECRET,

    // ── Trust Host ────────────────────────────────────────────────────────
    // On Cloudflare Workers the app runs behind a proxy, so NextAuth can't
    // auto-detect the host. Without this flag every auth request fails with
    // "UntrustedHost: Host must be trusted."
    trustHost: true,

    // ── Pages ────────────────────────────────────────────────────────────
    // Tell NextAuth to use our custom login page instead of the default one.
    pages: {
      signIn: "/login",
    },

    // ── Callbacks ───────────────────────────────────────────────────────
    callbacks: {
      // The jwt callback runs every time a JWT is created or updated.
      // We use it for three things:
      // 1. Store the user's ID (from qa_users) in the token on first sign-in.
      // 2. Store and update active_tenant_id — the school the user is viewing.
      // 3. On sign-in: create a session row in D1 (count check is in signIn callback).
      //
      // The "trigger" parameter tells us WHY the callback is running:
      // - "signIn": user just logged in → set initial values + session tracking
      // - "update": unstable_update() was called → merge in new data
      // - "signUp": new account created (not used for credentials)
      // - undefined: normal JWT refresh on each request
      async jwt({ token, user, trigger, session: updateData }) {
        // On first sign-in, copy the user's qa_users.id into the token.
        if (user?.id) {
          token.sub = user.id;
        }

        // Initialize active_tenant_id if not already set.
        if (token.active_tenant_id === undefined) {
          token.active_tenant_id = null;
        }

        // Initialize session_token if not already set.
        if (token.session_token === undefined) {
          token.session_token = null;
        }

        // On sign-in: create a session row in D1.
        // The concurrent session limit is checked in the signIn callback (which
        // runs before jwt). By the time we get here, we know the count is under
        // the limit. We use user?.id && !token.session_token instead of
        // trigger === "signIn" because the trigger value is unreliable on
        // Cloudflare Workers with the credentials provider.
        if (user?.id && !token.session_token) {
          try {
            // Look up the qa_users.id by email — this is correct for ALL login types.
            // For credentials, user.id is already qa_users.id but the lookup confirms it.
            // For SSO, user.id is the NextAuth users table id — we need qa_users.id instead.
            const qaUserRow = await env.DB
              .prepare("SELECT id FROM qa_users WHERE email = ? AND status = 'ACTIVE'")
              .bind(user.email)
              .first<{ id: string }>();

            const qaUserId = qaUserRow?.id ?? user.id;

            const sessionToken = crypto.randomUUID();
            const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECS * 1000;
            const absoluteExpiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS).toISOString();

            // Use the metadata stashed by the signIn callback (which has access
            // to request headers). Falls back to nulls if signIn didn't run first.
            const meta = pendingSessionMeta || { ipHash: null, uaParsed: null };
            pendingSessionMeta = null; // consume it — one session per sign-in

            await createSession(env.DB, {
              sessionToken,
              qaUserId,
              absoluteExpiresAt,
              meta,
            });

            token.session_token = sessionToken;
          } catch {
            // Fire-and-forget — session tracking must never break auth.
          }
        }

        // When unstable_update() is called (e.g. from setActiveTenant),
        // the new data arrives in the "session" parameter (confusingly named).
        // We merge active_tenant_id from it into the token.
        if (trigger === "update" && updateData?.user?.active_tenant_id !== undefined) {
          token.active_tenant_id = updateData.user.active_tenant_id;
        }

        // On normal JWT refreshes (every request), update last_seen_at in D1.
        // Throttled to once per 5 minutes to avoid a DB write on every request.
        // We store the last update time in the JWT itself so we can compare.
        if (!trigger && token.session_token) {
          const now = Date.now();
          const lastUpdate = (token.last_seen_updated_at as number) || 0;
          const FIVE_MINUTES_MS = 5 * 60 * 1000;

          if (now - lastUpdate > FIVE_MINUTES_MS) {
            try {
              await updateLastSeen(env.DB, token.session_token as string);
              token.last_seen_updated_at = now;
            } catch {
              // Fire-and-forget — never break auth for activity tracking.
            }
          }
        }

        return token;
      },

      // The session callback controls what's exposed to the client and to
      // server-side auth() calls. We pass through:
      // - user.id: so getAuth() can look up qa_users
      // - active_tenant_id: so pickActiveMembership() can find the active school
      async session({ session, token }) {
        if (token.sub && session.user) {
          session.user.id = token.sub;
        }
        // Attach active_tenant_id to the session object.
        // Our next-auth.d.ts type declarations add this field to the Session type.
        session.user.active_tenant_id = (token.active_tenant_id as string | null) ?? null;
        // Attach session_token so the logout route can expire the D1 row.
        session.user.session_token = (token.session_token as string | null) ?? null;
        return session;
      },

      // The signIn callback runs after a provider authenticates a user but
      // BEFORE the session is created. We use it to auto-create a qa_users
      // row exists in qa_users. Unregistered emails are rejected.
      async signIn({ user, account }) {
        // Try to get real request metadata (IP, UA, country) from headers.
        // Falls back to nulls if headers() is not available in this context.
        const nullMeta: { ipHash: string | null; uaHash: string | null; country: string | null; uaParsed: string | null } = { ipHash: null, uaHash: null, country: null, uaParsed: null };
        let requestMeta = nullMeta;
        try {
          requestMeta = await getRequestMeta();
        } catch {
          // headers() not available in this context — fall back to nullMeta
        }

        // --- SSO-specific checks (Google, Microsoft) ---
        // For SSO: check if email is registered. If not, reject immediately.
        // SSO success logging is deferred until after the session count check.
        let ssoExistingId: string | null = null;

        if (
          account?.provider === "google" ||
          account?.provider === "microsoft-entra-id"
        ) {
          const db = env.DB;
          const kind = account.provider === "google" ? "LOGIN_GOOGLE" : "LOGIN_MICROSOFT";

          // Check if an ACTIVE qa_users row exists with this email.
          const existing = await db
            .prepare("SELECT id FROM qa_users WHERE email = ? AND status = 'ACTIVE'")
            .bind(user.email)
            .first<{ id: string }>();

          if (!existing) {
            // Email not registered — reject the login and redirect to error page.
            try {
              await logAuthEvent({
                kind,
                identifier: user.email!,
                userId: null,
                ok: false,
                errorCode: "no_account",
                note: "sso_email_not_registered",
                tenantId: null,
                sessionId: null,
                loginMethodDetail: null,
                failureCountAtTime: null,
                meta: requestMeta,
              });
            } catch {
              // Fire-and-forget — logging must never block SSO login.
            }
            return "/login?error=NoAccount";
          }

          // Store the existing id for use in session check and success logging below.
          ssoExistingId = existing.id;
        }

        // --- Concurrent session limit (ALL login types) ---
        // We look up qa_users by email since user.id may be NextAuth's id for SSO.
        // For SSO, we already have the id from the check above — reuse it.
        try {
          let qaUserId: string | null = ssoExistingId;

          if (!qaUserId) {
            const qaUserRow = await env.DB
              .prepare("SELECT id FROM qa_users WHERE email = ? AND status = 'ACTIVE'")
              .bind(user.email)
              .first<{ id: string }>();
            qaUserId = qaUserRow?.id ?? null;
          }

          if (qaUserId) {
            const activeCount = await countActiveSessions(env.DB, qaUserId);
            if (activeCount >= 2) {
              // Log the blocked attempt to auth_events (fire-and-forget).
              try {
                await logAuthEvent({
                  kind: account?.provider === "google" ? "LOGIN_GOOGLE" : account?.provider === "microsoft-entra-id" ? "LOGIN_MICROSOFT" : "LOGIN_EMAIL",
                  identifier: user.email!,
                  userId: qaUserId,
                  ok: false,
                  errorCode: "max_sessions_reached",
                  note: "concurrent session limit exceeded",
                  tenantId: null,
                  sessionId: null,
                  loginMethodDetail: null,
                  failureCountAtTime: activeCount,
                  meta: requestMeta,
                });
              } catch {
                // Fire-and-forget — never block the redirect.
              }

              // Write a session row and immediately expire it for audit trail.
              try {
                const blockedToken = crypto.randomUUID();
                const now = new Date().toISOString();
                await createSession(env.DB, {
                  sessionToken: blockedToken,
                  qaUserId,
                  absoluteExpiresAt: now,
                  meta: { ipHash: requestMeta.ipHash, uaParsed: requestMeta.uaParsed },
                });
                await expireSession(env.DB, blockedToken, "max_sessions_reached");
              } catch {
                // Fire-and-forget — never block the redirect.
              }

              return "/login?error=MaxSessionsReached";
            }
          }
        } catch {
          // Fire-and-forget — never block login because of a session count failure.
        }

        // --- Success logging (only fires after session check passes) ---

        // SSO success — log for Google/Microsoft returning users.
        if (ssoExistingId && (account?.provider === "google" || account?.provider === "microsoft-entra-id")) {
          const kind = account.provider === "google" ? "LOGIN_GOOGLE" : "LOGIN_MICROSOFT";
          try {
            await logAuthEvent({
              kind,
              identifier: user.email!,
              userId: ssoExistingId,
              ok: true,
              errorCode: null,
              note: null,
              tenantId: null,
              sessionId: null,
              loginMethodDetail: "returning",
              failureCountAtTime: null,
              meta: requestMeta,
            });
          } catch {
            // Fire-and-forget — logging must never block SSO login.
          }
        }

        // Credentials success — log for email/password returning users.
        if (account?.provider === "credentials") {
          try {
            // qaUserId was already looked up in the session check above,
            // but that's inside a try/catch that may have failed. Look up again.
            const credQaUser = await env.DB
              .prepare("SELECT id FROM qa_users WHERE email = ? AND status = 'ACTIVE'")
              .bind(user.email)
              .first<{ id: string }>();

            await logAuthEvent({
              kind: "LOGIN_EMAIL",
              identifier: user.email!,
              userId: credQaUser?.id ?? null,
              ok: true,
              errorCode: null,
              note: null,
              tenantId: null,
              sessionId: null,
              loginMethodDetail: "returning",
              failureCountAtTime: null,
              meta: requestMeta,
            });
          } catch {
            // Fire-and-forget — logging must never block login.
          }
        }

        // Stash request metadata so the jwt callback (which runs next) can
        // include it when creating the D1 session row. The jwt callback can't
        // call headers() itself on Cloudflare Workers.
        pendingSessionMeta = {
          ipHash: requestMeta.ipHash,
          uaParsed: requestMeta.uaParsed,
        };

        // Returning true means "allow the sign-in to proceed".
        return true;
      },
    },
  };
});
