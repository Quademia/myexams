// src/components/admin/ClassDetail.tsx
// Class detail — 3 tabs (Details, Students, Courses).
// Extracted from /school-class page for use inside the admin workspace.

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { TabNav } from "@/components/ui/TabNav";
import { PageHeader } from "@/components/ui/PageHeader";
import { ConfirmButton } from "@/components/ui/ConfirmButton";

// ============================================================
// Server Actions
// ============================================================

const BASE = "/school?section=classes";

async function updateClassAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const classId = formData.get("class_id") as string;
  const name = (formData.get("name") as string || "").trim();
  const yearGroup = (formData.get("year_group") as string || "").trim();
  const academicYear = (formData.get("academic_year") as string || "").trim();
  const description = (formData.get("description") as string || "").trim();
  if (!classId || !name) redirect(BASE);

  const { run } = getDb();
  await run(
    "UPDATE classes SET name=?, year_group=?, academic_year=?, description=?, updated_at=? WHERE id=? AND tenant_id=?",
    [name, yearGroup || null, academicYear || null, description || null, new Date().toISOString(), classId, active.tenant_id]
  );
  redirect(`${BASE}&class_id=${classId}&tab=details&toast=Details+saved`);
}

async function archiveClassAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const classId = formData.get("class_id") as string;
  const { first, run } = getDb();
  const cls = await first<{ status: string }>("SELECT status FROM classes WHERE id=? AND tenant_id=?", [classId, active.tenant_id]);
  if (!cls) redirect(BASE);

  const newStatus = cls.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
  await run("UPDATE classes SET status=?, updated_at=? WHERE id=? AND tenant_id=?",
    [newStatus, new Date().toISOString(), classId, active.tenant_id]);
  redirect(`${BASE}&toast=Class+archived`);
}

async function addStudentAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const classId = formData.get("class_id") as string;
  const userId = formData.get("user_id") as string;
  if (!classId || !userId) redirect(BASE);

  const { first, run } = getDb();
  const validMember = await first(
    "SELECT id FROM memberships WHERE user_id=? AND tenant_id=? AND role='STUDENT' AND status='ACTIVE'",
    [userId, active.tenant_id]
  );
  if (!validMember) redirect(`${BASE}&class_id=${classId}&tab=students`);

  const exists = await first("SELECT 1 FROM class_students WHERE class_id=? AND user_id=?", [classId, userId]);
  if (!exists) {
    await run("INSERT INTO class_students (id, class_id, user_id, created_at) VALUES (?,?,?,?)",
      [crypto.randomUUID(), classId, userId, new Date().toISOString()]);
  }
  redirect(`${BASE}&class_id=${classId}&tab=students&toast=Student+added`);
}

async function removeStudentAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const classId = (formData.get("class_id") as string || "").trim();
  const userId = (formData.get("user_id") as string || "").trim();
  if (!classId || !userId) redirect(BASE);

  const { first, run } = getDb();
  const classCheck = await first("SELECT id FROM classes WHERE id=? AND tenant_id=?", [classId, active.tenant_id]);
  if (!classCheck) redirect(BASE);

  await run("DELETE FROM class_students WHERE class_id=? AND user_id=?", [classId, userId]);
  redirect(`${BASE}&class_id=${classId}&tab=students&toast=Student+removed`);
}

async function enrolCourseAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const classId = formData.get("class_id") as string;
  const courseId = formData.get("course_id") as string;
  if (!classId || !courseId) redirect(BASE);

  const { all, first, run } = getDb();
  const now = new Date().toISOString();

  const classCheck = await first("SELECT id FROM classes WHERE id=? AND tenant_id=?", [classId, active.tenant_id]);
  const courseCheck = await first("SELECT id FROM courses WHERE id=? AND tenant_id=? AND status='ACTIVE'", [courseId, active.tenant_id]);
  if (!classCheck || !courseCheck) redirect(`${BASE}&class_id=${classId}&tab=courses`);

  const classStudents = await all<{ user_id: string }>("SELECT user_id FROM class_students WHERE class_id=?", [classId]);
  for (const cs of classStudents) {
    const exists = await first("SELECT 1 FROM enrollments WHERE course_id=? AND user_id=?", [courseId, cs.user_id]);
    if (!exists) {
      await run(
        "INSERT INTO enrollments (id, course_id, user_id, tenant_id, status, created_at, updated_at) VALUES (?,?,?,?,'ACTIVE',?,?)",
        [crypto.randomUUID(), courseId, cs.user_id, active.tenant_id, now, now]
      );
    }
  }
  redirect(`${BASE}&class_id=${classId}&tab=courses&toast=Course+added`);
}

