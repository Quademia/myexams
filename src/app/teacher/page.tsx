// src/app/teacher/page.tsx
// Teacher dashboard — shows assigned courses, exams, create exam form,
// and pending approvals banner.

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership, roleLabel, fmtISO } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card } from "@/components/Card";

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
  redirect(`/exam-builder?exam_id=${id}`);
}

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

export default async function TeacherPage() {
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "TEACHER") redirect("/");

  const { all, first } = getDb();
  const userId = auth.user!.id;
  const tid = active.tenant_id;

  const [courses, exams, pendingCount] = await Promise.all([
    all<{ id: string; title: string }>(
      `SELECT c.id, c.title FROM course_teachers ct
       JOIN courses c ON c.id = ct.course_id
       WHERE ct.user_id=? AND c.tenant_id=? AND c.status='ACTIVE'
       ORDER BY c.title ASC`,
      [userId, tid]
    ),
    all<{
      id: string; title: string; status: string; duration_mins: number | null;
      course_title: string; sitting_title: string | null;
    }>(
      `SELECT e.id, e.title, e.status, e.duration_mins,
         c.title AS course_title, es.title AS sitting_title
       FROM exams e
       JOIN courses c ON c.id = e.course_id
       JOIN course_teachers ct ON ct.course_id = e.course_id AND ct.user_id = ?
       LEFT JOIN exam_sitting_papers esp ON esp.exam_id = e.id
       LEFT JOIN exam_sittings es ON es.id = esp.sitting_id
       WHERE e.tenant_id=?
       ORDER BY e.created_at DESC`,
      [userId, tid]
    ),
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

  return (
    <main className="max-w-5xl mx-auto p-4">
      {/* Header */}
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-bold">Teacher</h1>
            <div className="flex gap-2 mt-1">
              <span className="inline-block px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-xs font-semibold">
                {active.tenant_name}
              </span>
              <span className="inline-block px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-xs font-semibold">
                {roleLabel(active.role)}
              </span>
            </div>
          </div>
          <div className="flex gap-3 text-sm">
            {auth.memberships.length > 1 && (
              <a href="/choose-school" className="text-teal-700 hover:underline">Switch school</a>
            )}
            <a href="/question-bank" className="text-teal-700 hover:underline">Question Bank</a>
            <a href="/profile" className="text-teal-700 hover:underline">Profile</a>
            <a href="/logout" className="text-teal-700 hover:underline">Logout</a>
          </div>
        </div>
      </Card>

      {/* Pending approvals banner */}
      {pendingNum > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 mb-3 flex items-center justify-between flex-wrap gap-3">
          <span className="text-sm font-semibold">
            You have {pendingNum} pending approval{pendingNum !== 1 ? "s" : ""}
          </span>
          <a href="/approvals" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800 no-underline">
            View Inbox →
          </a>
        </div>
      )}

      {/* Create exam */}
      <Card title="Create New Exam">
        <form action={createExamAction} className="flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm mb-1">Course</label>
            <select name="course_id" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
              {courses.length === 0 ? (
                <option value="">No courses assigned yet</option>
              ) : (
                courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)
              )}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm mb-1">Exam title</label>
            <input name="title" placeholder="e.g. Term 1 Mathematics Exam" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
            Create exam
          </button>
        </form>
      </Card>

      {/* Exams list */}
      <Card title="My Exams">
        {exams.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No exams yet — create one above</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Title</th>
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Status</th>
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Details</th>
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {exams.map((e) => (
                  <tr key={e.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-2">
                      <div className="font-medium">{e.title}</div>
                      <div className="text-xs text-gray-400">{e.course_title}</div>
                      {e.sitting_title && (
                        <div className="text-xs text-gray-400 mt-0.5">{e.sitting_title}</div>
                      )}
                    </td>
                    <td className="py-3 px-2"><StatusBadge status={e.status} /></td>
                    <td className="py-3 px-2 text-xs text-gray-500">
                      {e.duration_mins ? `${e.duration_mins} mins` : "No time limit"}
                    </td>
                    <td className="py-3 px-2">
                      <a href={`/exam-builder?exam_id=${e.id}`} className="px-3 py-1 bg-teal-700 text-white text-xs font-semibold rounded-lg hover:bg-teal-800 no-underline">
                        Open
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Assigned courses */}
      <Card title="My assigned courses">
        {courses.length === 0 ? (
          <p className="text-sm text-gray-400">None yet</p>
        ) : (
          <ul className="space-y-1">
            {courses.map((c) => (
              <li key={c.id} className="text-sm">{c.title}</li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
