// src/app/page.tsx
// Root page — redirects users to the right place based on their role.
// Same logic as the old "/" route in auth.js.
//
// Flow:
// 1. Not logged in → /login
// 2. System admin → /sys
// 3. No memberships → /no-access
// 4. No active school → /choose-school (or auto-select if only one)
// 5. Active school → /school, /teacher, or /student based on role

import { redirect } from "next/navigation";
import { getAuth, pickActiveMembership, setActiveTenant } from "@/lib/auth";

export default async function Home() {
  const auth = await getAuth();

  if (!auth.user) redirect("/login");
  if (auth.user.is_system_admin === 1) redirect("/sys");
  if (!auth.memberships.length) redirect("/no-access");

  const active = pickActiveMembership(auth);

  if (!active) {
    if (auth.memberships.length === 1) {
      await setActiveTenant(auth.memberships[0].tenant_id);
      // Re-check after setting
      const role = auth.memberships[0].role;
      if (role === "SCHOOL_ADMIN") redirect("/school");
      if (role === "TEACHER") redirect("/teacher");
      if (role === "STUDENT") redirect("/student");
      redirect("/no-access");
    }
    redirect("/choose-school");
  }

  if (active.role === "SCHOOL_ADMIN") redirect("/school");
  if (active.role === "TEACHER") redirect("/teacher");
  if (active.role === "STUDENT") redirect("/student");
  redirect("/no-access");
}
