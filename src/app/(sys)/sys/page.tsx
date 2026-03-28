// src/app/sys/page.tsx
// System Admin dashboard — only accessible by the system admin (is_system_admin=1).
// This page manages schools (tenants) and user memberships.
//
// It has 3 sections:
// 1. Create School — makes a new tenant + assigns an admin to it
// 2. Find User — search by email, view memberships, add to schools
// 3. Schools List — all tenants in the system

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requireAuth, pbkdf2Hex, randomSaltHex } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { Card } from "@/components/ui/Card";

// ---------- Server Actions ----------
// These run on the server when forms are submitted.

// Creates a new school + assigns an admin to it.
async function createSchoolAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  if (auth.user!.is_system_admin !== 1) redirect("/");

  const tenantName = (formData.get("tenant_name") as string || "").trim();
  const adminName = (formData.get("admin_name") as string || "").trim();
  const adminEmail = (formData.get("admin_email") as string || "").toLowerCase().trim();
  const adminPassword = (formData.get("admin_password") as string || "");

  if (!tenantName || !adminName || !adminEmail || adminPassword.length < 6) {
    redirect("/sys?error=invalid");
  }

  const { first, run } = getDb();
  const { APP_SECRET } = getEnv();
  const now = new Date().toISOString();

  // Create the school (tenant).
  const tenantId = crypto.randomUUID();
  await run(
    "INSERT INTO tenants (id, name, status, created_at, updated_at) VALUES (?,?,'ACTIVE',?,?)",
    [tenantId, tenantName, now, now]
  );

  // Check if admin email already exists.
  const existing = await first<{ id: string }>(
    "SELECT id FROM qa_users WHERE email=? AND status='ACTIVE'",
    [adminEmail]
  );

  let userId = existing?.id;

  // If user doesn't exist, create them with the temporary password.
  if (!userId) {
    const saltHex = randomSaltHex();
    const iter = 40000;
    const hashHex = await pbkdf2Hex(adminPassword + "|" + APP_SECRET, saltHex, iter);
    userId = crypto.randomUUID();
    await run(
      "INSERT INTO qa_users (id, email, name, password_salt, password_hash, password_iter, is_system_admin, status, created_at, updated_at) VALUES (?,?,?,?,?,?,0,'ACTIVE',?,?)",
      [userId, adminEmail, adminName, saltHex, hashHex, iter, now, now]
    );
  }

  // Add or update their membership as SCHOOL_ADMIN.
  const mem = await first<{ id: string }>(
    "SELECT id FROM memberships WHERE user_id=? AND tenant_id=? ORDER BY created_at ASC LIMIT 1",
    [userId, tenantId]
  );

  if (!mem) {
    await run(
      "INSERT INTO memberships (id, user_id, tenant_id, role, status, created_at, updated_at) VALUES (?,?,?,'SCHOOL_ADMIN','ACTIVE',?,?)",
      [crypto.randomUUID(), userId, tenantId, now, now]
    );
  } else {
    await run(
      "UPDATE memberships SET role='SCHOOL_ADMIN', status='ACTIVE', updated_at=? WHERE id=?",
      [now, mem.id]
    );
  }

  redirect("/sys");
}

// Adds or updates a user's membership in a school.
async function addMemberAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  if (auth.user!.is_system_admin !== 1) redirect("/");

  const userId = (formData.get("user_id") as string || "").trim();
  const tenantId = (formData.get("tenant_id") as string || "").trim();
  const role = (formData.get("role") as string || "").trim();
  const q = (formData.get("q") as string || "").trim();

  if (!userId || !tenantId || !["STUDENT", "TEACHER", "SCHOOL_ADMIN"].includes(role)) {
    redirect("/sys");
  }

  const { first, run } = getDb();
  const now = new Date().toISOString();

  // Verify user and tenant exist.
  const u = await first("SELECT id FROM qa_users WHERE id=? AND status='ACTIVE'", [userId]);
  const t = await first("SELECT id FROM tenants WHERE id=? AND status='ACTIVE'", [tenantId]);
  if (!u || !t) redirect("/sys");

  // Add or update membership.
  const mem = await first<{ id: string }>(
    "SELECT id FROM memberships WHERE user_id=? AND tenant_id=? ORDER BY created_at ASC LIMIT 1",
    [userId, tenantId]
  );

  if (!mem) {
    await run(
      "INSERT INTO memberships (id, user_id, tenant_id, role, status, created_at, updated_at) VALUES (?,?,?,?,'ACTIVE',?,?)",
      [crypto.randomUUID(), userId, tenantId, role, now, now]
    );
  } else {
    await run(
      "UPDATE memberships SET role=?, status='ACTIVE', updated_at=? WHERE id=?",
      [role, now, mem.id]
    );
  }

  redirect(`/sys?q=${encodeURIComponent(q)}`);
}

// ---------- Page Component ----------