async function unenrolCourseAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const classId = (formData.get("class_id") as string || "").trim();
  const courseId = (formData.get("course_id") as string || "").trim();
  if (!classId || !courseId) redirect(BASE);

  const { all, first, run } = getDb();
  const classCheck = await first("SELECT id FROM classes WHERE id=? AND tenant_id=?", [classId, active.tenant_id]);
  if (!classCheck) redirect(`${BASE}&class_id=${classId}&tab=courses`);

  const classStudents = await all<{ user_id: string }>("SELECT user_id FROM class_students WHERE class_id=?", [classId]);
  for (const cs of classStudents) {
    await run("DELETE FROM enrollments WHERE course_id=? AND user_id=?", [courseId, cs.user_id]);
  }
  redirect(`${BASE}&class_id=${classId}&tab=courses&toast=Course+removed`);
}

// ============================================================
// Main Component
// ============================================================

interface ClassDetailProps {
  classId: string;
  tab: string;
  tenantId: string;
}

export async function ClassDetail({ classId, tab, tenantId }: ClassDetailProps) {
  const { first } = getDb();

  const cls = await first<{
    id: string; name: string; year_group: string | null;
    academic_year: string | null; description: string | null; status: string;
  }>("SELECT id, name, year_group, academic_year, description, status FROM classes WHERE id=? AND tenant_id=?",
    [classId, tenantId]);
  if (!cls) redirect(BASE);

  const base = `${BASE}&class_id=${classId}`;
  const tabs = [
    { label: "Details", value: "details", href: `${base}&tab=details` },
    { label: "Students", value: "students", href: `${base}&tab=students` },
    { label: "Courses", value: "courses", href: `${base}&tab=courses` },
  ];

  const subtitleParts = [cls.year_group, cls.academic_year, cls.status].filter(Boolean);
  const subtitle = subtitleParts.length > 0 ? subtitleParts.join(" · ") : "Class Details";

  return (
    <>
      <PageHeader title={cls.name} subtitle={subtitle} backHref={BASE} backLabel="Back to Classes" />
      <TabNav tabs={tabs} activeTab={tab} />

      {tab === "details" && (
        <>
          <Card title="Edit Class">
            <form action={updateClassAction}>
              <input type="hidden" name="class_id" value={cls.id} />
              <label className="block text-sm mb-1">Name</label>
              <input name="name" defaultValue={cls.name} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-sm mb-1">Year Group</label>
                  <input name="year_group" defaultValue={cls.year_group || ""} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm mb-1">Academic Year</label>
                  <input name="academic_year" defaultValue={cls.academic_year || ""} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
              <label className="block text-sm mb-1">Description</label>
              <textarea name="description" rows={3} defaultValue={cls.description || ""} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />
              <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">Save changes</button>
            </form>
          </Card>
          <Card title="Archive">
            <ConfirmButton label="Archive" message="Archive this class? It will no longer be active." variant="warning" formAction={archiveClassAction} fields={{ class_id: cls.id }} />
          </Card>
        </>
      )}

      {tab === "students" && <StudentsTab classId={cls.id} tenantId={tenantId} />}
      {tab === "courses" && <CoursesTab classId={cls.id} tenantId={tenantId} />}
    </>
  );
}

// ============================================================
// Tab Components
// ============================================================

