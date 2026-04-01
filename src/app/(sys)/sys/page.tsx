// src/app/sys/page.tsx
// System Admin Workspace — Phase 6 of the workspace restructure.
// Uses WorkspaceShell with sidebar. URL state drives sections and drawers.

import { redirect } from "next/navigation";
import { requireAuth, pbkdf2Hex, randomSaltHex } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { WorkspaceHeader } from "@/components/layout/WorkspaceHeader";
import { SidebarNav } from "@/components/layout/SidebarNav";
import { getSysNavItems } from "@/lib/sys-nav";
import { changePasswordAction } from "@/lib/change-password";
import { OverviewSection } from "@/components/sys/OverviewSection";
import { SchoolsSection } from "@/components/sys/SchoolsSection";
import { UsersSection } from "@/components/sys/UsersSection";

// ── Types ───────────────────────────────────────────────────────────────

type Section = "overview" | "schools" | "users";
type DrawerMode = "new-school" | "school-details" | "user-access";

interface TenantRow {
  id: string;
  name: string;
  status: string;
  created_at: string;
  school_admin?: string | null;
  members_count?: number;
}

const SECTION_META: Record<Section, { title: string; subtitle: string }> = {
  overview: { title: "Overview", subtitle: "Monitor system health and jump into high-impact actions." },
  schools: { title: "Schools", subtitle: "Manage schools and review status across the platform." },
  users: { title: "Users", subtitle: "Find users by email and manage school access memberships." },
};

// ── Server Actions ──────────────────────────────────────────────────────

async function createSchoolAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  if (auth.user!.is_system_admin !== 1) redirect("/");

  const tenantName = ((formData.get("tenant_name") as string) || "").trim();
  const adminName = ((formData.get("admin_name") as string) || "").trim();
  const adminEmail = ((formData.get("admin_email") as string) || "").toLowerCase().trim();
  const adminPassword = (formData.get("admin_password") as string) || "";

  if (!tenantName || !adminName || !adminEmail || adminPassword.length < 6) {
    redirect("/sys?section=schools&drawer=new-school&error=invalid");
  }

  const { first, run } = getDb();
  const { APP_SECRET } = getEnv();
  const now = new Date().toISOString();

  const tenantId = crypto.randomUUID();
  await run(
    "INSERT INTO tenants (id, name, status, created_at, updated_at) VALUES (?,?,'ACTIVE',?,?)",
    [tenantId, tenantName, now, now]
  );

  const existing = await first<{ id: string }>(
    "SELECT id FROM qa_users WHERE email=? AND status='ACTIVE'",
    [adminEmail]
  );

  let userId = existing?.id;

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

  redirect("/sys?section=schools&toast=School+created");
}

