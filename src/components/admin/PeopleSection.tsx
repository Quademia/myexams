// src/components/admin/PeopleSection.tsx
// People management — 2 tabs: Members (with filters) and Add Person.
// Extracted from /school-people page for use inside the admin workspace.

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership, pbkdf2Hex, randomSaltHex } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { Card } from "@/components/ui/Card";
import { TabNav } from "@/components/ui/TabNav";
import { ConfirmButton } from "@/components/ui/ConfirmButton";

// ============================================================
// Server Actions
// ============================================================

const BASE = "/school?section=people";

async function updateRoleAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const userId = (formData.get("user_id") as string || "").trim();
  const role = (formData.get("role") as string || "").trim();
  if (!userId || !["STUDENT", "TEACHER", "SCHOOL_ADMIN"].includes(role)) redirect(BASE);

  if (userId === auth.user!.id && role !== "SCHOOL_ADMIN") {
    redirect(`${BASE}&error=self`);
  }

  const { first, run } = getDb();
  const m = await first<{ id: string }>(
    "SELECT id FROM memberships WHERE tenant_id=? AND user_id=? AND status='ACTIVE' ORDER BY created_at ASC LIMIT 1",
    [active.tenant_id, userId]
  );
  if (!m) redirect(BASE);
  await run("UPDATE memberships SET role=?, updated_at=? WHERE id=?", [role, new Date().toISOString(), m.id]);
  redirect(`${BASE}&toast=Role+updated`);
}

async function removeMemberAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const userId = (formData.get("user_id") as string || "").trim();
  if (!userId) redirect(BASE);
  if (userId === auth.user!.id) redirect(`${BASE}&error=self_remove`);

  const { all, run } = getDb();
  const now = new Date().toISOString();

  await run("UPDATE memberships SET status='REMOVED', updated_at=? WHERE tenant_id=? AND user_id=? AND status='ACTIVE'",
    [now, active.tenant_id, userId]);

  const courseIds = await all<{ id: string }>("SELECT id FROM courses WHERE tenant_id=?", [active.tenant_id]);
  for (const c of courseIds) {
    await run("DELETE FROM course_teachers WHERE course_id=? AND user_id=?", [c.id, userId]);
    await run("DELETE FROM enrollments WHERE course_id=? AND user_id=?", [c.id, userId]);
  }
  redirect(`${BASE}&toast=Member+removed`);
}

async function checkEmailAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");
  const email = (formData.get("email") as string || "").toLowerCase().trim();
  if (!email) redirect(`${BASE}&tab=add`);

  const { first } = getDb();
  const u = await first<{ id: string; name: string }>(
    "SELECT id, name FROM qa_users WHERE email=? AND status='ACTIVE'", [email]
  );

  if (u) {
    redirect(`${BASE}&tab=add&email=${encodeURIComponent(email)}&exists=1&user_name=${encodeURIComponent(u.name)}`);
  }
  redirect(`${BASE}&tab=add&email=${encodeURIComponent(email)}&exists=0`);
}

async function addExistingUserAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const email = (formData.get("email") as string || "").toLowerCase().trim();
  const role = (formData.get("role") as string || "").trim();
  if (!email || !["STUDENT", "TEACHER", "SCHOOL_ADMIN"].includes(role)) redirect(`${BASE}&tab=add`);

  const { first, run } = getDb();
  const u = await first<{ id: string }>("SELECT id FROM qa_users WHERE email=? AND status='ACTIVE'", [email]);
  if (!u) redirect(`${BASE}&tab=add`);

  const now = new Date().toISOString();
  const m = await first<{ id: string }>(
    "SELECT id FROM memberships WHERE user_id=? AND tenant_id=? ORDER BY created_at ASC LIMIT 1",
    [u.id, active.tenant_id]
  );
  if (!m) {
    await run("INSERT INTO memberships (id, user_id, tenant_id, role, status, created_at, updated_at) VALUES (?,?,?,?,'ACTIVE',?,?)",
      [crypto.randomUUID(), u.id, active.tenant_id, role, now, now]);
  } else {
    await run("UPDATE memberships SET role=?, status='ACTIVE', updated_at=? WHERE id=?", [role, now, m.id]);
  }
  redirect(`${BASE}&tab=members&toast=Person+added+to+school`);
}

