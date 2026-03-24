// src/app/exam-preview/page.tsx
// Exam Preview — lets teachers see exactly how an exam looks to students,
// but in read-only mode (no answer inputs, no submission button).
//
// WHY THIS EXISTS:
// Before publishing an exam, teachers need to verify the questions look
// correct, the wording is clear, and the options are in the right order.
// This page gives that read-only walkthrough without creating any attempt records.
//
// ROUTE: /exam-preview?exam_id=<id>
// ACCESS: TEACHER or SCHOOL_ADMIN only

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card } from "@/components/Card";

// Helper: turn a question_type code into a readable label.
function qTypeLabel(t: string): string {
  if (t === "MCQ") return "Multiple Choice";
  if (t === "MULTIPLE_SELECT") return "Multiple Select";
  if (t === "TRUE_FALSE") return "True / False";
  if (t === "SHORT_ANSWER") return "Short Answer";
  if (t === "ESSAY") return "Essay";
  return t;
}

export default async function ExamPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ exam_id?: string }>;
}) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  // requireAuth() reads the session cookie. If not logged in, it redirects to /login.
  // pickActiveMembership() tells us which school the user is currently viewing.
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);

  // System admins and users without an active school can still preview
  // if they have system admin access.
  const isSystemAdmin = auth.user!.is_system_admin === 1;
  if (!active && !isSystemAdmin) redirect("/");
  if (active && active.role !== "TEACHER" && active.role !== "SCHOOL_ADMIN") redirect("/");

  // ── Params ──────────────────────────────────────────────────────────────────
  const params = await searchParams;
  const examId = params.exam_id;
  if (!examId) redirect("/teacher");

  // ── Data loading ─────────────────────────────────────────────────────────────
  // getDb() returns helper functions: first (single row), all (array of rows), run (insert/update).
  const { first, all } = getDb();

  // Load the exam. System admins can view any exam; others must match tenant_id.
  const tenantId = active?.tenant_id;
  const exam = await first<{
    id: string; title: string; description: string | null;
    duration_mins: number | null; time_limit_minutes: number | null;
    shuffle_questions: number; pass_mark_percent: number | null;
    status: string; course_id: string;
  }>(
    tenantId
      ? "SELECT id, title, description, duration_mins, time_limit_minutes, shuffle_questions, pass_mark_percent, status, course_id FROM exams WHERE id=? AND tenant_id=?"
      : "SELECT id, title, description, duration_mins, time_limit_minutes, shuffle_questions, pass_mark_percent, status, course_id FROM exams WHERE id=?",
    tenantId ? [examId, tenantId] : [examId]
  );
  if (!exam) redirect("/teacher");

  const course = await first<{ title: string }>(
    "SELECT title FROM courses WHERE id=?", [exam.course_id]
  );

  // Load all questions ordered by sort_order (the teacher-defined sequence).
  const questions = await all<{
    id: string; question_text: string; question_type: string;
    marks: number; sort_order: number; model_answer: string | null;
    feedback: string | null;
  }>(
    "SELECT id, question_text, question_type, marks, sort_order, model_answer, feedback FROM exam_questions WHERE exam_id=? ORDER BY sort_order ASC",
    [examId]
  );

  // For each question, load its answer options (MCQ / TRUE_FALSE need these).
  // We use a Map so we can look up options by question_id efficiently.
  const optionsMap = new Map<string, { id: string; option_text: string; is_correct: number; sort_order: number }[]>();
  if (questions.length > 0) {
    const questionIds = questions.map((q) => q.id);
    // SQLite doesn't support named params for IN lists, so we build placeholders dynamically.
    const placeholders = questionIds.map(() => "?").join(",");
    const opts = await all<{
      id: string; question_id: string; option_text: string; is_correct: number; sort_order: number;
    }>(
      `SELECT id, question_id, option_text, is_correct, sort_order FROM exam_question_options WHERE question_id IN (${placeholders}) ORDER BY sort_order ASC`,
      questionIds
    );
    for (const opt of opts) {
      if (!optionsMap.has(opt.question_id)) optionsMap.set(opt.question_id, []);
      optionsMap.get(opt.question_id)!.push(opt);
    }
  }

  const totalMarks = questions.reduce((sum, q) => sum + Number(q.marks), 0);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <main className="max-w-2xl mx-auto p-4 mt-4">
      {/* Header card */}
      <Card>
        <a href={`/exam-builder?exam_id=${examId}`} className="text-sm text-gray-400 hover:underline">
          ← Back to Exam Builder
        </a>
        <div className="mt-2 flex items-start justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold">{exam.title}</h1>
            {course && <div className="text-sm text-gray-500">{course.title}</div>}
          </div>
          {/* Preview badge — makes it clear this is read-only */}
          <span className="inline-block px-2 py-0.5 bg-amber-100 text-amber-800 text-xs font-semibold rounded-full shrink-0">
            Preview Mode
          </span>
        </div>

        {exam.description && (
          <p className="mt-3 text-sm text-gray-600">{exam.description}</p>
        )}

        {/* Exam metadata grid */}
        <div className="mt-3 grid grid-cols-3 gap-3 text-center text-sm">
          <div className="bg-gray-50 rounded-lg p-2">
            <div className="font-bold text-teal-700">{questions.length}</div>
            <div className="text-xs text-gray-500 mt-0.5">Questions</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2">
            <div className="font-bold text-teal-700">{totalMarks}</div>
            <div className="text-xs text-gray-500 mt-0.5">Total Marks</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2">
            <div className="font-bold text-teal-700">{exam.duration_mins ?? exam.time_limit_minutes ?? "—"}</div>
            <div className="text-xs text-gray-500 mt-0.5">Minutes</div>
          </div>
        </div>

        {exam.pass_mark_percent !== null && (
          <p className="mt-2 text-xs text-gray-400">Pass mark: {exam.pass_mark_percent}%</p>
        )}
      </Card>

      {/* No questions yet */}
      {questions.length === 0 && (
        <Card>
          <p className="text-sm text-gray-500 text-center py-4">
            No questions have been added to this exam yet.{" "}
            <a href={`/exam-builder?exam_id=${examId}&tab=questions`} className="text-teal-700 underline">
              Add questions →
            </a>
          </p>
        </Card>
      )}

      {/* Questions list */}
      {questions.map((q, index) => {
        const options = optionsMap.get(q.id) ?? [];
        const isChoice = q.question_type === "MCQ" || q.question_type === "TRUE_FALSE" || q.question_type === "MULTIPLE_SELECT";

        return (
          <Card key={q.id}>
            {/* Question header row */}
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 bg-teal-700 text-white text-xs font-bold rounded-full shrink-0">
                  {index + 1}
                </span>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {qTypeLabel(q.question_type)}
                </span>
              </div>
              <span className="text-xs font-semibold text-gray-500 shrink-0">
                {q.marks} {Number(q.marks) === 1 ? "mark" : "marks"}
              </span>
            </div>

            {/* Question text */}
            <p className="text-sm text-gray-800 leading-relaxed mb-3">
              {q.question_text}
            </p>

            {/* Answer options (MCQ, TRUE_FALSE, MULTIPLE_SELECT) */}
            {isChoice && options.length > 0 && (
              <div className="space-y-2">
                {options.map((opt) => (
                  <div
                    key={opt.id}
                    // In preview mode, we highlight correct answers in green so
                    // the teacher can verify the answer key is right.
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                      opt.is_correct
                        ? "border-green-300 bg-green-50 text-green-800"
                        : "border-gray-200 bg-gray-50 text-gray-700"
                    }`}
                  >
                    {/* Radio/checkbox visual (disabled — preview only) */}
                    <span className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                      opt.is_correct ? "border-green-500 bg-green-500" : "border-gray-300"
                    }`}>
                      {opt.is_correct && (
                        <span className="w-2 h-2 bg-white rounded-full block" />
                      )}
                    </span>
                    {opt.option_text}
                    {opt.is_correct && (
                      <span className="ml-auto text-xs text-green-600 font-semibold">✓ correct</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Short answer / Essay: just show the answer box greyed out */}
            {(q.question_type === "SHORT_ANSWER" || q.question_type === "ESSAY") && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-400 italic">
                {q.question_type === "ESSAY" ? "Student writes a long-form essay here…" : "Student types a short answer here…"}
              </div>
            )}

            {/* Model answer (shown in preview so teacher can verify) */}
            {q.model_answer && (
              <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs font-semibold text-blue-700 mb-1">Model Answer</p>
                <p className="text-xs text-blue-800">{q.model_answer}</p>
              </div>
            )}

            {/* General feedback */}
            {q.feedback && (
              <div className="mt-2 p-2 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-xs font-semibold text-gray-500 mb-1">Feedback</p>
                <p className="text-xs text-gray-600">{q.feedback}</p>
              </div>
            )}
          </Card>
        );
      })}

      {/* Footer note */}
      {questions.length > 0 && (
        <div className="text-center text-xs text-gray-400 mt-2 mb-8">
          End of preview — {questions.length} question{questions.length !== 1 ? "s" : ""} · {totalMarks} mark{totalMarks !== 1 ? "s" : ""} total
        </div>
      )}
    </main>
  );
}
