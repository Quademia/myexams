// src/app/school/page.tsx
// School Admin Workspace — Phase 4 of the workspace restructure.
// Single entry point for all school admin functionality.
// Uses WorkspaceShell with sidebar. URL state drives which section is shown.

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { WorkspaceHeader } from "@/components/layout/WorkspaceHeader";
import { SidebarNav } from "@/components/layout/SidebarNav";
import { getAdminNavItems } from "@/lib/admin-nav";
import { changePasswordAction } from "@/lib/change-password";
import { CourseDetail } from "@/components/admin/CourseDetail";
import { ClassDetail } from "@/components/admin/ClassDetail";

// ============================================================
// Server Actions
// ============================================================

async function createCourseAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const title = (formData.get("title") as string || "").trim();
  if (!title) redirect("/school?section=courses");

  const { run } = getDb();
  const now = new Date().toISOString();
  await run(
    "INSERT INTO courses (id, tenant_id, title, status, created_at, updated_at) VALUES (?,?,?,'ACTIVE',?,?)",
    [crypto.randomUUID(), active.tenant_id, title, now, now]
  );
  redirect("/school?section=courses&toast=Course+created");
}

async function createClassAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const name = (formData.get("name") as string || "").trim();
  if (!name) redirect("/school?section=classes");

  const yearGroup = (formData.get("year_group") as string || "").trim();
  const academicYear = (formData.get("academic_year") as string || "").trim();
  const description = (formData.get("description") as string || "").trim();

  const { run } = getDb();
  const now = new Date().toISOString();
  await run(
    `INSERT INTO classes (id, tenant_id, name, year_group, academic_year, description, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,'ACTIVE',?,?)`,
    [crypto.randomUUID(), active.tenant_id, name, yearGroup || null, academicYear || null, description || null, now, now]
  );
  redirect("/school?section=classes&toast=Class+created");
}

// ============================================================
// Small UI helpers
// ============================================================

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 text-center flex-1 min-w-[120px]">
      <div className="text-3xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}

// ============================================================
// Section: Overview
// ============================================================