async function addNewUserAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const name = (formData.get("name") as string || "").trim();
  const email = (formData.get("email") as string || "").toLowerCase().trim();
  const role = (formData.get("role") as string || "").trim();
  const password = (formData.get("password") as string || "");

  if (!name || !email || !["STUDENT", "TEACHER", "SCHOOL_ADMIN"].includes(role) || password.length < 6) {
    redirect(`${BASE}&tab=add&error=invalid`);
  }

  const { first, run } = getDb();
  const { APP_SECRET } = getEnv();
  const now = new Date().toISOString();

  let u = await first<{ id: string }>("SELECT id FROM qa_users WHERE email=? AND status='ACTIVE'", [email]);
  let userId = u?.id;
  if (!userId) {
    const saltHex = randomSaltHex();
    const iter = 40000;
    const hashHex = await pbkdf2Hex(password + "|" + APP_SECRET, saltHex, iter);
    userId = crypto.randomUUID();
    await run(
      "INSERT INTO qa_users (id, email, name, password_salt, password_hash, password_iter, is_system_admin, status, created_at, updated_at) VALUES (?,?,?,?,?,?,0,'ACTIVE',?,?)",
      [userId, email, name, saltHex, hashHex, iter, now, now]
    );
  }

  const m = await first<{ id: string }>(
    "SELECT id FROM memberships WHERE user_id=? AND tenant_id=? ORDER BY created_at ASC LIMIT 1",
    [userId, active.tenant_id]
  );
  if (!m) {
    await run("INSERT INTO memberships (id, user_id, tenant_id, role, status, created_at, updated_at) VALUES (?,?,?,?,'ACTIVE',?,?)",
      [crypto.randomUUID(), userId, active.tenant_id, role, now, now]);
  } else {
    await run("UPDATE memberships SET role=?, status='ACTIVE', updated_at=? WHERE id=?", [role, now, m.id]);
  }
  redirect(`${BASE}&tab=members&toast=Person+created+and+added`);
}

// ============================================================
// Main Component
// ============================================================

interface PeopleSectionProps {
  tenantId: string;
  userId: string;
  tab: string;
  filterRole?: string;
  filterCourseId?: string;
  filterClassId?: string;
  email?: string;
  exists?: string;
  userName?: string;
  error?: string;
}

export async function PeopleSection({
  tenantId, userId, tab,
  filterRole, filterCourseId, filterClassId,
  email, exists, userName, error,
}: PeopleSectionProps) {
  const tabs = [
    { label: "Members", value: "members", href: `${BASE}&tab=members` },
    { label: "Add Person", value: "add", href: `${BASE}&tab=add` },
  ];

  return (
    <>
      <TabNav tabs={tabs} activeTab={tab} />

      {error === "self" && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-3">
          You cannot remove your own School Admin role.
        </div>
      )}
      {error === "self_remove" && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-3">
          You cannot remove yourself.
        </div>
      )}

      {tab === "members" && <MembersTab tenantId={tenantId} currentUserId={userId} filterRole={filterRole || ""} filterCourseId={filterCourseId || ""} filterClassId={filterClassId || ""} />}
      {tab === "add" && <AddPersonTab email={email} exists={exists} userName={userName} error={error} />}
    </>
  );
}

// ============================================================
// Members Tab
// ============================================================

