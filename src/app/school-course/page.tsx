// src/app/school-course/page.tsx
// Course detail page — the restructured version with 5 tabs:
// Details, Teachers, Students, Classes, Join Codes
//
// This replaces the old monolithic /school-courses page where everything
// was dumped on one screen. Now each course has its own page with
// focused tabs for each concern.

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership, makeJoinCodePlain, joinCodeHash, isIsoInPast, describeCode, fmtISO } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { getDb } from "@/lib/db";
import { SchoolLayout } from "@/components/SchoolLayout";
import { Card } from "@/components/Card";
import { TabNav } from "@/components/TabNav";
import { PageHeader } from "@/components/PageHeader";

// ============================================================
// Server Actions — handle form submissions for each tab
// ============================================================

async function updateCourseAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const courseId = formData.get("course_id") as string;
  const title = (formData.get("title") as string || "").trim();
  const status = formData.get("status") as string;
  if (!courseId || !title) redirect("/school-courses");

  const { run } = getDb();
  await run(
    "UPDATE courses SET title=?, status=?, updated_at=? WHERE id=? AND tenant_id=?",
    [title, status, new Date().toISOString(), courseId, active.tenant_id]
  );
  redirect(`/school-course?course_id=${courseId}&tab=details`);
}

async function assignTeacherAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const courseId = formData.get("course_id") as string;
  const userId = formData.get("user_id") as string;
  if (!courseId || !userId) redirect("/school-courses");

  const { first, run } = getDb();
  const exists = await first(
    "SELECT 1 FROM course_teachers WHERE course_id=? AND user_id=?",
    [courseId, userId]
  );
  if (!exists) {
    await run("INSERT INTO course_teachers (course_id, user_id) VALUES (?,?)", [courseId, userId]);
  }
  redirect(`/school-course?course_id=${courseId}&tab=teachers`);
}

async function unassignTeacherAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const courseId = formData.get("course_id") as string;
  const userId = formData.get("user_id") as string;
  const { run } = getDb();
  await run("DELETE FROM course_teachers WHERE course_id=? AND user_id=?", [courseId, userId]);
  redirect(`/school-course?course_id=${courseId}&tab=teachers`);
}

async function enrolStudentAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const courseId = formData.get("course_id") as string;
  const userId = formData.get("user_id") as string;
  if (!courseId || !userId) redirect("/school-courses");

  const { first, run } = getDb();
  const now = new Date().toISOString();
  const exists = await first(
    "SELECT 1 FROM enrollments WHERE course_id=? AND user_id=?",
    [courseId, userId]
  );
  if (!exists) {
    await run(
      "INSERT INTO enrollments (id, course_id, user_id, tenant_id, status, created_at, updated_at) VALUES (?,?,?,?,'ACTIVE',?,?)",
      [crypto.randomUUID(), courseId, userId, active.tenant_id, now, now]
    );
  }
  redirect(`/school-course?course_id=${courseId}&tab=students`);
}

async function unenrolStudentAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const courseId = formData.get("course_id") as string;
  const userId = formData.get("user_id") as string;
  const { run } = getDb();
  await run("DELETE FROM enrollments WHERE course_id=? AND user_id=?", [courseId, userId]);
  redirect(`/school-course?course_id=${courseId}&tab=students`);
}

async function enrolClassAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const courseId = formData.get("course_id") as string;
  const classId = formData.get("class_id") as string;
  if (!courseId || !classId) redirect("/school-courses");

  const { all, first, run } = getDb();
  const now = new Date().toISOString();

  // Get all students in the class.
  const classStudents = await all<{ user_id: string }>(
    "SELECT user_id FROM class_students WHERE class_id=?",
    [classId]
  );

  // Enrol each student who isn't already enrolled (idempotent).
  let enrolled = 0;
  for (const cs of classStudents) {
    const exists = await first(
      "SELECT 1 FROM enrollments WHERE course_id=? AND user_id=?",
      [courseId, cs.user_id]
    );
    if (!exists) {
      await run(
        "INSERT INTO enrollments (id, course_id, user_id, tenant_id, status, created_at, updated_at) VALUES (?,?,?,?,'ACTIVE',?,?)",
        [crypto.randomUUID(), courseId, cs.user_id, active.tenant_id, now, now]
      );
      enrolled++;
    }
  }

  redirect(`/school-course?course_id=${courseId}&tab=classes`);
}

