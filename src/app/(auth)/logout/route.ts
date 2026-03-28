// src/app/(auth)/logout/route.ts
// Logout route — clears the NextAuth session and redirects to /login.
//
// HOW IT WORKS:
// We call NextAuth's signOut() with redirectTo: "/login".
// signOut() deletes the JWT cookie and then sends a redirect response.
// This replaces the old code that manually deleted a row from the sessions
// table and cleared the qa_sess cookie.

import { signOut } from "@/auth";

// Force this route to be dynamic — never pre-render at build time.
// Without this, Next.js tries to collect page data during build,
// which fails because getCloudflareContext() isn't available at build time.
export const dynamic = "force-dynamic";

export async function GET() {
  await signOut({ redirectTo: "/login" });
}
