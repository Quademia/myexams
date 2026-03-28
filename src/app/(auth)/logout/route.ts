// src/app/(auth)/logout/route.ts
// Logout route — clears the NextAuth session and redirects to /login.
//
// HOW IT WORKS:
// We call NextAuth's signOut() with redirectTo: "/login".
// signOut() deletes the JWT cookie and then sends a redirect response.
// This replaces the old code that manually deleted a row from the sessions
// table and cleared the qa_sess cookie.

import { signOut } from "@/auth";

export async function GET() {
  await signOut({ redirectTo: "/login" });
}
