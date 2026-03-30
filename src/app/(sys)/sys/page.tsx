import { redirect } from "next/navigation";
import { requireAuth, pbkdf2Hex, randomSaltHex } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";

type SysModule = "overview" | "schools" | "users";
type DrawerMode = "new-school" | "school-details" | "user-access";

const MODULE_META: Record<SysModule, { title: string; subtitle: string }> = {
  overview: {
    title: "Overview",
    subtitle: "Monitor system health and jump into high-impact actions.",
  },
  schools: {
    title: "Schools",
    subtitle: "Manage schools and review status across the platform.",
  },
  users: {
    title: "Users",
    subtitle: "Find users by email and manage school access memberships.",
  },
};

const SOON_MODULES = [
  "Payments",
  "Sessions Audit",
  "Auth Audit",
  "Question Bank",
  "Settings",
];

async function createSchoolAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  if (auth.user!.is_system_admin !== 1) redirect("/");

  const tenantName = ((formData.get("tenant_name") as string) || "").trim();
  const adminName = ((formData.get("admin_name") as string) || "").trim();
  const adminEmail = ((formData.get("admin_email") as string) || "").toLowerCase().trim();
  const adminPassword = (formData.get("admin_password") as string) || "";

  if (!tenantName || !adminName || !adminEmail || adminPassword.length < 6) {
    redirect("/sys?module=schools&drawer=new-school&error=invalid");
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

  redirect("/sys?module=schools");
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
    redirect(`/sys?module=users${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  }

  const { first, run } = getDb();
  const now = new Date().toISOString();

  const u = await first("SELECT id FROM qa_users WHERE id=? AND status='ACTIVE'", [userId]);
  const t = await first("SELECT id FROM tenants WHERE id=? AND status='ACTIVE'", [tenantId]);
  if (!u || !t) redirect(`/sys?module=users${q ? `&q=${encodeURIComponent(q)}` : ""}`);

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

  const params = new URLSearchParams({ module: "users" });
  if (q) params.set("q", q);
  params.set("drawer", "user-access");
  params.set("userId", userId);
  redirect(`/sys?${params.toString()}`);
}

function moduleHref(module: SysModule) {
  return `/sys?module=${module}`;
}

export default async function SysPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    error?: string;
    module?: string;
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
  const module = (["overview", "schools", "users"].includes(params.module || "")
    ? params.module
    : "overview") as SysModule;
  const drawer = (["new-school", "school-details", "user-access"].includes(params.drawer || "")
    ? params.drawer
    : undefined) as DrawerMode | undefined;

  const drawerSchoolId = (params.schoolId || "").trim();
  const drawerUserId = (params.userId || "").trim();
  const focusSearch = params.focus === "search";

  const { first, all } = getDb();

  const tenants = await all<{
    id: string;
    name: string;
    status: string;
    created_at: string;
    school_admin?: string | null;
    members_count?: number;
  }>(
    `SELECT
      t.id,
      t.name,
      t.status,
      t.created_at,
      (
        SELECT u.name
        FROM memberships m
        JOIN qa_users u ON u.id = m.user_id
        WHERE m.tenant_id = t.id AND m.role = 'SCHOOL_ADMIN'
        ORDER BY m.created_at ASC
        LIMIT 1
      ) AS school_admin,
      (
        SELECT COUNT(*)
        FROM memberships m2
        WHERE m2.tenant_id = t.id
      ) AS members_count
    FROM tenants t
    ORDER BY t.created_at DESC`
  );

  const activeTenants = tenants.filter((t) => t.status === "ACTIVE");

  const totalUsersRow = await first<{ c: number }>(
    "SELECT COUNT(*) AS c FROM qa_users WHERE status='ACTIVE'"
  );
  const noAccessRow = await first<{ c: number }>(
    `SELECT COUNT(*) AS c
     FROM qa_users u
     WHERE u.status='ACTIVE'
       AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id)`
  );

  let searchResults: {
    user: { id: string; email: string; name: string; is_system_admin: number; status: string };
    memberships: { tenant_name: string; role: string; status: string }[];
  }[] = [];

  if (q) {
    const users = await all<{
      id: string;
      email: string;
      name: string;
      is_system_admin: number;
      status: string;
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

  let selectedSchool: (typeof tenants)[number] | null = null;
  if (drawer === "school-details" && drawerSchoolId) {
    selectedSchool =
      tenants.find((t) => t.id === drawerSchoolId) ||
      (await first<{
        id: string;
        name: string;
        status: string;
        created_at: string;
        school_admin?: string | null;
        members_count?: number;
      }>(
        `SELECT
          t.id,
          t.name,
          t.status,
          t.created_at,
          (
            SELECT u.name
            FROM memberships m
            JOIN qa_users u ON u.id = m.user_id
            WHERE m.tenant_id = t.id AND m.role = 'SCHOOL_ADMIN'
            ORDER BY m.created_at ASC
            LIMIT 1
          ) AS school_admin,
          (
            SELECT COUNT(*)
            FROM memberships m2
            WHERE m2.tenant_id = t.id
          ) AS members_count
        FROM tenants t
        WHERE t.id = ?`,
        [drawerSchoolId]
      )) ||
      null;
  }

  let selectedUser:
    | { id: string; email: string; name: string; is_system_admin: number; status: string }
    | null = null;
  let selectedUserMemberships: { tenant_name: string; role: string; status: string }[] = [];

  if (drawer === "user-access" && drawerUserId) {
    selectedUser =
      (searchResults.find((r) => r.user.id === drawerUserId)?.user ??
        (await first<{
          id: string;
          email: string;
          name: string;
          is_system_admin: number;
          status: string;
        }>("SELECT id, email, name, is_system_admin, status FROM qa_users WHERE id=?", [drawerUserId]))) ||
      null;

    if (selectedUser) {
      selectedUserMemberships = await all<{ tenant_name: string; role: string; status: string }>(
        `SELECT t.name AS tenant_name, m.role, m.status
         FROM memberships m JOIN tenants t ON t.id = m.tenant_id
         WHERE m.user_id=? ORDER BY t.name ASC`,
        [selectedUser.id]
      );
    }
  }

  const meta = MODULE_META[module];
  const closeDrawerHref =
    module === "users"
      ? `/sys?module=users${q ? `&q=${encodeURIComponent(q)}` : ""}${focusSearch ? "&focus=search" : ""}`
      : `/sys?module=${module}`;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex w-full max-w-[1600px]">
        <aside className="w-72 border-r border-slate-200 bg-white p-4">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-wide text-slate-500">Console</p>
            <h1 className="text-xl font-bold">System Admin</h1>
          </div>

          <nav className="space-y-1">
            {(["overview", "schools", "users"] as SysModule[]).map((item) => {
              const active = module === item;
              return (
                <a
                  key={item}
                  href={moduleHref(item)}
                  className={`block rounded-lg px-3 py-2 text-sm font-medium ${
                    active
                      ? "bg-teal-50 text-teal-800 border border-teal-100"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {MODULE_META[item].title}
                </a>
              );
            })}
          </nav>

          <div className="my-4 border-t border-slate-200" />

          <div className="space-y-1">
            {SOON_MODULES.map((item) => (
              <div
                key={item}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-400"
              >
                <span>{item}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Soon
                </span>
              </div>
            ))}
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="flex items-center justify-between gap-4 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold">{meta.title}</h2>
                <p className="text-sm text-slate-500">{meta.subtitle}</p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  aria-label="Console search"
                  placeholder="Search in this module (coming soon)"
                  className="w-72 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <a href="/profile" className="text-sm font-medium text-teal-700 hover:underline">
                  Profile
                </a>
                <a href="/logout" className="text-sm font-medium text-teal-700 hover:underline">
                  Logout
                </a>
              </div>
            </div>
          </header>

          <div className="p-6">
            {error === "invalid" && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                Check inputs. Password must be 6+ characters.
              </div>
            )}

            {module === "overview" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    { label: "Total Schools", value: tenants.length },
                    { label: "Active Schools", value: activeTenants.length },
                    { label: "Total Users", value: totalUsersRow?.c ?? 0 },
                    { label: "Users With No Access", value: noAccessRow?.c ?? 0 },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-xl border border-slate-200 bg-white p-4">
                      <p className="text-sm text-slate-500">{stat.label}</p>
                      <p className="mt-2 text-2xl font-bold">{stat.value}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-4 xl:col-span-2">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-base font-semibold">Recent Schools</h3>
                      <a href="/sys?module=schools" className="text-sm text-teal-700 hover:underline">
                        View all
                      </a>
                    </div>
                    {tenants.length === 0 ? (
                      <p className="text-sm text-slate-400">No schools yet.</p>
                    ) : (
                      <ul className="divide-y divide-slate-100">
                        {tenants.slice(0, 6).map((t) => (
                          <li key={t.id} className="flex items-center justify-between py-3 text-sm">
                            <div>
                              <p className="font-medium">{t.name}</p>
                              <p className="text-xs text-slate-500">
                                {new Date(t.created_at).toLocaleDateString()} • {t.status}
                              </p>
                            </div>
                            <a
                              href={`/sys?module=schools&drawer=school-details&schoolId=${encodeURIComponent(t.id)}`}
                              className="text-teal-700 hover:underline"
                            >
                              Open
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h3 className="mb-3 text-base font-semibold">Quick Actions</h3>
                    <div className="space-y-2">
                      <a
                        href="/sys?module=schools&drawer=new-school"
                        className="block rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50"
                      >
                        New School
                      </a>
                      <a
                        href="/sys?module=users&focus=search"
                        className="block rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50"
                      >
                        Find User
                      </a>
                      <a
                        href="/sys?module=schools"
                        className="block rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50"
                      >
                        View Schools
                      </a>
                      <a
                        href="/sys?module=users"
                        className="block rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50"
                      >
                        View Users
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {module === "schools" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <form action="/sys" method="get" className="flex flex-1 items-center gap-2">
                    <input type="hidden" name="module" value="schools" />
                    <input
                      name="q"
                      defaultValue={q}
                      placeholder="Search schools"
                      className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-900"
                    >
                      Search
                    </button>
                  </form>
                  <a
                    href="/sys?module=schools&drawer=new-school"
                    className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
                  >
                    New School
                  </a>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left">School</th>
                        <th className="px-3 py-2 text-left">Status</th>
                        <th className="px-3 py-2 text-left">School Admin</th>
                        <th className="px-3 py-2 text-left">Members</th>
                        <th className="px-3 py-2 text-left">Created</th>
                        <th className="px-3 py-2 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenants
                        .filter((t) => !q || t.name.toLowerCase().includes(q))
                        .map((t) => (
                          <tr key={t.id} className="border-t border-slate-100">
                            <td className="px-3 py-3 font-medium">{t.name}</td>
                            <td className="px-3 py-3">
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold">
                                {t.status}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-slate-600">{t.school_admin || "—"}</td>
                            <td className="px-3 py-3 text-slate-600">{t.members_count ?? 0}</td>
                            <td className="px-3 py-3 text-slate-600">
                              {new Date(t.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-3 py-3">
                              <a
                                href={`/sys?module=schools&drawer=school-details&schoolId=${encodeURIComponent(t.id)}${
                                  q ? `&q=${encodeURIComponent(q)}` : ""
                                }`}
                                className="text-teal-700 hover:underline"
                              >
                                Open
                              </a>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {module === "users" && (
              <div className="space-y-4">
                <form action="/sys" method="get" className="flex items-center gap-2">
                  <input type="hidden" name="module" value="users" />
                  <input
                    name="q"
                    defaultValue={q}
                    placeholder="Search by email"
                    required
                    autoFocus={focusSearch}
                    className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
                  >
                    Search
                  </button>
                </form>

                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left">User</th>
                        <th className="px-3 py-2 text-left">Account Type</th>
                        <th className="px-3 py-2 text-left">Memberships</th>
                        <th className="px-3 py-2 text-left">Status</th>
                        <th className="px-3 py-2 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!q ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-400">
                            Search by email to view users.
                          </td>
                        </tr>
                      ) : searchResults.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-400">
                            No users found.
                          </td>
                        </tr>
                      ) : (
                        searchResults.map(({ user, memberships }) => (
                          <tr key={user.id} className="border-t border-slate-100">
                            <td className="px-3 py-3">
                              <div className="font-medium">{user.email}</div>
                              <div className="text-xs text-slate-500">{user.name}</div>
                            </td>
                            <td className="px-3 py-3">
                              {user.is_system_admin === 1 ? (
                                <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">
                                  System Admin
                                </span>
                              ) : (
                                <span className="text-slate-600">Standard User</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-xs text-slate-600">
                              {memberships.length === 0 ? (
                                <span className="text-slate-400">No memberships</span>
                              ) : (
                                memberships.map((m, i) => (
                                  <div key={i}>
                                    {m.tenant_name}: {m.role} ({m.status})
                                  </div>
                                ))
                              )}
                            </td>
                            <td className="px-3 py-3">{user.status}</td>
                            <td className="px-3 py-3">
                              <a
                                href={`/sys?module=users&drawer=user-access&userId=${encodeURIComponent(user.id)}&q=${encodeURIComponent(
                                  q
                                )}`}
                                className="text-teal-700 hover:underline"
                              >
                                Manage Access
                              </a>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </section>

        {drawer && (
          <aside className="w-[420px] border-l border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                {drawer === "new-school"
                  ? "New School"
                  : drawer === "school-details"
                  ? "School Details"
                  : "Manage User Access"}
              </h3>
              <a href={closeDrawerHref} className="text-sm text-slate-500 hover:text-slate-700">
                Close
              </a>
            </div>

            {drawer === "new-school" && (
              <form action={createSchoolAction} className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm">School name</label>
                  <input
                    name="tenant_name"
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm">School admin full name</label>
                  <input
                    name="admin_name"
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm">School admin email</label>
                  <input
                    name="admin_email"
                    type="email"
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm">Temporary password</label>
                  <input
                    name="admin_password"
                    type="text"
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Temporary password is only used if the admin email does not already belong to an
                    existing account.
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
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </a>
                </div>
              </form>
            )}

            {drawer === "school-details" && (
              <div className="space-y-3 text-sm">
                {!selectedSchool ? (
                  <p className="text-slate-500">School not found.</p>
                ) : (
                  <>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">School</p>
                      <p className="text-base font-semibold">{selectedSchool.name}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
                      <p>{selectedSchool.status}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Created</p>
                      <p>{new Date(selectedSchool.created_at).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">School Admin</p>
                      <p>{selectedSchool.school_admin || "Not assigned"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Members</p>
                      <p>{selectedSchool.members_count ?? 0}</p>
                    </div>
                  </>
                )}
              </div>
            )}

            {drawer === "user-access" && (
              <div className="space-y-4">
                {!selectedUser ? (
                  <p className="text-sm text-slate-500">User not found.</p>
                ) : (
                  <>
                    <div>
                      <p className="text-base font-semibold">{selectedUser.name || "Unnamed User"}</p>
                      <p className="text-sm text-slate-600">{selectedUser.email}</p>
                      {selectedUser.is_system_admin === 1 && (
                        <span className="mt-2 inline-block rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">
                          System Admin
                        </span>
                      )}
                    </div>

                    <div>
                      <h4 className="mb-2 text-sm font-semibold">Current memberships</h4>
                      {selectedUserMemberships.length === 0 ? (
                        <p className="text-sm text-slate-400">No memberships yet.</p>
                      ) : (
                        <ul className="space-y-1 text-sm text-slate-600">
                          {selectedUserMemberships.map((m, i) => (
                            <li key={i}>
                              {m.tenant_name}: {m.role} ({m.status})
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <form action={addMemberAction} className="space-y-3 rounded-lg border border-slate-200 p-3">
                      <input type="hidden" name="user_id" value={selectedUser.id} />
                      <input type="hidden" name="q" value={q} />
                      <div>
                        <label className="mb-1 block text-sm">School</label>
                        <select
                          name="tenant_id"
                          required
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
    </main>
  );
}