async function StudentsTab({ classId, tenantId }: { classId: string; tenantId: string }) {
  const { all } = getDb();
  const students = await all<{ id: string; name: string; email: string }>(
    `SELECT u.id, u.name, u.email FROM class_students cs JOIN qa_users u ON u.id = cs.user_id WHERE cs.class_id=? ORDER BY u.name ASC`,
    [classId]
  );
  const studentIds = new Set(students.map((s) => s.id));
  const allStudents = await all<{ id: string; name: string; email: string }>(
    `SELECT u.id, u.name, u.email FROM memberships m JOIN qa_users u ON u.id = m.user_id WHERE m.tenant_id=? AND m.role='STUDENT' AND m.status='ACTIVE' AND u.status='ACTIVE' ORDER BY u.name ASC`,
    [tenantId]
  );
  const available = allStudents.filter((s) => !studentIds.has(s.id));

  return (
    <>
      <Card title={`Students (${students.length})`}>
        {students.length === 0 ? (
          <p className="text-sm text-gray-400">No students in this class yet</p>
        ) : (
          <ul className="space-y-2">
            {students.map((s) => (
              <li key={s.id} className="flex items-center justify-between text-sm">
                <span>{s.name} <span className="text-gray-400">({s.email})</span></span>
                <ConfirmButton label="Remove" message="Remove this student from the class?" formAction={removeStudentAction} fields={{ class_id: classId, user_id: s.id }} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Add Student">
        {available.length > 0 ? (
          <form action={addStudentAction} className="flex gap-2 items-end">
            <input type="hidden" name="class_id" value={classId} />
            <select name="user_id" required className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm">
              {available.map((s) => (<option key={s.id} value={s.id}>{s.name} ({s.email})</option>))}
            </select>
            <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">Add to class</button>
          </form>
        ) : (
          <p className="text-sm text-gray-400">All students in the school are already in this class.</p>
        )}
      </Card>
    </>
  );
}

async function CoursesTab({ classId, tenantId }: { classId: string; tenantId: string }) {
  const { all, first } = getDb();
  const allCourses = await all<{ id: string; title: string }>(
    "SELECT id, title FROM courses WHERE tenant_id=? AND status='ACTIVE' ORDER BY title ASC",
    [tenantId]
  );
  const classStudents = await all<{ user_id: string }>("SELECT user_id FROM class_students WHERE class_id=?", [classId]);
  const totalInClass = classStudents.length;

  const linkedCourses = [];
  for (const c of allCourses) {
    const enrolled = await first<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM class_students cs JOIN enrollments e ON e.user_id = cs.user_id AND e.course_id=? WHERE cs.class_id=?`,
      [c.id, classId]
    );
    if (enrolled && enrolled.cnt > 0) {
      linkedCourses.push({ ...c, enrolled_count: enrolled.cnt });
    }
  }

  return (
    <>
      <Card title={`Courses linked to this class (${linkedCourses.length})`}>
        {linkedCourses.length === 0 ? (
          <p className="text-sm text-gray-400">No courses linked yet</p>
        ) : (
          <ul className="space-y-2">
            {linkedCourses.map((c) => (
              <li key={c.id} className="flex items-center justify-between text-sm">
                <span>
                  <a href={`/school?section=courses&course_id=${c.id}&tab=classes`} className="text-teal-700 hover:underline font-medium">{c.title}</a>
                  <span className="text-gray-400 ml-2">({c.enrolled_count} / {totalInClass} students enrolled)</span>
                </span>
                <ConfirmButton label="Remove" message="Remove this course from the class? This will unenrol all class students from the course." formAction={unenrolCourseAction} fields={{ class_id: classId, course_id: c.id }} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Enrol This Class's Students in a Course">
        {allCourses.length > 0 ? (
          <>
            <p className="text-xs text-gray-500 mb-2">This will enrol all students currently in this class into the selected course. Students already enrolled will be skipped.</p>
            <form action={enrolCourseAction} className="flex gap-2 items-end">
              <input type="hidden" name="class_id" value={classId} />
              <select name="course_id" required className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm">
                {allCourses.map((c) => (<option key={c.id} value={c.id}>{c.title}</option>))}
              </select>
              <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">Enrol Class Students</button>
            </form>
          </>
        ) : (
          <p className="text-sm text-gray-400">No active courses found.</p>
        )}
      </Card>
    </>
  );
}