export default async function SysPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; error?: string }>;
}) {
  const auth = await requireAuth();
  if (auth.user!.is_system_admin !== 1) redirect("/");

  const params = await searchParams;
  const q = (params.q || "").trim().toLowerCase();
  const error = params.error;

  const { first, all } = getDb();

  // Fetch all schools.
  const tenants = await all<{ id: string; name: string; status: string }>(
    "SELECT id, name, status FROM tenants ORDER BY name ASC"
  );

  // If there's a search query, find matching users.
  let searchResults: {
    user: { id: string; email: string; name: string; is_system_admin: number };
    memberships: { tenant_name: string; role: string; status: string }[];
  }[] = [];

  if (q) {
    const users = await all<{
      id: string; email: string; name: string; is_system_admin: number; status: string;
    }>(
      "SELECT id, email, name, is_system_admin, status FROM qa_users WHERE lower(email) LIKE ? ORDER BY email ASC LIMIT 25",
      [`%${q}%`]
    );

    // For each user, fetch their memberships.
    for (const user of users) {
      const mems = await all<{ tenant_name: string; role: string; status: string }>(
        `SELECT t.name AS tenant_name, m.role, m.status
         FROM memberships m JOIN tenants t ON t.id = m.tenant_id
         WHERE m.user_id=? ORDER BY t.name ASC`,
        [user.id]
      );
      searchResults.push({ user, memberships: mems });
    }
  }

  const activeTenants = tenants.filter((t) => t.status === "ACTIVE");

  return (
    <main className="max-w-5xl mx-auto p-4">
      {/* Header */}
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-lg font-bold">System Admin</h1>
          <div className="flex gap-3 text-sm">
            <a href="/profile" className="text-teal-700 hover:underline">Profile</a>
            <a href="/logout" className="text-teal-700 hover:underline">Logout</a>
          </div>
        </div>
      </Card>

      {/* Error banner */}
      {error === "invalid" && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-3">
          Check inputs. Password must be 6+ characters.
        </div>
      )}

      {/* Create School form */}
      <Card title="Create School">
        <form action={createSchoolAction}>
          <label className="block text-sm mb-1">School name</label>
          <input name="tenant_name" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1">School Admin full name</label>
              <input name="admin_name" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm mb-1">School Admin email</label>
              <input name="admin_email" type="email" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>

          <label className="block text-sm mb-1 mt-3">Temporary password (used only if this email is NEW)</label>
          <input name="admin_password" type="text" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />

          <button type="submit" className="mt-3 px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
            Create school + admin
          </button>
        </form>
      </Card>

      {/* Find User search */}
      <Card title="Find user by email">
        <form action="/sys" method="get">
          <label className="block text-sm mb-1">Email contains</label>
          <div className="flex gap-2">
            <input
              name="q"
              defaultValue={q}
              placeholder="e.g. ama@"
              required
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
              Search
            </button>
          </div>
        </form>
      </Card>

      {/* Search results */}
      {q && (
        <Card title="User directory">
          <p className="text-sm text-gray-500 mb-3">
            Search: <strong>{q}</strong>
          </p>

          {searchResults.length === 0 ? (
            <p className="text-sm text-gray-400">No users found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">User</th>
                    <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Schools / Roles</th>
                    <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Add to school</th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map(({ user, memberships }) => (
                    <tr key={user.id} className="border-b border-gray-100">
                      <td className="py-3 px-2">
                        <div className="font-semibold">{user.email}</div>
                        <div className="text-xs text-gray-500">{user.name}</div>
                        {user.is_system_admin === 1 && (
                          <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-xs font-semibold">
                            System Admin
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-xs">
                        {memberships.length === 0 ? (
                          <span className="text-gray-400">No memberships</span>
                        ) : (
                          memberships.map((m, i) => (
                            <div key={i}>
                              {m.tenant_name}: {m.role} ({m.status})
                            </div>
                          ))
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <form action={addMemberAction}>
                          <input type="hidden" name="user_id" value={user.id} />
                          <input type="hidden" name="q" value={q} />
                          <select name="tenant_id" required className="w-full px-2 py-1 border border-gray-300 rounded-lg text-xs mb-1">
                            {activeTenants.length === 0 ? (
                              <option value="">No schools</option>
                            ) : (
                              activeTenants.map((t) => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))
                            )}
                          </select>
                          <select name="role" required className="w-full px-2 py-1 border border-gray-300 rounded-lg text-xs mb-1">
                            <option value="STUDENT">Student</option>
                            <option value="TEACHER">Teacher</option>
                            <option value="SCHOOL_ADMIN">School Admin</option>
                          </select>
                          <button type="submit" className="px-3 py-1 bg-teal-700 text-white text-xs font-semibold rounded-lg hover:bg-teal-800">
                            Add / Update
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Schools list */}
      <Card title="Schools">
        {tenants.length === 0 ? (
          <p className="text-sm text-gray-400">No schools yet</p>
        ) : (
          <ul className="list-disc list-inside text-sm">
            {tenants.map((t) => (
              <li key={t.id}>
                {t.name} <span className="text-gray-400">({t.status})</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