async function unenrolClassAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const courseId = formData.get("course_id") as string;
  const classId = formData.get("class_id") as string;
  const { all, run } = getDb();

  // Get all students in the class and remove their enrollments.
  const classStudents = await all<{ user_id: string }>(
    "SELECT user_id FROM class_students WHERE class_id=?",
    [classId]
  );
  for (const cs of classStudents) {
    await run("DELETE FROM enrollments WHERE course_id=? AND user_id=?", [courseId, cs.user_id]);
  }

  redirect(`/school-course?course_id=${courseId}&tab=classes`);
}

async function createCodeAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const courseId = formData.get("course_id") as string;
  const who = (formData.get("who") as string || "").trim();
  const autoApprove = Number(formData.get("auto_approve") || "0") === 1 ? 1 : 0;
  const expDays = Math.max(1, parseInt(formData.get("exp_days") as string || "14", 10) || 14);
  const maxUses = Math.max(1, parseInt(formData.get("max_uses") as string || "300", 10) || 300);

  // Map "who" + course context to scope and role.
  let scope: string, role: string;
  if (who === "student") { scope = "COURSE_ENROLL"; role = "STUDENT"; }
  else if (who === "teacher") { scope = "COURSE_TEACHER"; role = "TEACHER"; }
  else redirect(`/school-course?course_id=${courseId}&tab=join-codes`);

  const { first, run } = getDb();
  const { APP_SECRET } = getEnv();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + expDays * 24 * 60 * 60 * 1000).toISOString();

  // Generate a unique code (retry up to 6 times if collision).
  let codePlain = "", codeHash_ = "";
  for (let i = 0; i < 6; i++) {
    codePlain = makeJoinCodePlain();
    codeHash_ = await joinCodeHash(codePlain, APP_SECRET);
    const exists = await first("SELECT id FROM join_codes WHERE code_hash=? LIMIT 1", [codeHash_]);
    if (!exists) break;
  }

  await run(
    `INSERT INTO join_codes (id, tenant_id, scope, role, course_id, code_hash, auto_approve, expires_at, max_uses, uses_approved, revoked, created_by_user_id, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,0,0,?,?,?)`,
    [crypto.randomUUID(), active.tenant_id, scope!, role!, courseId, codeHash_, autoApprove, expiresAt, maxUses, auth.user!.id, now, now]
  );

  // Redirect back with the plain code shown as a query param (shown only once).
  redirect(`/school-course?course_id=${courseId}&tab=join-codes&new_code=${encodeURIComponent(codePlain)}`);
}

async function revokeCodeAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const codeId = formData.get("code_id") as string;
  const courseId = formData.get("course_id") as string;
  const { run } = getDb();
  await run("UPDATE join_codes SET revoked=1, updated_at=? WHERE id=? AND tenant_id=?",
    [new Date().toISOString(), codeId, active.tenant_id]);
  redirect(`/school-course?course_id=${courseId}&tab=join-codes`);
}

// ============================================================
// Page Component
// ============================================================