async function MembersTab({
  tenantId, currentUserId, filterRole, filterCourseId, filterClassId,
}: {
  tenantId: string; currentUserId: string;
  filterRole: string; filterCourseId: string; filterClassId: string;
}) {
  const { all } = getDb();

  let sql = `SELECT DISTINCT u.id, u.name, u.email, m.role
             FROM memberships m JOIN qa_users u ON u.id=m.user_id
             WHERE m.tenant_id=? AND m.status='ACTIVE' AND u.status='ACTIVE'`;
  const sqlParams: unknown[] = [tenantId];

  if (filterRole) { sql += ` AND m.role=?`; sqlParams.push(filterRole); }
  if (filterCourseId) {
    sql += ` AND (EXISTS (SELECT 1 FROM enrollments e WHERE e.user_id=m.user_id AND e.course_id=?)
              OR EXISTS (SELECT 1 FROM course_teachers ct WHERE ct.user_id=m.user_id AND ct.course_id=?))`;
    sqlParams.push(filterCourseId, filterCourseId);
  }
  if (filterClassId) {
    sql += ` AND EXISTS (SELECT 1 FROM class_students cs WHERE cs.user_id=m.user_id AND cs.class_id=?)`;
    sqlParams.push(filterClassId);
  }
  sql += ` ORDER BY m.role ASC, u.name ASC`;

  const members = await all<{ id: string; name: string; email: string; role: string }>(sql, sqlParams);
  const memberIds = members.map((m) => m.id);

  const coursesByUser: Record<string, string[]> = {};
  const classesByUser: Record<string, string[]> = {};

  if (memberIds.length > 0) {
    const ph = memberIds.map(() => "?").join(",");
    const enrolledCourses = await all<{ user_id: string; title: string }>(
      `SELECT e.user_id, c.title FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.user_id IN (${ph}) AND c.status='ACTIVE' ORDER BY c.title ASC`, memberIds);
    const taughtCourses = await all<{ user_id: string; title: string }>(
      `SELECT ct.user_id, c.title FROM course_teachers ct JOIN courses c ON c.id=ct.course_id WHERE ct.user_id IN (${ph}) AND c.status='ACTIVE' ORDER BY c.title ASC`, memberIds);
    const memberClasses = await all<{ user_id: string; name: string }>(
      `SELECT cs.user_id, cl.name FROM class_students cs JOIN classes cl ON cl.id=cs.class_id WHERE cs.user_id IN (${ph}) AND cl.status='ACTIVE' ORDER BY cl.name ASC`, memberIds);

    for (const r of enrolledCourses) { if (!coursesByUser[r.user_id]) coursesByUser[r.user_id] = []; coursesByUser[r.user_id].push(r.title); }
    for (const r of taughtCourses) { if (!coursesByUser[r.user_id]) coursesByUser[r.user_id] = []; if (!coursesByUser[r.user_id].includes(r.title)) coursesByUser[r.user_id].push(r.title); }
    for (const r of memberClasses) { if (!classesByUser[r.user_id]) classesByUser[r.user_id] = []; classesByUser[r.user_id].push(r.name); }
  }

  const allCourses = await all<{ id: string; title: string }>("SELECT id, title FROM courses WHERE tenant_id=? AND status='ACTIVE' ORDER BY title ASC", [tenantId]);
  const allClasses = await all<{ id: string; name: string }>("SELECT id, name FROM classes WHERE tenant_id=? AND status='ACTIVE' ORDER BY name ASC", [tenantId]);

  return (
    <>
      <Card title="Filter">
        <form action="/school" method="get">
          <input type="hidden" name="section" value="people" />
          <input type="hidden" name="tab" value="members" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-sm mb-1">Role</label>
              <select name="role" defaultValue={filterRole} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="">All roles</option>
                <option value="STUDENT">Student</option>
                <option value="TEACHER">Teacher</option>
                <option value="SCHOOL_ADMIN">School Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-sm mb-1">Course</label>
              <select name="course_id" defaultValue={filterCourseId} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="">All courses</option>
                {allCourses.map((c) => (<option key={c.id} value={c.id}>{c.title}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm mb-1">Class</label>
              <select name="class_id" defaultValue={filterClassId} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="">All classes</option>
                {allClasses.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </div>
          </div>
          <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">Apply filters</button>
        </form>
      </Card>

      <Card title={`Members (${members.length})`}>
        {members.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No members match the filters</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Member</th>
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Role</th>
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const isSelf = m.id === currentUserId;
                  const userCourses = coursesByUser[m.id] || [];
                  const userClasses = classesByUser[m.id] || [];
                  return (
                    <tr key={m.id} className="border-b border-gray-100">
                      <td className="py-3 px-2">
                        <div className="font-semibold">
                          {m.name}
                          {isSelf && <span className="ml-1 inline-block px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-xs font-semibold">You</span>}
                        </div>
                        <div className="text-xs text-gray-400">{m.email}</div>
                        {(userCourses.length > 0 || userClasses.length > 0) && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {userCourses.map((t, i) => (<span key={`c${i}`} className="inline-block px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-[11px] font-semibold">{t}</span>))}
                            {userClasses.map((n, i) => (<span key={`cl${i}`} className="inline-block px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-semibold">{n}</span>))}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <form action={updateRoleAction} className="flex gap-1 items-center">
                          <input type="hidden" name="user_id" value={m.id} />
                          <select name="role" defaultValue={m.role} className="px-2 py-1 border border-gray-300 rounded-lg text-xs">
                            <option value="STUDENT">Student</option>
                            <option value="TEACHER">Teacher</option>
                            <option value="SCHOOL_ADMIN">School Admin</option>
                          </select>
                          <button type="submit" className="px-3 py-1 bg-teal-700 text-white text-xs font-semibold rounded-lg hover:bg-teal-800">Update</button>
                        </form>
                      </td>
                      <td className="py-3 px-2">
                        {!isSelf && <ConfirmButton label="Remove" message="Remove this person from the school? They will lose access to all courses and classes." formAction={removeMemberAction} fields={{ user_id: m.id }} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

// ============================================================
// Add Person Tab
// ============================================================

function AddPersonTab({ email, exists, userName, error }: { email?: string; exists?: string; userName?: string; error?: string }) {
  const checkEmail = email || "";

  if (!checkEmail) {
    return (
      <Card title="Add Person">
        <p className="text-xs text-gray-500 mb-3">Enter their email to check if they already have an account.</p>
        <form action={checkEmailAction}>
          <label className="block text-sm mb-1">Email</label>
          <div className="flex gap-2">
            <input name="email" type="email" required placeholder="user@example.com" className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">Check email</button>
          </div>
        </form>
      </Card>
    );
  }

  if (exists === "1") {
    return (
      <Card title="Add Existing User">
        <p className="text-sm mb-3">Found: <strong>{userName}</strong> ({checkEmail})</p>
        <p className="text-xs text-gray-500 mb-3">This person already has an account. Just choose their role at this school.</p>
        <form action={addExistingUserAction}>
          <input type="hidden" name="email" value={checkEmail} />
          <label className="block text-sm mb-1">Role</label>
          <select name="role" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3">
            <option value="STUDENT">Student</option>
            <option value="TEACHER">Teacher</option>
            <option value="SCHOOL_ADMIN">School Admin</option>
          </select>
          <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">Add to school</button>
        </form>
        <p className="mt-3 text-xs"><a href={`${BASE}&tab=add`} className="text-teal-700 hover:underline">Check a different email</a></p>
      </Card>
    );
  }

  return (
    <Card title="Create New User">
      <p className="text-xs text-gray-500 mb-3">No account found for <strong>{checkEmail}</strong>. Fill in the details to create one.</p>
      {error === "invalid" && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-3">Check inputs. Password must be 6+ characters.</div>
      )}
      <form action={addNewUserAction}>
        <input type="hidden" name="email" value={checkEmail} />
        <label className="block text-sm mb-1">Full name</label>
        <input name="name" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />
        <label className="block text-sm mb-1">Role</label>
        <select name="role" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3">
          <option value="STUDENT">Student</option>
          <option value="TEACHER">Teacher</option>
          <option value="SCHOOL_ADMIN">School Admin</option>
        </select>
        <label className="block text-sm mb-1">Temporary password</label>
        <input name="password" type="text" required minLength={6} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />
        <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">Create user + add to school</button>
      </form>
      <p className="mt-3 text-xs"><a href={`${BASE}&tab=add`} className="text-teal-700 hover:underline">Check a different email</a></p>
    </Card>
  );
}
