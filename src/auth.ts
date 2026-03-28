// src/auth.ts
// NextAuth v5 configuration for Cloudflare Workers + D1.
//
// HOW IT WORKS:
// - NextAuth handles authentication (sign-in, sign-out, session management).
// - We use the D1 adapter so NextAuth stores its own data (accounts, sessions,
//   verification tokens) in our Cloudflare D1 database.
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
import { D1Adapter } from "@auth/d1-adapter";
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
  const { env } = await getCloudflareContext({ async: true });
  const adapter = D1Adapter(env.DB);

  // APP_SECRET is the pepper used for password hashing (set via `wrangler secret put`).
  // It's not in the generated CloudflareEnv types, so we cast.
  const APP_SECRET = (env as unknown as { APP_SECRET?: string }).APP_SECRET || "";

  return {
    // ── Adapter ──────────────────────────────────────────────────────────
    // Tells NextAuth to store users, accounts, and tokens in our D1 database.
    adapter,

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

      // 3. Microsoft Entra ID (Azure AD) OAuth.
      MicrosoftEntraId({
        clientId: env.AUTH_MICROSOFT_ENTRA_ID_ID,
        clientSecret: env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
        tenantId: env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID,
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
        if (trigger === "update" && updateData?.active_tenant_id !== undefined) {
          token.active_tenant_id = updateData.active_tenant_id;
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
        // Attach active_tenant_id to the session object at the top level.
        // TypeScript doesn't know about this custom field, so we cast.
        (session as Record<string, unknown>).active_tenant_id = token.active_tenant_id ?? null;
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
