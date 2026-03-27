// src/app/logout/route.ts
// Logout route — destroys the session and redirects to /login.
// This is a Route Handler (not a page) because it just does an action and redirects.
// Route Handlers are Next.js's version of API endpoints.

import { redirect } from "next/navigation";
import { destroySession } from "@/lib/auth";

export async function GET() {
  await destroySession();
  redirect("/login");
}
