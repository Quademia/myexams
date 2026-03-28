// src/auth.ts
// NextAuth v5 configuration for Cloudflare Workers + D1.
//
// HOW IT WORKS:
// - NextAuth handles authentication (sign-in, sign-out, session management).
// - We use the D1 adapter so NextAuth stores its own data (accounts, sessions,
//   verification tokens) in our Cloudflare D1 database.
// - Three providers are configured:
//     1. Credentials — email + password (placeholder for now, wired up in Prompt 2).
//     2. Google — OAuth via Google.
//     3. Microsoft Entra ID — OAuth via Microsoft (Azure AD).
// - We use JWT sessions because Cloudflare Workers is an edge runtime and
//   cannot use database sessions (no persistent connections).
// - The signIn callback auto-creates a qa_users row for first-time SSO users,
//   so they appear in our app's user table immediately.

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import MicrosoftEntraId from "next-auth/providers/microsoft-entra-id";
import { D1Adapter } from "@auth/d1-adapter";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Build and export the NextAuth handler + helpers.
// We wrap everything in a function so we can await getCloudflareContext()
// (needed on Cloudflare Workers to access the D1 binding at request time).

export const { handlers, signIn, signOut, auth } = NextAuth(async () => {
  // Grab the D1 database binding from Cloudflare's runtime environment.
  // The { async: true } flag is required for OpenNext on Workers.
  const { env } = await getCloudflareContext({ async: true });
  const adapter = D1Adapter(env.DB);

  return {
    // ── Adapter ──────────────────────────────────────────────────────────
    // Tells NextAuth to store users, accounts, and tokens in our D1 database.
    adapter,

    // ── Providers ────────────────────────────────────────────────────────
    providers: [
      // 1. Credentials — email + password login.
      //    The authorize function validates the credentials the user typed in.
      //    Right now it's a placeholder that always rejects; we'll fill it in
      //    in Prompt 2 once the password-checking logic is wired up.
      Credentials({
        name: "Email & Password",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize() {
          // TODO (Prompt 2): look up qa_users row, verify password hash, return user.
          return null;
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

    // ── Callbacks ───────────────────────────────────────────────────────
    callbacks: {
      // The jwt callback runs every time a JWT is created or updated.
      // We stash the user's ID into the token so it's available later.
      async jwt({ token, user }) {
        if (user?.id) {
          token.sub = user.id;
        }
        return token;
      },

      // The session callback controls what's exposed to the client.
      // We copy the user ID from the JWT token into session.user.id.
      async session({ session, token }) {
        if (token.sub && session.user) {
          session.user.id = token.sub;
        }
        return session;
      },

      // The signIn callback runs after a provider authenticates a user but
      // BEFORE the session is created. We use it to auto-create a qa_users
      // row for first-time Google/Microsoft SSO users.
      async signIn({ user, account }) {
        // Only run for OAuth providers (Google, Microsoft).
        // Credentials are handled separately in the authorize function.
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
            // - id: we generate a short random ID matching the existing pattern.
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
