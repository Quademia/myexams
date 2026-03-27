// src/app/switch-school/route.ts
// Switch school route — updates the active tenant on the user's session.
// This is a Route Handler (not a page) because it just does an action and redirects.
//
// HOW IT WORKS:
// 1. Read tenant_id from the query string (GET) or form body (POST)
// 2. Verify the user has an ACTIVE membership in that tenant
// 3. Call setActiveTenant() to update the session's active_tenant_id
// 4. Redirect to / — the root page will then route them to the correct dashboard
//
// The old build accepted both GET and POST for this route, so we export both.

import { redirect } from "next/navigation";
import { getAuth, setActiveTenant } from "@/lib/auth";
import { getDb } from "@/lib/db";

// Shared logic for both GET and POST — validates the tenant and switches.
async function switchSchool(tenantId: string | null) {
  // Must be logged in.
  const auth = await getAuth();
  if (!auth.user) {
    redirect("/login");
  }

  // Must have a tenant_id to switch to.
  if (!tenantId) {
    redirect("/choose-school");
  }

  // Verify the user has an ACTIVE membership in an ACTIVE tenant.
  const { first } = getDb();
  const mem = await first<{ tenant_id: string }>(
    `SELECT m.tenant_id
     FROM memberships m
     JOIN tenants t ON t.id = m.tenant_id
     WHERE m.user_id = ? AND m.tenant_id = ? AND m.status = 'ACTIVE' AND t.status = 'ACTIVE'
     LIMIT 1`,
    [auth.user.id, tenantId]
  );

  if (!mem) {
    redirect("/choose-school");
  }

  // All good — update the session and redirect to the root.
  await setActiveTenant(tenantId);
  redirect("/");
}

// GET /switch-school?tenant_id=abc
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenant_id");
  await switchSchool(tenantId);
}

// POST /switch-school (tenant_id in form body)
export async function POST(request: Request) {
  const formData = await request.formData();
  const tenantId = (formData.get("tenant_id") as string) || null;
  await switchSchool(tenantId);
}
