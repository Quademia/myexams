// src/app/attempt-results/page.tsx
// Attempt results page — shows a student's scored exam attempt.
// Displays score summary, pass/fail, grade, and time taken.

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership, fmtISO } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card } from "@/components/Card";

export default async function AttemptResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ attempt_id?: string }>;
}) {
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active) redirect("/");

  const params = await searchParams;
  const attemptId = params.attempt_id;
  if (!attemptId) redirect("/student");

  const { first, all } = getDb();

  // Students can only view their own attempts. Teachers/admins can view any.
  let attempt;
  if (active.role === "STUDENT") {
    attempt = await first<{
      id: string; exam_id: string; user_id: string; score_raw: number | null;
      score_total: number | null; score_pct: number | null; grade: string | null;
      pass_mark_percent: number | null; time_taken_secs: number | null;
      submitted_at: string | null; grading_status: string; attempt_no: number;
    }>(
      "SELECT * FROM exam_attempts WHERE id=? AND user_id=? AND tenant_id=? AND status='SUBMITTED'",
      [attemptId, auth.user!.id, active.tenant_id]
    );
  } else {
    attempt = await first<{
      id: string; exam_id: string; user_id: string; score_raw: number | null;
      score_total: number | null; score_pct: number | null; grade: string | null;
      pass_mark_percent: number | null; time_taken_secs: number | null;
      submitted_at: string | null; grading_status: string; attempt_no: number;
    }>(
      "SELECT * FROM exam_attempts WHERE id=? AND tenant_id=? AND status='SUBMITTED'",
      [attemptId, active.tenant_id]
    );
  }
  if (!attempt) redirect("/student");

  const exam = await first<{
    id: string; title: string; results_published_at: string | null;
    allow_review: number; score_display: string; duration_mins: number | null;
    course_id: string;
  }>("SELECT * FROM exams WHERE id=? AND tenant_id=?", [attempt.exam_id, active.tenant_id]);
  if (!exam) redirect("/student");

  // Check if results are released (students only).
  const resultsReleased = exam.results_published_at && Date.parse(exam.results_published_at) <= Date.now();
  if (active.role === "STUDENT" && !resultsReleased) {
    return (
      <main className="max-w-lg mx-auto p-6 mt-12">
        <Card>
          <div className="text-center py-8">
            <div className="text-4xl mb-3">🔒</div>
            <h1 className="text-lg font-bold mb-2">Results not yet released</h1>
            <p className="text-sm text-gray-500 mb-4">Your results have not been released yet. Please check back later.</p>
            <a href="/student" className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 no-underline">
              ← Back to My Exams
            </a>
          </div>
        </Card>
      </main>
    );
  }

  // Load context.
  const student = await first<{ name: string }>("SELECT name FROM users WHERE id=?", [attempt.user_id]);
  const course = await first<{ title: string }>("SELECT title FROM courses WHERE id=?", [exam.course_id]);

  const pct = attempt.score_pct !== null ? Math.round(Number(attempt.score_pct)) : null;
  const passed = attempt.pass_mark_percent !== null && pct !== null
    ? pct >= Number(attempt.pass_mark_percent) : null;

  const fmtTime = (secs: number | null) => {
    if (!secs) return "—";
    const s = Math.round(Number(secs));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
  };

  const backUrl = active.role === "STUDENT" ? "/student" : `/exam-builder?exam_id=${exam.id}&tab=results`;

  return (
    <main className="max-w-2xl mx-auto p-4 mt-4">
      <Card>
        <a href={backUrl} className="text-sm text-gray-400 hover:underline">← Back</a>
        <h1 className="text-lg font-bold mt-2">{exam.title}</h1>
        <div className="text-sm text-gray-500">{course?.title}</div>
        <div className="text-sm text-gray-400 mt-1">
          {student?.name} · Attempt {attempt.attempt_no}
        </div>
      </Card>

      {/* Score summary */}
      <Card>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          {pct !== null && (
            <div>
              <div className="text-3xl font-bold text-teal-700">{pct}%</div>
              <div className="text-xs text-gray-500 mt-1">Score</div>
            </div>
          )}
          {attempt.score_raw !== null && (
            <div>
              <div className="text-3xl font-bold">{attempt.score_raw}/{attempt.score_total}</div>
              <div className="text-xs text-gray-500 mt-1">Marks</div>
            </div>
          )}
          {attempt.grade && (
            <div>
              <div className="text-3xl font-bold">{attempt.grade}</div>
              <div className="text-xs text-gray-500 mt-1">Grade</div>
            </div>
          )}
          {passed !== null && (
            <div>
              <div className={`text-3xl font-bold ${passed ? "text-green-700" : "text-red-600"}`}>
                {passed ? "PASS" : "FAIL"}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Pass mark: {attempt.pass_mark_percent}%
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Details */}
      <Card title="Details">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-500">Time taken:</span>
            <span className="ml-2 font-medium">{fmtTime(attempt.time_taken_secs)}</span>
          </div>
          <div>
            <span className="text-gray-500">Submitted:</span>
            <span className="ml-2 font-medium">{fmtISO(attempt.submitted_at)}</span>
          </div>
          <div>
            <span className="text-gray-500">Grading:</span>
            <span className={`ml-2 inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
              attempt.grading_status === "FULLY_GRADED" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
            }`}>
              {attempt.grading_status === "FULLY_GRADED" ? "Fully Graded" : "Pending"}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Duration:</span>
            <span className="ml-2 font-medium">{exam.duration_mins || 60} mins</span>
          </div>
        </div>
      </Card>
    </main>
  );
}