async function OverviewSection({ tenantId, userId }: { tenantId: string; userId: string }) {
  const { first } = getDb();

  const [students, teachers, courses, classes, sittings, pendingJR, pendingApprovals] = await Promise.all([
    first<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM memberships WHERE tenant_id=? AND status='ACTIVE' AND role='STUDENT'", [tenantId]),
    first<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM memberships WHERE tenant_id=? AND status='ACTIVE' AND role='TEACHER'", [tenantId]),
    first<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM courses WHERE tenant_id=?", [tenantId]),
    first<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM classes WHERE tenant_id=?", [tenantId]),
    first<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM exam_sittings WHERE tenant_id=?", [tenantId]),
    first<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM join_requests WHERE tenant_id=? AND status='PENDING'", [tenantId]),
    first<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM sitting_approval_gates sag
       JOIN sitting_approval_responses sar
         ON sar.exam_id=sag.exam_id AND sar.gate_type=sag.gate_type
        AND sar.approver_id=sag.user_id AND sar.tenant_id=sag.tenant_id
       WHERE sag.user_id=? AND sag.tenant_id=? AND sar.status='PENDING'`,
      [userId, tenantId]
    ),
  ]);

  const pendingCount = Number(pendingJR?.cnt ?? 0);
  const approvalCount = Number(pendingApprovals?.cnt ?? 0);

  return (
    <>
      {/* Stats grid */}
      <div className="flex flex-wrap gap-3">
        <StatCard label="Students" value={Number(students?.cnt ?? 0)} />
        <StatCard label="Teachers" value={Number(teachers?.cnt ?? 0)} />
        <StatCard label="Courses" value={Number(courses?.cnt ?? 0)} />
        <StatCard label="Classes" value={Number(classes?.cnt ?? 0)} />
        <StatCard label="Sittings" value={Number(sittings?.cnt ?? 0)} />
      </div>

      {/* Pending approvals banner */}
      {approvalCount > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 mt-3 flex items-center justify-between flex-wrap gap-3">
          <span className="text-sm font-semibold text-amber-800">
            You have {approvalCount} pending approval{approvalCount !== 1 ? "s" : ""}
          </span>
          <a
            href="/approvals"
            className="inline-block px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800 no-underline"
          >
            View Inbox →
          </a>
        </div>
      )}

      {/* Pending join requests banner */}
      {pendingCount > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-3 mt-3 flex items-center justify-between flex-wrap gap-3">
          <span className="text-sm">
            {pendingCount} pending join request{pendingCount !== 1 ? "s" : ""}
          </span>
          <a
            href="/school?section=join-codes"
            className="inline-block px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800 no-underline"
          >
            View Requests →
          </a>
        </div>
      )}
    </>
  );
}

// ============================================================
// Section: Courses list
// ============================================================

async function CoursesSection({ tenantId }: { tenantId: string }) {
  const { all } = getDb();
  const courses = await all<{
    id: string; title: string; status: string; teacher_count: number; student_count: number;
  }>(
    `SELECT c.id, c.title, c.status,
       (SELECT COUNT(*) FROM course_teachers ct WHERE ct.course_id = c.id) AS teacher_count,
       (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS student_count
     FROM courses c WHERE c.tenant_id = ? ORDER BY c.title ASC`,
    [tenantId]
  );

  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Courses</h2>
        </div>
        {courses.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No courses yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left text-xs text-gray-500 uppercase tracking-wide py-2 px-2">Title</th>
                  <th className="text-left text-xs text-gray-500 uppercase tracking-wide py-2 px-2">Status</th>
                  <th className="text-left text-xs text-gray-500 uppercase tracking-wide py-2 px-2">Teachers</th>
                  <th className="text-left text-xs text-gray-500 uppercase tracking-wide py-2 px-2">Students</th>
                  <th className="text-left text-xs text-gray-500 uppercase tracking-wide py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-2 font-medium">
                      <a href={`/school?section=courses&course_id=${c.id}`} className="text-teal-700 hover:underline">{c.title}</a>
                    </td>
                    <td className="py-3 px-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${c.status === "ACTIVE" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>{c.status}</span>
                    </td>
                    <td className="py-3 px-2 text-gray-600">{c.teacher_count}</td>
                    <td className="py-3 px-2 text-gray-600">{c.student_count}</td>
                    <td className="py-3 px-2">
                      <a href={`/school?section=courses&course_id=${c.id}`} className="text-sm text-teal-700 hover:underline">Manage →</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="Create Course">
        <form action={createCourseAction} className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-sm mb-1">Course title</label>
            <input name="title" required placeholder="e.g. Medical Nursing" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">Create</button>
        </form>
      </Card>
    </>
  );
}

// ============================================================
// Section: Classes list
// ============================================================

async function ClassesSection({ tenantId }: { tenantId: string }) {
  const { all } = getDb();
  const classes = await all<{
    id: string; name: string; year_group: string | null;
    academic_year: string | null; status: string; student_count: number;
  }>(
    `SELECT c.id, c.name, c.year_group, c.academic_year, c.status,
       COUNT(cs.id) AS student_count
     FROM classes c LEFT JOIN class_students cs ON cs.class_id = c.id
     WHERE c.tenant_id=? GROUP BY c.id ORDER BY c.name ASC`,
    [tenantId]
  );

  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Classes</h2>
        </div>
        {classes.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No classes yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left text-xs text-gray-500 uppercase tracking-wide py-2 px-2">Name</th>
                  <th className="text-left text-xs text-gray-500 uppercase tracking-wide py-2 px-2">Academic Year</th>
                  <th className="text-left text-xs text-gray-500 uppercase tracking-wide py-2 px-2">Status</th>
                  <th className="text-left text-xs text-gray-500 uppercase tracking-wide py-2 px-2">Students</th>
                  <th className="text-left text-xs text-gray-500 uppercase tracking-wide py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {classes.map((cl) => (
                  <tr key={cl.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-2">
                      <a href={`/school?section=classes&class_id=${cl.id}`} className="text-teal-700 hover:underline font-medium">{cl.name}</a>
                      {cl.year_group && <span className="text-xs text-gray-400 ml-2">{cl.year_group}</span>}
                    </td>
                    <td className="py-3 px-2 text-gray-600 text-sm">{cl.academic_year || "—"}</td>
                    <td className="py-3 px-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${cl.status === "ACTIVE" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>{cl.status}</span>
                    </td>
                    <td className="py-3 px-2 text-gray-600">{cl.student_count}</td>
                    <td className="py-3 px-2">
                      <a href={`/school?section=classes&class_id=${cl.id}`} className="text-sm text-teal-700 hover:underline">Manage →</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="Create Class">
        <form action={createClassAction}>
          <label className="block text-sm mb-1">Class name *</label>
          <input name="name" required placeholder="e.g. Year 10 Alpha" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-sm mb-1">Year group <span className="text-gray-400">(optional)</span></label>
              <input name="year_group" placeholder="e.g. Year 10" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm mb-1">Academic year <span className="text-gray-400">(optional)</span></label>
              <input name="academic_year" placeholder="e.g. 2024/25" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>
          <label className="block text-sm mb-1">Description <span className="text-gray-400">(optional)</span></label>
          <textarea name="description" rows={2} placeholder="e.g. Top-set Maths group" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />
          <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">Create class</button>
        </form>
      </Card>
    </>
  );
}

// ============================================================
// Placeholder for sections not yet migrated
// ============================================================

function SectionPlaceholder({ title, oldRoute }: { title: string; oldRoute: string }) {
  return (
    <Card>
      <div className="text-center py-8">
        <h2 className="text-lg font-bold text-gray-400">{title}</h2>
        <p className="text-sm text-gray-400 mt-2">This section is being migrated to the workspace.</p>
        <a href={oldRoute} className="inline-block mt-3 text-sm text-teal-700 hover:underline">
          Open in current view →
        </a>
      </div>
    </Card>
  );
}

// ============================================================
// Section titles and headers
// ============================================================

const SECTION_META: Record<string, { title: string; subtitle: string }> = {
  "": { title: "Overview", subtitle: "School dashboard" },
  courses: { title: "Courses", subtitle: "Manage courses and enrolments" },
  classes: { title: "Classes", subtitle: "Manage student groups" },
  people: { title: "People", subtitle: "Manage school members" },
  "join-codes": { title: "Join Codes", subtitle: "Manage join codes and requests" },
  sittings: { title: "Sittings", subtitle: "Manage exam sittings" },
};

// ============================================================
// Page Component
// ============================================================

export default async function SchoolWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; [key: string]: string | undefined }>;
}) {
  const auth = await requireAuth();
  if (auth.user!.is_system_admin === 1) redirect("/sys");
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const params = await searchParams;
  const section = params.section || "";
  const tid = active.tenant_id;
  const userId = auth.user!.id;

  // Detail params.
  const courseId = params.course_id || null;
  const classId = params.class_id || null;
  const tab = params.tab || "details";
  const dupWho = params.dup_who || undefined;
  const dupAuto = params.dup_auto || undefined;
  const dupMax = params.dup_max || undefined;

  // Counts for sidebar badges.
  const { first } = getDb();
  const [pendingApprovalRow, pendingJoinRow] = await Promise.all([
    first<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM sitting_approval_gates sag
       JOIN sitting_approval_responses sar
         ON sar.exam_id=sag.exam_id AND sar.gate_type=sag.gate_type
        AND sar.approver_id=sag.user_id AND sar.tenant_id=sag.tenant_id
       WHERE sag.user_id=? AND sag.tenant_id=? AND sar.status='PENDING'`,
      [userId, tid]
    ),
    first<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM join_requests WHERE tenant_id=? AND status='PENDING'", [tid]),
  ]);
  const pendingApprovals = Number(pendingApprovalRow?.cnt ?? 0);
  const pendingJoinRequests = Number(pendingJoinRow?.cnt ?? 0);

  const meta = SECTION_META[section] || SECTION_META[""];
  const currentPath = section ? `/school?section=${section}` : "/school";

  return (
    <WorkspaceShell
      sidebar={
        <SidebarNav
          items={getAdminNavItems(pendingApprovals, pendingJoinRequests)}
          schoolName={active.tenant_name}
          roleName="School Admin"
          currentPath={currentPath}
          switchSchool={auth.memberships.length > 1}
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
      {/* Overview */}
      {section === "" && <OverviewSection tenantId={tid} userId={userId} />}

      {/* Courses — list or detail */}
      {section === "courses" && !courseId && <CoursesSection tenantId={tid} />}
      {section === "courses" && courseId && <CourseDetail courseId={courseId} tab={tab} tenantId={tid} dupWho={dupWho} dupAuto={dupAuto} dupMax={dupMax} />}

      {/* Placeholder sections — will be migrated one by one */}
      {/* Classes — list or detail */}
      {section === "classes" && !classId && <ClassesSection tenantId={tid} />}
      {section === "classes" && classId && <ClassDetail classId={classId} tab={tab} tenantId={tid} />}
      {section === "people" && <SectionPlaceholder title="People" oldRoute="/school-people" />}
      {section === "join-codes" && <SectionPlaceholder title="Join Codes" oldRoute="/school-join-codes" />}
      {section === "sittings" && <SectionPlaceholder title="Sittings" oldRoute="/school-sittings" />}
    </WorkspaceShell>
  );
}