export default async function SchoolCoursePage({
  searchParams,
}: {
  searchParams: Promise<{ course_id?: string; tab?: string; new_code?: string }>;
}) {
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const params = await searchParams;
  const courseId = params.course_id;
  const tab = params.tab || "details";
  const newCode = params.new_code;

  if (!courseId) redirect("/school-courses");

  const { first, all } = getDb();
  const tid = active.tenant_id;

  // Fetch the course.
  const course = await first<{ id: string; title: string; status: string }>(
    "SELECT id, title, status FROM courses WHERE id=? AND tenant_id=?",
    [courseId, tid]
  );
  if (!course) redirect("/school-courses");

  // Build tab URLs.
  const base = `/school-course?course_id=${courseId}`;
  const tabs = [
    { label: "Details", value: "details", href: `${base}&tab=details` },
    { label: "Teachers", value: "teachers", href: `${base}&tab=teachers` },
    { label: "Students", value: "students", href: `${base}&tab=students` },
    { label: "Classes", value: "classes", href: `${base}&tab=classes` },
    { label: "Join Codes", value: "join-codes", href: `${base}&tab=join-codes` },
  ];

  return (
    <SchoolLayout auth={auth} active={active} currentPath="/school-courses">
      <PageHeader
        title={course.title}
        subtitle="Course Details"
        backHref="/school-courses"
        backLabel="Back to Courses"
      />

      <TabNav tabs={tabs} activeTab={tab} />

      {/* ---------- Details Tab ---------- */}
      {tab === "details" && (
        <Card title="Edit Course">
          <form action={updateCourseAction}>
            <input type="hidden" name="course_id" value={course.id} />
            <label className="block text-sm mb-1">Title</label>
            <input
              name="title"
              defaultValue={course.title}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3"
            />
            <label className="block text-sm mb-1">Status</label>
            <select
              name="status"
              defaultValue={course.status}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3"
            >
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
            </select>
            <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
              Save Changes
            </button>
          </form>
        </Card>
      )}

      {/* ---------- Teachers Tab ---------- */}
      {tab === "teachers" && <TeachersTab courseId={course.id} tenantId={tid} />}

      {/* ---------- Students Tab ---------- */}
      {tab === "students" && <StudentsTab courseId={course.id} tenantId={tid} />}

      {/* ---------- Classes Tab ---------- */}
      {tab === "classes" && <ClassesTab courseId={course.id} tenantId={tid} />}

      {/* ---------- Join Codes Tab ---------- */}
      {tab === "join-codes" && <JoinCodesTab courseId={course.id} tenantId={tid} newCode={newCode} />}
    </SchoolLayout>
  );
}

// ============================================================
// Tab Components — each tab is its own async component
// ============================================================

async function TeachersTab({ courseId, tenantId }: { courseId: string; tenantId: string }) {
  const { all } = getDb();

  const assigned = await all<{ id: string; name: string; email: string }>(
    `SELECT u.id, u.name, u.email FROM course_teachers ct
     JOIN users u ON u.id = ct.user_id
     WHERE ct.course_id=? ORDER BY u.name ASC`,
    [courseId]
  );

  // Include SCHOOL_ADMIN too — they can also teach courses.
  const allTeachers = await all<{ id: string; name: string; email: string }>(
    `SELECT u.id, u.name, u.email FROM memberships m
     JOIN users u ON u.id = m.user_id
     WHERE m.tenant_id=? AND m.role IN ('TEACHER','SCHOOL_ADMIN') AND m.status='ACTIVE' AND u.status='ACTIVE'
     ORDER BY u.name ASC`,
    [tenantId]
  );

  // Filter out already assigned teachers.
  const assignedIds = new Set(assigned.map((t) => t.id));
  const available = allTeachers.filter((t) => !assignedIds.has(t.id));

  return (
    <>
      <Card title={`Assigned Teachers (${assigned.length})`}>
        {assigned.length === 0 ? (
          <p className="text-sm text-gray-400">No teachers assigned</p>
        ) : (
          <ul className="space-y-2">
            {assigned.map((t) => (
              <li key={t.id} className="flex items-center justify-between text-sm">
                <span>{t.name} <span className="text-gray-400">({t.email})</span></span>
                <form action={unassignTeacherAction}>
                  <input type="hidden" name="course_id" value={courseId} />
                  <input type="hidden" name="user_id" value={t.id} />
                  <button type="submit" className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-200">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {available.length > 0 && (
        <Card title="Assign Teacher">
          <form action={assignTeacherAction} className="flex gap-2 items-end">
            <input type="hidden" name="course_id" value={courseId} />
            <select name="user_id" required className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm">
              {available.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.email})</option>
              ))}
            </select>
            <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
              Assign
            </button>
          </form>
        </Card>
      )}
    </>
  );
}

