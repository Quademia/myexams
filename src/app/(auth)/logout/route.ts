// src/app/(auth)/logout/route.ts
// Logout route — expires the D1 session row, then clears the NextAuth JWT
// cookie and redirects to /login.
//
// HOW IT WORKS:
// 1. Read the current session to get the session_token stored in the JWT.
// 2. Get the D1 binding via getCloudflareContext (needed by expireSession).
// 3. Expire the D1 session row (fire-and-forget) so it no longer counts
//    toward the concurrent session limit.
// 4. Call NextAuth's signOut() to delete the JWT cookie and redirect.

import { auth, signOut } from "@/auth";
import { expireSession } from "@/lib/sessions";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Force this route to be dynamic — never pre-render at build time.
// Without this, Next.js tries to collect page data during build,
// which fails because getCloudflareContext() isn't available at build time.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as any).DB as D1Database;

  // Expire the session row in D1 before signing out.
  const session = await auth();
  const sessionToken = session?.user?.session_token;
  const { searchParams } = new URL(request.url);
  const reason = searchParams.get("reason") || "logout";

  if (sessionToken) {
    await expireSession(db, sessionToken, reason);
  }

  await signOut({ redirectTo: "/login" });
}
