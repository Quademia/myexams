// src/app/teacher/page.tsx
// Teacher Workspace — Phase 3 of the workspace restructure.
// Uses WorkspaceShell with sidebar. Main content area shows either
// the exam list (no exam selected) or the exam builder (exam selected).

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { WorkspaceHeader } from "@/components/layout/WorkspaceHeader";
import { SidebarNav } from "@/components/layout/SidebarNav";
import { ExamBuilderContent } from "@/components/exam/ExamBuilderContent";
import { getTeacherNavItems } from "@/lib/teacher-nav";
import { changePasswordAction } from "@/lib/change-password";

// ============================================================
// Server Actions
// ============================================================

async function createExamAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "TEACHER") redirect("/");

  const courseId = (formData.get("course_id") as string || "").trim();
  const title = (formData.get("title") as string || "").trim();
  if (!courseId || !title) redirect("/teacher");

  const { run } = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await run(
    `INSERT INTO exams (id, tenant_id, course_id, title, description, status, duration_mins, shuffle_questions,
       score_display, pass_mark_percent, allow_review, max_attempts, created_by, created_at, updated_at)
     VALUES (?,?,?,?,NULL,'DRAFT',60,0,'BOTH',50,0,1,?,?,?)`,
    [id, active.tenant_id, courseId, title, auth.user!.id, now, now]
  );
  redirect(`/teacher?exam_id=${id}&toast=Exam+created`);
}

// ============================================================
// Helpers
// ============================================================

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PUBLISHED: "bg-green-50 text-green-700",
    ACTIVE: "bg-green-50 text-green-700",
    CLOSED: "bg-red-50 text-red-700",
    DRAFT: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${styles[status] || styles.DRAFT}`}>
      {status}
    </span>
  );
}

// ============================================================
// Page Component
// ============================================================

export default async function TeacherPage({
  searchParams,
}: {
  searchParams: Promise<{ exam_id?: string; tab?: string; edit_q?: string; type?: string; search?: string; vis?: string }>;
}) {
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "TEACHER") redirect("/");

  const { all, first } = getDb();
  const userId = auth.user!.id;
  const tid = active.tenant_id;

  const params = await searchParams;
  const examId = params.exam_id || null;
  const tab = params.tab || "settings";
  const editQId = params.edit_q || null;
  const bankFilterType = params.type || "";
  const bankSearch = params.search || "";
  const bankVis = params.vis || "";

  // Fetch all data in parallel.
  const [courses, standaloneExams, sittingExams, pendingCount] = await Promise.all([
    // 1. Courses this teacher is assigned to
    all<{ id: string; title: string }>(
      `SELECT c.id, c.title FROM course_teachers ct
       JOIN courses c ON c.id = ct.course_id
       WHERE ct.user_id=? AND c.tenant_id=? AND c.status='ACTIVE'
       ORDER BY c.title ASC`,
      [userId, tid]
    ),
    // 2. Standalone exams (not in a sitting)
    all<{
      id: string; title: string; status: string; duration_mins: number | null;
      course_title: string;
    }>(
      `SELECT e.id, e.title, e.status, e.duration_mins,
         c.title AS course_title
       FROM exams e
       JOIN courses c ON c.id = e.course_id
       JOIN course_teachers ct ON ct.course_id = e.course_id AND ct.user_id = ?
       LEFT JOIN exam_sitting_papers esp ON esp.exam_id = e.id
       WHERE e.tenant_id=? AND esp.exam_id IS NULL
       ORDER BY e.updated_at DESC`,
      [userId, tid]
    ),
    // 3. Exams in sittings
    all<{
      id: string; title: string; status: string; duration_mins: number | null;
      course_title: string; sitting_title: string; sitting_id: string;
    }>(
      `SELECT e.id, e.title, e.status, e.duration_mins,
         c.title AS course_title,
         es.title AS sitting_title,
         es.id AS sitting_id
       FROM exams e
       JOIN courses c ON c.id = e.course_id
       JOIN course_teachers ct ON ct.course_id = e.course_id AND ct.user_id = ?
       JOIN exam_sitting_papers esp ON esp.exam_id = e.id
       JOIN exam_sittings es ON es.id = esp.sitting_id
       WHERE e.tenant_id=?
       ORDER BY es.title ASC, e.updated_at DESC`,
      [userId, tid]
    ),
    // 4. Pending approval count
    first<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM sitting_approval_gates sag
       JOIN sitting_approval_responses sar
         ON sar.exam_id=sag.exam_id AND sar.gate_type=sag.gate_type
        AND sar.approver_id=sag.user_id AND sar.tenant_id=sag.tenant_id
       WHERE sag.user_id=? AND sag.tenant_id=? AND sar.status='PENDING'`,
      [userId, tid]
    ),
  ]);

  const pendingNum = Number(pendingCount?.cnt ?? 0);

  // If an exam is selected, verify teacher has access to it.
  let examTitle: string | null = null;
  if (examId) {
    const exam = await first<{ id: string; title: string; course_id: string }>(
      "SELECT id, title, course_id FROM exams WHERE id=? AND tenant_id=?",
      [examId, tid]
    );
    if (!exam) redirect("/teacher");
    const owns = await first("SELECT 1 FROM course_teachers WHERE course_id=? AND user_id=?", [exam.course_id, userId]);
    if (!owns) redirect("/teacher");
    examTitle = exam.title;
  }

  // Sidebar navigation items (shared definition).
  const navItems = getTeacherNavItems(pendingNum);

  return (
    <WorkspaceShell
      sidebar={
        <SidebarNav
          items={navItems}
          schoolName={active.tenant_name}
          roleName="Teacher"
          currentPath="/teacher"
          switchSchool={auth.memberships.length > 1}
          profile={{
            user: { id: auth.user!.id, name: auth.user!.name, email: auth.user!.email, is_system_admin: auth.user!.is_system_admin },
            memberships: auth.memberships.map(m => ({ tenant_id: m.tenant_id, tenant_name: m.tenant_name, role: m.role, status: "ACTIVE" })),
            changePasswordAction,
          }}
        />
      }
      header={
        examId && examTitle ? (
          <WorkspaceHeader
            title={examTitle}
            subtitle="Exam Builder"
            actions={
              <a href="/teacher" className="text-sm text-teal-700 hover:underline no-underline">
                ← My Exams
              </a>
            }
          />
        ) : (
          <WorkspaceHeader
            title="My Exams"
            subtitle="Click any exam to open the builder"
          />
        )
      }
    >
      {examId ? (
        <ExamBuilderContent
          examId={examId}
          tab={tab}
          editQId={editQId}
          auth={auth}
          active={active}
          returnPath="/teacher"
          bankFilterType={bankFilterType}
          bankSearch={bankSearch}
          bankVis={bankVis}
        />
      ) : (
        <>
          {/* Pending approvals banner */}
          {pendingNum > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 mb-4 flex items-center justify-between flex-wrap gap-3">
              <span className="text-sm font-semibold">
                You have {pendingNum} pending approval{pendingNum !== 1 ? "s" : ""}
              </span>
              <a href="/approvals" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800 no-underline">
                View Inbox
              </a>
            </div>
          )}

          {/* Create exam form */}
          <CreateExamForm courses={courses} createExamAction={createExamAction} />

          {/* Two-pane exam list */}
          <ExamListView standaloneExams={standaloneExams} sittingExams={sittingExams} />
        </>
      )}
    </WorkspaceShell>
  );
}