async function StudentsTab({ courseId, tenantId }: { courseId: string; tenantId: string }) {
  const { all } = getDb();

  const enrolled = await all<{ id: string; name: string; email: string }>(
    `SELECT u.id, u.name, u.email FROM enrollments e
     JOIN users u ON u.id = e.user_id
     WHERE e.course_id=? ORDER BY u.name ASC`,
    [courseId]
  );

  const allStudents = await all<{ id: string; name: string; email: string }>(
    `SELECT u.id, u.name, u.email FROM memberships m
     JOIN users u ON u.id = m.user_id
     WHERE m.tenant_id=? AND m.role='STUDENT' AND m.status='ACTIVE' AND u.status='ACTIVE'
     ORDER BY u.name ASC`,
    [tenantId]
  );

  const enrolledIds = new Set(enrolled.map((s) => s.id));
  const available = allStudents.filter((s) => !enrolledIds.has(s.id));

  return (
    <>
      <Card title={`Enrolled Students (${enrolled.length})`}>
        {enrolled.length === 0 ? (
          <p className="text-sm text-gray-400">No students enrolled</p>
        ) : (
          <ul className="space-y-2">
            {enrolled.map((s) => (
              <li key={s.id} className="flex items-center justify-between text-sm">
                <span>{s.name} <span className="text-gray-400">({s.email})</span></span>
                <form action={unenrolStudentAction}>
                  <input type="hidden" name="course_id" value={courseId} />
                  <input type="hidden" name="user_id" value={s.id} />
                  <button type="submit" className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-200">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {available.length > 0 && (
        <Card title="Enrol Student">
          <form action={enrolStudentAction} className="flex gap-2 items-end">
            <input type="hidden" name="course_id" value={courseId} />
            <select name="user_id" required className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm">
              {available.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.email})</option>
              ))}
            </select>
            <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
              Enrol
            </button>
          </form>
        </Card>
      )}
    </>
  );
}