async function addMemberAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  if (auth.user!.is_system_admin !== 1) redirect("/");

  const userId = ((formData.get("user_id") as string) || "").trim();
  const tenantId = ((formData.get("tenant_id") as string) || "").trim();
  const role = ((formData.get("role") as string) || "").trim();
  const q = ((formData.get("q") as string) || "").trim();

  if (!userId || !tenantId || !["STUDENT", "TEACHER", "SCHOOL_ADMIN"].includes(role)) {
    redirect(`/sys?section=users${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  }

  const { first, run } = getDb();
  const now = new Date().toISOString();

  const u = await first("SELECT id FROM qa_users WHERE id=? AND status='ACTIVE'", [userId]);
  const t = await first("SELECT id FROM tenants WHERE id=? AND status='ACTIVE'", [tenantId]);
  if (!u || !t) redirect(`/sys?section=users${q ? `&q=${encodeURIComponent(q)}` : ""}`);

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

  const params = new URLSearchParams({ section: "users" });
  if (q) params.set("q", q);
  params.set("drawer", "user-access");
  params.set("userId", userId);
  params.set("toast", "Member added");
  redirect(`/sys?${params.toString()}`);
}

// ── Page Component ──────────────────────────────────────────────────────

export default async function SysPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    error?: string;
    section?: string;
    drawer?: string;
    schoolId?: string;
    userId?: string;
    focus?: string;
  }>;
}) {
  const auth = await requireAuth();
  if (auth.user!.is_system_admin !== 1) redirect("/");

  const params = await searchParams;
  const q = (params.q || "").trim().toLowerCase();
  const error = params.error;
  const section = (["overview", "schools", "users"].includes(params.section || "")
    ? params.section
    : "overview") as Section;
  const drawer = (["new-school", "school-details", "user-access"].includes(params.drawer || "")
    ? params.drawer
    : undefined) as DrawerMode | undefined;
  const drawerSchoolId = (params.schoolId || "").trim();
  const drawerUserId = (params.userId || "").trim();
  const focusSearch = params.focus === "search";

  // ── Data loading ────────────────────────────────────────────────────

  const { first, all } = getDb();

  const tenants = await all<TenantRow>(
    `SELECT
      t.id, t.name, t.status, t.created_at,
      (SELECT u.name FROM memberships m JOIN qa_users u ON u.id = m.user_id
       WHERE m.tenant_id = t.id AND m.role = 'SCHOOL_ADMIN'
       ORDER BY m.created_at ASC LIMIT 1) AS school_admin,
      (SELECT COUNT(*) FROM memberships m2 WHERE m2.tenant_id = t.id) AS members_count
    FROM tenants t
    ORDER BY t.created_at DESC`
  );

  const activeTenants = tenants.filter((t) => t.status === "ACTIVE");

  const totalUsersRow = await first<{ c: number }>(
    "SELECT COUNT(*) AS c FROM qa_users WHERE status='ACTIVE'"
  );
  const noAccessRow = await first<{ c: number }>(
    `SELECT COUNT(*) AS c FROM qa_users u
     WHERE u.status='ACTIVE'
       AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id)`
  );

  // User search (only when query present)
  let searchResults: {
    user: { id: string; email: string; name: string; is_system_admin: number; status: string };
    memberships: { tenant_name: string; role: string; status: string }[];
  }[] = [];

  if (q) {
    const users = await all<{
      id: string; email: string; name: string; is_system_admin: number; status: string;
    }>(
      "SELECT id, email, name, is_system_admin, status FROM qa_users WHERE lower(email) LIKE ? ORDER BY email ASC LIMIT 25",
      [`%${q}%`]
    );
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

  // Drawer data
  let selectedSchool: TenantRow | null = null;
  if (drawer === "school-details" && drawerSchoolId) {
    selectedSchool =
      tenants.find((t) => t.id === drawerSchoolId) ||
      (await first<TenantRow>(
        `SELECT t.id, t.name, t.status, t.created_at,
          (SELECT u.name FROM memberships m JOIN qa_users u ON u.id = m.user_id
           WHERE m.tenant_id = t.id AND m.role = 'SCHOOL_ADMIN'
           ORDER BY m.created_at ASC LIMIT 1) AS school_admin,
          (SELECT COUNT(*) FROM memberships m2 WHERE m2.tenant_id = t.id) AS members_count
        FROM tenants t WHERE t.id = ?`,
        [drawerSchoolId]
      )) ||
      null;
  }

  let selectedUser: { id: string; email: string; name: string; is_system_admin: number; status: string } | null = null;
  let selectedUserMemberships: { tenant_name: string; role: string; status: string }[] = [];

  if (drawer === "user-access" && drawerUserId) {
    selectedUser =
      (searchResults.find((r) => r.user.id === drawerUserId)?.user ??
        (await first<{ id: string; email: string; name: string; is_system_admin: number; status: string }>(
          "SELECT id, email, name, is_system_admin, status FROM qa_users WHERE id=?",
          [drawerUserId]
        ))) || null;

    if (selectedUser) {
      selectedUserMemberships = await all<{ tenant_name: string; role: string; status: string }>(
        `SELECT t.name AS tenant_name, m.role, m.status
         FROM memberships m JOIN tenants t ON t.id = m.tenant_id
         WHERE m.user_id=? ORDER BY t.name ASC`,
        [selectedUser.id]
      );
    }
  }

  const meta = SECTION_META[section];
  const closeDrawerHref =
    section === "users"
      ? `/sys?section=users${q ? `&q=${encodeURIComponent(q)}` : ""}${focusSearch ? "&focus=search" : ""}`
      : `/sys?section=${section}`;

  // Sidebar current path for active state detection
  const currentPath = section === "overview" ? "/sys" : `/sys?section=${section}`;

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <WorkspaceShell
      sidebar={
        <SidebarNav
          items={getSysNavItems()}
          schoolName="QAcademy"
          roleName="System Admin"
          currentPath={currentPath}
          profile={{
            user: { id: auth.user!.id, name: auth.user!.name, email: auth.user!.email, is_system_admin: auth.user!.is_system_admin },
            memberships: auth.memberships.map(m => ({ tenant_id: m.tenant_id, tenant_name: m.tenant_name, role: m.role, status: "ACTIVE" })),
            changePasswordAction,
          }}
        />
      }
      header={
        <WorkspaceHeader
          title={meta.title}
          subtitle={meta.subtitle}
        />
      }
    >
      {/* Error banner */}
      {error === "invalid" && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Check inputs. Password must be 6+ characters.
        </div>
      )}

      {/* Main content area with optional drawer */}
      <div className="flex gap-0 min-h-0">
        {/* Section content */}
        <div className={`flex-1 min-w-0 ${drawer ? "pr-0" : ""}`}>
          {section === "overview" && (
            <OverviewSection
              tenants={tenants}
              activeTenantCount={activeTenants.length}
              totalUsers={Number(totalUsersRow?.c ?? 0)}
              noAccessUsers={Number(noAccessRow?.c ?? 0)}
            />
          )}

          {section === "schools" && (
            <SchoolsSection tenants={tenants} q={q} />
          )}

          {section === "users" && (
            <UsersSection searchResults={searchResults} q={q} focusSearch={focusSearch} />
          )}
        </div>

        {/* Inline drawer panel */}
        {drawer && (
          <aside className="w-[380px] flex-shrink-0 border-l border-gray-200 bg-white p-5 ml-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                {drawer === "new-school"
                  ? "New School"
                  : drawer === "school-details"
                  ? "School Details"
                  : "Manage User Access"}
              </h3>
              <a href={closeDrawerHref} className="text-sm text-gray-500 hover:text-gray-700">
                Close
              </a>
            </div>

            {/* New School drawer */}
            {drawer === "new-school" && (
              <form action={createSchoolAction} className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm">School name</label>
                  <input
                    name="tenant_name"
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm">School admin full name</label>
                  <input
                    name="admin_name"
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm">School admin email</label>
                  <input
                    name="admin_email"
                    type="email"
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm">Temporary password</label>
                  <input
                    name="admin_password"
                    type="text"
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Temporary password is only used if the admin email does not already belong to an existing account.
                  </p>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
                  >
                    Create School
                  </button>
                  <a
                    href={closeDrawerHref}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </a>
                </div>
              </form>
            )}

            {/* School Details drawer */}
            {drawer === "school-details" && (
              <div className="space-y-3 text-sm">
                {!selectedSchool ? (
                  <p className="text-gray-500">School not found.</p>
                ) : (
                  <>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500">School</p>
                      <p className="text-base font-semibold">{selectedSchool.name}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500">Status</p>
                      <p>{selectedSchool.status}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500">Created</p>
                      <p>{new Date(selectedSchool.created_at).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500">School Admin</p>
                      <p>{selectedSchool.school_admin || "Not assigned"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500">Members</p>
                      <p>{selectedSchool.members_count ?? 0}</p>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* User Access drawer */}
            {drawer === "user-access" && (
              <div className="space-y-4">
                {!selectedUser ? (
                  <p className="text-sm text-gray-500">User not found.</p>
                ) : (
                  <>
                    <div>
                      <p className="text-base font-semibold">{selectedUser.name || "Unnamed User"}</p>
                      <p className="text-sm text-gray-600">{selectedUser.email}</p>
                      {selectedUser.is_system_admin === 1 && (
                        <span className="mt-2 inline-block rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">
                          System Admin
                        </span>
                      )}
                    </div>

                    <div>
                      <h4 className="mb-2 text-sm font-semibold">Current memberships</h4>
                      {selectedUserMemberships.length === 0 ? (
                        <p className="text-sm text-gray-400">No memberships yet.</p>
                      ) : (
                        <ul className="space-y-1 text-sm text-gray-600">
                          {selectedUserMemberships.map((m, i) => (
                            <li key={i}>
                              {m.tenant_name}: {m.role} ({m.status})
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <form action={addMemberAction} className="space-y-3 rounded-lg border border-gray-200 p-3">
                      <input type="hidden" name="user_id" value={selectedUser.id} />
                      <input type="hidden" name="q" value={q} />
                      <div>
                        <label className="mb-1 block text-sm">School</label>
                        <select
                          name="tenant_id"
                          required
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        >
                          {activeTenants.length === 0 ? (
                            <option value="">No schools</option>
                          ) : (
                            activeTenants.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm">Role</label>
                        <select
                          name="role"
                          required
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        >
                          <option value="STUDENT">Student</option>
                          <option value="TEACHER">Teacher</option>
                          <option value="SCHOOL_ADMIN">School Admin</option>
                        </select>
                      </div>
                      <button
                        type="submit"
                        className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
                      >
                        Add / Update Access
                      </button>
                    </form>
                  </>
                )}
              </div>
            )}
          </aside>
        )}
      </div>
    </WorkspaceShell>
  );
}
