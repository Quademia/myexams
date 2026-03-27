// src/app/attempt-review/page.tsx
// Answer review page — students see their answers alongside correct answers and feedback.

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership, fmtISO } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card } from "@/components/ui/Card";

// ── Types ───────────────────────────────────────────────────────────────

interface AttemptRow {
  id: string;
  exam_id: string;
  user_id: string;
  tenant_id: string;
  status: string;
  question_order_json: string;
  score_display: string;
  score_pct: number | null;
  score_raw: number | null;
  score_total: number | null;
  grade: string | null;
  pass_mark_percent: number | null;
}

interface ExamRow {
  id: string;
  title: string;
  allow_review: number;
  results_published_at: string | null;
}

interface QuestionRow {
  id: string;
  question_type: string;
  question_text: string;
  marks: number;
  model_answer: string | null;
  feedback: string | null;
}

interface OptionRow {
  id: string;
  question_id: string;
  option_text: string;
  is_correct: number;
  feedback: string | null;
  sort_order: number;
}

interface AnswerRow {
  question_id: string;
  answer_json: string | null;
  score_awarded: number | null;
  teacher_note: string | null;
}

// ── Page component ──────────────────────────────────────────────────────

export default async function AttemptReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ attempt_id?: string }>;
}) {
  const params = await searchParams;
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "STUDENT") redirect("/");

  const { first, all } = getDb();
  const userId = auth.user!.id;
  const tid = active.tenant_id;
  const attemptId = params.attempt_id || "";

  // Load attempt
  const attempt = await first<AttemptRow>(
    `SELECT * FROM exam_attempts WHERE id=? AND user_id=? AND tenant_id=? AND status='SUBMITTED'`,
    [attemptId, userId, tid]
  );
  if (!attempt) redirect("/student");

  // Load exam
  const exam = await first<ExamRow>(
    `SELECT * FROM exams WHERE id=?`,
    [attempt.exam_id]
  );
  if (!exam) redirect("/student");

  // Access checks
  const resultsReleased =
    exam.results_published_at &&
    Date.parse(exam.results_published_at) <= Date.now();

  if (exam.allow_review !== 1 || !resultsReleased) {
    const message =
      exam.allow_review !== 1
        ? "Answer review is not enabled for this exam."
        : "Results have not been released yet.";
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="w-full max-w-lg">
          <Card>
            <div className="text-center">
              <div className="text-4xl mb-3">🔒</div>
              <h1 className="text-lg font-bold">{message}</h1>
              <a
                href={`/attempt-results?attempt_id=${attemptId}`}
                className="inline-block mt-4 text-sm text-teal-700 hover:underline"
              >
                ← Back to Results
              </a>
            </div>
          </Card>
        </div>
      </main>
    );
  }

  // Load questions in snapshot order
  const questionOrder: string[] = JSON.parse(attempt.question_order_json || "[]");
  const allQs = await all<QuestionRow>(
    `SELECT id, question_type, question_text, marks, model_answer, feedback
     FROM exam_questions WHERE exam_id=? AND tenant_id=?`,
    [attempt.exam_id, tid]
  );
  const qMap = Object.fromEntries(allQs.map((q) => [q.id, q]));
  const questions = questionOrder.map((id) => qMap[id]).filter(Boolean);

  // Load options (with is_correct — review page shows correct answers)
  const qIds = questions.map((q) => q.id);
  const allOpts =
    qIds.length > 0
      ? await all<OptionRow>(
          `SELECT id, question_id, option_text, is_correct, feedback, sort_order
           FROM exam_question_options
           WHERE question_id IN (${qIds.map(() => "?").join(",")})
           ORDER BY sort_order ASC`,
          qIds
        )
      : [];
  const optsByQ: Record<string, OptionRow[]> = {};
  for (const o of allOpts) {
    if (!optsByQ[o.question_id]) optsByQ[o.question_id] = [];
    optsByQ[o.question_id].push(o);
  }

  // Load answers
  const ansRows = await all<AnswerRow>(
    `SELECT question_id, answer_json, score_awarded, teacher_note FROM exam_answers WHERE attempt_id=?`,
    [attemptId]
  );
  const answersByQ: Record<string, AnswerRow> = {};
  for (const a of ansRows) {
    answersByQ[a.question_id] = a;
  }

  // Score display variables
  const sd = attempt.score_display || "BOTH";
  const scorePct = attempt.score_pct != null ? Number(attempt.score_pct) : null;
  const scoreRaw = attempt.score_raw != null ? Number(attempt.score_raw) : null;
  const scoreTotal = attempt.score_total != null ? Number(attempt.score_total) : null;
  const scoreHidden = sd === "NONE" || sd === "HIDDEN";

  const hasPassMark = attempt.pass_mark_percent !== null && scorePct !== null;
  const passed = hasPassMark && scorePct! >= Number(attempt.pass_mark_percent);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <main className="max-w-3xl mx-auto p-4">
      {/* Header */}
      <Card>
        <a
          href={`/attempt-results?attempt_id=${attemptId}`}
          className="text-teal-700 text-sm hover:underline"
        >
          ← Results
        </a>
        <h1 className="text-lg font-bold mt-2">{exam.title}</h1>
      </Card>

      {/* Mini score banner */}
      <Card>
        <div className="flex items-center justify-center gap-3 flex-wrap text-center">
          {!scoreHidden && scorePct !== null && (
            <span className="text-lg font-bold">
              {sd === "BOTH" && (
                <>
                  {scorePct}%
                  {scoreRaw !== null && scoreTotal !== null && (
                    <span className="text-sm text-gray-400 ml-1">
                      · {scoreRaw}/{scoreTotal}
                    </span>
                  )}
                </>
              )}
              {sd === "PERCENT" && <>{scorePct}%</>}
              {sd === "MARKS" && scoreRaw !== null && scoreTotal !== null && (
                <>
                  {scoreRaw}/{scoreTotal}
                </>
              )}
            </span>
          )}

          {attempt.grade && (
            <span className="text-lg font-bold text-teal-700">{attempt.grade}</span>
          )}

          {hasPassMark && (
            passed ? (
              <span className="inline-block px-3 py-0.5 rounded-full bg-green-50 text-green-700 text-xs font-bold">
                ✓ PASS
              </span>
            ) : (
              <span className="inline-block px-3 py-0.5 rounded-full bg-red-50 text-red-700 text-xs font-bold">
                ✗ FAIL
              </span>
            )
          )}
        </div>
      </Card>

      {/* Question cards */}
      {questions.map((q, idx) => {
        const opts = optsByQ[q.id] || [];
        const ans = answersByQ[q.id];
        let parsed: string | string[] | null = null;
        try {
          if (ans?.answer_json) parsed = JSON.parse(ans.answer_json);
        } catch {
          /* ignore */
        }

        const isChoice =
          q.question_type === "MCQ" ||
          q.question_type === "TRUE_FALSE" ||
          q.question_type === "MULTIPLE_SELECT";
        const isMulti = q.question_type === "MULTIPLE_SELECT";
        const selectedIds: string[] = isMulti
          ? Array.isArray(parsed) ? parsed : []
          : typeof parsed === "string" ? [parsed] : [];

        const marksAwarded = ans?.score_awarded;

        return (
          <Card key={q.id}>
            {/* Question header */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <span className="text-xs text-gray-500 font-semibold uppercase">
                Q{idx + 1}
              </span>
              <span className="text-xs text-gray-500">
                {marksAwarded !== null && marksAwarded !== undefined
                  ? `${Number(marksAwarded)} / ${Number(q.marks)} marks`
                  : `— / ${Number(q.marks)} marks`}
              </span>
            </div>

            {/* Question text */}
            <p className="text-sm whitespace-pre-wrap mb-3">{q.question_text}</p>

            {/* ── MCQ / TRUE_FALSE / MULTIPLE_SELECT ────────────── */}
            {isChoice && (
              <div className="space-y-2 mb-3">
                {opts.map((opt) => {
                  const isCorrect = opt.is_correct === 1;
                  const wasSelected = selectedIds.includes(opt.id);

                  // Determine styling
                  let bg = "bg-white border-gray-200"; // default
                  let icon = "";

                  if (isCorrect && wasSelected) {
                    // Student selected correctly
                    bg = "bg-green-50 border-green-300";
                    icon = "✓";
                  } else if (isCorrect && !wasSelected) {
                    // Correct but student missed it
                    bg = isMulti
                      ? "bg-amber-50 border-amber-300" // missed correct in multi-select
                      : "bg-green-50 border-green-200";
                    icon = "✓";
                  } else if (!isCorrect && wasSelected) {
                    // Student selected a wrong option
                    bg = "bg-red-50 border-red-300";
                    icon = "✗";
                  } else {
                    // Not correct, not selected — neutral
                    icon = "✗";
                  }

                  return (
                    <div key={opt.id}>
                      <div
                        className={`flex items-center gap-3 p-3 rounded-lg border text-sm ${bg}`}
                      >
                        <span
                          className={`text-xs font-bold w-5 text-center ${
                            isCorrect ? "text-green-700" : "text-red-400"
                          }`}
                        >
                          {icon}
                        </span>
                        <span className="flex-1">{opt.option_text}</span>
                        {wasSelected && (
                          <span className="text-xs text-gray-400 italic">
                            Your answer
                          </span>
                        )}
                      </div>
                      {/* Option-level feedback */}
                      {opt.feedback && (
                        <div className="ml-8 mt-1 text-xs text-gray-500 italic">
                          {opt.feedback}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── SHORT_ANSWER / ESSAY ──────────────────────────── */}
            {(q.question_type === "SHORT_ANSWER" || q.question_type === "ESSAY") && (
              <div className="space-y-3 mb-3">
                {/* Student's answer */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="text-xs text-gray-400 font-semibold uppercase mb-1">
                    Your answer
                  </div>
                  {parsed ? (
                    <p className="text-sm whitespace-pre-wrap">{String(parsed)}</p>
                  ) : (
                    <p className="text-sm text-gray-400 italic">No answer given</p>
                  )}
                </div>

                {/* Model answer */}
                {q.model_answer && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <div className="text-xs text-green-700 font-semibold uppercase mb-1">
                      Model answer
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{q.model_answer}</p>
                  </div>
                )}

                {/* Teacher note */}
                {ans?.teacher_note && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <div className="text-xs text-amber-700 font-semibold uppercase mb-1">
                      Teacher note
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{ans.teacher_note}</p>
                  </div>
                )}

                {/* Marks awarded */}
                <div className="text-sm text-gray-600">
                  {marksAwarded !== null && marksAwarded !== undefined
                    ? `${Number(marksAwarded)} / ${Number(q.marks)} marks awarded`
                    : "Not yet graded"}
                </div>
              </div>
            )}

            {/* Question-level feedback */}
            {q.feedback && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-2">
                <div className="text-xs text-blue-700 font-semibold uppercase mb-1">
                  Feedback
                </div>
                <p className="text-sm whitespace-pre-wrap">{q.feedback}</p>
              </div>
            )}
          </Card>
        );
      })}

      {/* Back link at bottom */}
      <Card>
        <div className="text-center">
          <a
            href={`/attempt-results?attempt_id=${attemptId}`}
            className="text-sm text-teal-700 hover:underline"
          >
            ← Back to Results
          </a>
        </div>
      </Card>
    </main>
  );
}