async function ClassesTab({ courseId, tenantId }: { courseId: string; tenantId: string }) {
  const { all } = getDb();

  // Find classes that have at least one student enrolled in this course.
  const classes = await all<{ id: string; name: string; student_count: number }>(
    `SELECT cl.id, cl.name,
       (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = cl.id) AS student_count
     FROM classes cl
     WHERE cl.tenant_id=? AND cl.status='ACTIVE'
     ORDER BY cl.name ASC`,
    [tenantId]
  );

  // For each class, check how many of its students are enrolled in this course.
  const classesWithEnrollment = [];
  for (const cl of classes) {
    const enrolledFromClass = await all<{ user_id: string }>(
      `SELECT cs.user_id FROM class_students cs
       WHERE cs.class_id=? AND cs.user_id IN (
         SELECT e.user_id FROM enrollments e WHERE e.course_id=?
       )`,
      [cl.id, courseId]
    );
    classesWithEnrollment.push({
      ...cl,
      enrolled_count: enrolledFromClass.length,
    });
  }

  const linkedClasses = classesWithEnrollment.filter((c) => c.enrolled_count > 0);
  const availableClasses = classesWithEnrollment.filter((c) => c.student_count > 0);

  return (
    <>
      <Card title={`Linked Classes (${linkedClasses.length})`}>
        {linkedClasses.length === 0 ? (
          <p className="text-sm text-gray-400">No classes linked to this course</p>
        ) : (
          <ul className="space-y-2">
            {linkedClasses.map((cl) => (
              <li key={cl.id} className="flex items-center justify-between text-sm">
                <span>
                  {cl.name}
                  <span className="text-gray-400 ml-2">
                    ({cl.enrolled_count} of {cl.student_count} students enrolled)
                  </span>
                </span>
                <form action={unenrolClassAction}>
                  <input type="hidden" name="course_id" value={courseId} />
                  <input type="hidden" name="class_id" value={cl.id} />
                  <button type="submit" className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-200">
                    Remove Class
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {availableClasses.length > 0 && (
        <Card title="Enrol Class">
          <p className="text-xs text-gray-500 mb-2">
            Bulk enrols all students in the selected class into this course. Students already enrolled are skipped.
          </p>
          <form action={enrolClassAction} className="flex gap-2 items-end">
            <input type="hidden" name="course_id" value={courseId} />
            <select name="class_id" required className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm">
              {availableClasses.map((cl) => (
                <option key={cl.id} value={cl.id}>{cl.name} ({cl.student_count} students)</option>
              ))}
            </select>
            <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
              Enrol Class
            </button>
          </form>
        </Card>
      )}
    </>
  );
}

async function JoinCodesTab({ courseId, tenantId, newCode }: { courseId: string; tenantId: string; newCode?: string }) {
  const { all } = getDb();

  // Fetch active (non-revoked) codes for this course.
  const codes = await all<{
    id: string; scope: string; role: string; course_title: string | null;
    auto_approve: number; expires_at: string; max_uses: number; uses_approved: number;
  }>(
    `SELECT jc.id, jc.scope, jc.role, c.title AS course_title,
       jc.auto_approve, jc.expires_at, jc.max_uses, jc.uses_approved
     FROM join_codes jc
     LEFT JOIN courses c ON c.id = jc.course_id
     WHERE jc.tenant_id=? AND jc.course_id=? AND jc.revoked=0
     ORDER BY jc.created_at DESC`,
    [tenantId, courseId]
  );

  const activeCodes = codes.filter((c) => !isIsoInPast(c.expires_at));

  return (
    <>
      {/* Show newly created code (displayed only once) */}
      {newCode && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-3">
          <h2 className="text-base font-semibold text-green-800">Join code created</h2>
          <p className="text-sm text-green-700 mt-1">Copy and share this code (shown only once):</p>
          <div className="bg-white border border-dashed border-green-300 rounded-lg p-4 mt-2">
            <span className="text-2xl font-black tracking-widest">{newCode}</span>
          </div>
          <p className="text-xs text-green-600 mt-2">Users go to /join, enter the code, then login or create an account.</p>
        </div>
      )}

      <Card title={`Active Codes (${activeCodes.length})`}>
        {activeCodes.length === 0 ? (
          <p className="text-sm text-gray-400">No active codes for this course</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Description</th>
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Limits</th>
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Approval</th>
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {activeCodes.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100">
                    <td className="py-3 px-2 font-medium">
                      {describeCode(c.scope, c.role, c.course_title)}
                    </td>
                    <td className="py-3 px-2 text-xs text-gray-500">
                      Expires: {fmtISO(c.expires_at)}<br />
                      Uses: {c.uses_approved}/{c.max_uses}
                    </td>
                    <td className="py-3 px-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                        c.auto_approve === 1
                          ? "bg-green-50 text-green-700"
                          : "bg-amber-50 text-amber-700"
                      }`}>
                        {c.auto_approve === 1 ? "Auto-approve" : "Needs approval"}
                      </span>
                    </td>
                    <td className="py-3 px-2">
                      <form action={revokeCodeAction}>
                        <input type="hidden" name="code_id" value={c.id} />
                        <input type="hidden" name="course_id" value={courseId} />
                        <button type="submit" className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-200">
                          Revoke
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

      <Card title="Create Code for this Course">
        <form action={createCodeAction}>
          <input type="hidden" name="course_id" value={courseId} />

          <label className="block text-sm mb-1">Who is this code for?</label>
          <select name="who" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3">
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
          </select>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-sm mb-1">Auto-approve</label>
              <select name="auto_approve" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="0">No (admin approval required)</option>
                <option value="1">Yes (instant)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm mb-1">Expiry (days)</label>
              <input name="exp_days" type="number" min="1" defaultValue="14" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>

          <label className="block text-sm mb-1">Max uses</label>
          <input name="max_uses" type="number" min="1" defaultValue="300" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />

          <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
            Create code
          </button>
        </form>
      </Card>
    </>
  );
}