// ============================================================
// Create Exam Form
// ============================================================

function CreateExamForm({
  courses,
  createExamAction,
}: {
  courses: { id: string; title: string }[];
  createExamAction: (formData: FormData) => Promise<void>;
}) {
  if (courses.length === 0) {
    return (
      <Card>
        <p className="text-sm text-gray-400">No courses assigned — ask your school admin to assign you to a course before creating exams.</p>
      </Card>
    );
  }

  return (
    <Card title="Create New Exam">
      <form action={createExamAction} className="flex gap-2 items-end flex-wrap">
        <div className="flex-1 min-w-[150px]">
          <label className="block text-sm mb-1">Course</label>
          <select name="course_id" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm mb-1">Exam title</label>
          <input name="title" placeholder="e.g. Term 1 Mathematics Exam" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
          + New Exam
        </button>
      </form>
    </Card>
  );
}

// ============================================================
// Exam List View — Two-pane layout
// ============================================================

function ExamListView({
  standaloneExams,
  sittingExams,
}: {
  standaloneExams: { id: string; title: string; status: string; duration_mins: number | null; course_title: string }[];
  sittingExams: { id: string; title: string; status: string; duration_mins: number | null; course_title: string; sitting_title: string; sitting_id: string }[];
}) {
  return (
    <div className="flex gap-4">
      {/* Left pane — standalone exams */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">My standalone exams</h3>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{standaloneExams.length}</span>
        </div>
        {standaloneExams.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-gray-400">No exams yet</p>
          </div>
        ) : (
          standaloneExams.map((exam) => (
            <a key={exam.id} href={`/teacher?exam_id=${exam.id}`} className="no-underline block">
              <div className="bg-white border border-gray-200 rounded-xl p-3 mb-2 hover:border-teal-300 hover:shadow-sm transition-all cursor-pointer">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-sm text-gray-900 leading-snug">{exam.title}</div>
                  <StatusBadge status={exam.status} />
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {exam.course_title} &middot; {exam.duration_mins || 60} min
                </div>
              </div>
            </a>
          ))
        )}
      </div>

      {/* Divider */}
      <div className="w-px bg-gray-200 flex-shrink-0" />

      {/* Right pane — sitting exams */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Exams in sittings</h3>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{sittingExams.length}</span>
        </div>
        {sittingExams.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-gray-400">No sitting exams</p>
          </div>
        ) : (
          sittingExams.map((exam) => (
            <a key={exam.id} href={`/teacher?exam_id=${exam.id}`} className="no-underline block">
              <div className="bg-white border border-gray-200 rounded-xl p-3 mb-2 hover:border-teal-300 hover:shadow-sm transition-all cursor-pointer">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-sm text-gray-900 leading-snug">{exam.title}</div>
                  <StatusBadge status={exam.status} />
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {exam.course_title} &middot; {exam.duration_mins || 60} min
                </div>
                <div className="text-xs text-teal-600 mt-1">{exam.sitting_title}</div>
              </div>
            </a>
          ))
        )}
      </div>
    </div>
  );
}
