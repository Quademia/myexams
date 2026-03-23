// src/app/school-course/page.tsx
// Course detail page — the restructured version with 5 tabs:
// Details, Teachers, Students, Classes, Join Codes
//
// This replaces the old monolithic /school-courses page where everything
// was dumped on one screen. Now each course has its own page with
// focused tabs for each concern.

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership } from "@/lib/auth";
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

// ============================================================
// Page Component
// ============================================================

export default async function SchoolCoursePage({
  searchParams,
}: {
  searchParams: Promise<{ course_id?: string; tab?: string }>;
}) {
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const params = await searchParams;
  const courseId = params.course_id;
  const tab = params.tab || "details";

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
      {tab === "join-codes" && (
        <Card>
          <p className="text-sm text-gray-400 py-4 text-center">
            Join codes for this course — coming soon.
          </p>
        </Card>
      )}
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

  const allTeachers = await all<{ id: string; name: string; email: string }>(
    `SELECT u.id, u.name, u.email FROM memberships m
     JOIN users u ON u.id = m.user_id
     WHERE m.tenant_id=? AND m.role='TEACHER' AND m.status='ACTIVE' AND u.status='ACTIVE'
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
