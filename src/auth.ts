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
      // We use it for two things:
      // 1. Store the user's ID (from qa_users) in the token on first sign-in.
      // 2. Store and update active_tenant_id — the school the user is viewing.
      //
      // The "trigger" parameter tells us WHY the callback is running:
      // - "signIn": user just logged in → set initial values
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

        // When unstable_update() is called (e.g. from setActiveTenant),
        // the new data arrives in the "session" parameter (confusingly named).
        // We merge active_tenant_id from it into the token.
        if (trigger === "update" && updateData?.user?.active_tenant_id !== undefined) {
          token.active_tenant_id = updateData.user.active_tenant_id;
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
        return session;
      },

      // The signIn callback runs after a provider authenticates a user but
      // BEFORE the session is created. We use it to auto-create a qa_users
      // row for first-time Google/Microsoft SSO users.
      async signIn({ user, account }) {
        // Only run for OAuth providers (Google, Microsoft).
        // Credentials are handled in the authorize function above.
        if (
          account?.provider === "google" ||
          account?.provider === "microsoft-entra-id"
        ) {
          const db = env.DB;
          const now = new Date().toISOString();

          // Check if a qa_users row already exists with this email.
          const existing = await db
            .prepare("SELECT id FROM qa_users WHERE email = ?")
            .bind(user.email)
            .first();

          if (!existing) {
            // First-time SSO user — create a qa_users row.
            // - id: a random UUID matching the existing pattern.
            // - auth_id: the NextAuth user.id so we can link the two tables.
            // - is_system_admin: 0 (regular user by default).
            // - status: ACTIVE so they can log in immediately.
            const id = crypto.randomUUID();
            await db
              .prepare(
                `INSERT INTO qa_users (id, name, email, is_system_admin, status, created_at, updated_at, auth_id)
                 VALUES (?, ?, ?, 0, 'ACTIVE', ?, ?, ?)`
              )
              .bind(id, user.name ?? "", user.email, now, now, user.id)
              .run();
          }
        }

        // Returning true means "allow the sign-in to proceed".
        return true;
      },
    },
  };
});
