// src/app/exam-grade/page.tsx
// Grading page — shows student's answers question by question.
// Teachers can score essay/short answer questions. Auto-graded questions show results.

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card } from "@/components/Card";

async function gradeAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || (active.role !== "TEACHER" && active.role !== "SCHOOL_ADMIN")) redirect("/");

  const attemptId = formData.get("attempt_id") as string;
  const examId = formData.get("exam_id") as string;
  if (!attemptId || !examId) redirect("/teacher");

  const { all, run } = getDb();
  const now = new Date().toISOString();

  // Get manual questions (SHORT_ANSWER, ESSAY).
  const manualQs = await all<{ id: string; marks: number }>(
    "SELECT id, marks FROM exam_questions WHERE exam_id=? AND (question_type='SHORT_ANSWER' OR question_type='ESSAY')",
    [examId]
  );

  for (const q of manualQs) {
    const scoreStr = (formData.get(`score_${q.id}`) as string || "").trim();
    if (scoreStr === "") continue;
    const score = Math.max(0, Math.min(Number(q.marks), parseFloat(scoreStr) || 0));
    const note = (formData.get(`note_${q.id}`) as string || "").trim() || null;
    await run(
      "UPDATE exam_answers SET score_awarded=?, teacher_note=?, graded_by=?, graded_at=?, updated_at=? WHERE attempt_id=? AND question_id=?",
      [score, note, auth.user!.id, now, now, attemptId, q.id]
    );
  }

  // Recalculate total score.
  const answers = await all<{ score_awarded: number | null }>(
    "SELECT score_awarded FROM exam_answers WHERE attempt_id=?", [attemptId]
  );
  const totalAwarded = answers.reduce((s, a) => s + Number(a.score_awarded ?? 0), 0);
  const allQuestions = await all<{ marks: number }>("SELECT marks FROM exam_questions WHERE exam_id=?", [examId]);
  const totalPossible = allQuestions.reduce((s, q) => s + Number(q.marks), 0);
  const pct = totalPossible > 0 ? (totalAwarded / totalPossible) * 100 : 0;

  const allGraded = !answers.some((a) => a.score_awarded === null);
  const gradingStatus = allGraded ? "FULLY_GRADED" : "AUTO_GRADED";

  await run(
    "UPDATE exam_attempts SET score_raw=?, score_total=?, score_pct=?, grading_status=?, updated_at=? WHERE id=?",
    [totalAwarded, totalPossible, Math.round(pct * 100) / 100, gradingStatus, now, attemptId]
  );

  redirect(`/exam-builder?exam_id=${examId}&tab=results`);
}

const qTypeLabel = (t: string) => {
  if (t === "MCQ") return "Multiple Choice";
  if (t === "MULTIPLE_SELECT") return "Multiple Select";
  if (t === "TRUE_FALSE") return "True / False";
  if (t === "SHORT_ANSWER") return "Short Answer";
  if (t === "ESSAY") return "Essay";
  return t;
};

export default async function ExamGradePage({
  searchParams,
}: {
  searchParams: Promise<{ attempt_id?: string; exam_id?: string }>;
}) {
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active) redirect("/");

  const params = await searchParams;
  let attemptId = params.attempt_id;
  let examId = params.exam_id;
  if (!attemptId) redirect("/teacher");

  const { first, all } = getDb();

  // Resolve exam_id from attempt if not provided.
  if (!examId && attemptId) {
    const att = await first<{ exam_id: string }>("SELECT exam_id FROM exam_attempts WHERE id=? AND tenant_id=?", [attemptId, active.tenant_id]);
    if (att) examId = att.exam_id;
  }
  if (!examId) redirect("/teacher");

  const exam = await first<{ id: string; title: string; course_id: string }>(
    "SELECT id, title, course_id FROM exams WHERE id=? AND tenant_id=?", [examId, active.tenant_id]
  );
  if (!exam) redirect("/teacher");

  const attempt = await first<{
    id: string; user_id: string; student_name: string; attempt_no: number;
    grading_status: string; score_raw: number | null; score_total: number | null; score_pct: number | null;
  }>(
    `SELECT ea.id, ea.user_id, u.name AS student_name, ea.attempt_no,
       ea.grading_status, ea.score_raw, ea.score_total, ea.score_pct
     FROM exam_attempts ea JOIN users u ON u.id = ea.user_id
     WHERE ea.id=? AND ea.exam_id=? AND ea.tenant_id=? AND ea.status='SUBMITTED'`,
    [attemptId, examId, active.tenant_id]
  );
  if (!attempt) redirect(`/exam-builder?exam_id=${examId}&tab=results`);

  // Load questions + options + student answers.
  const questions = await all<{
    id: string; question_type: string; question_text: string; marks: number; sort_order: number;
    model_answer: string | null;
  }>(
    "SELECT id, question_type, question_text, marks, sort_order, model_answer FROM exam_questions WHERE exam_id=? ORDER BY sort_order ASC",
    [examId]
  );

  const options = questions.length > 0 ? await all<{
    question_id: string; option_text: string; is_correct: number;
  }>(
    `SELECT question_id, option_text, is_correct FROM exam_question_options
     WHERE question_id IN (${questions.map(() => "?").join(",")}) ORDER BY sort_order ASC`,
    questions.map((q) => q.id)
  ) : [];

  const answers = await all<{
    question_id: string; answer_text: string | null; selected_option_ids: string | null;
    score_awarded: number | null; is_correct: number | null; teacher_note: string | null;
  }>(
    "SELECT question_id, answer_text, selected_option_ids, score_awarded, is_correct, teacher_note FROM exam_answers WHERE attempt_id=?",
    [attemptId]
  );

  const optsByQ: Record<string, typeof options> = {};
  for (const o of options) {
    if (!optsByQ[o.question_id]) optsByQ[o.question_id] = [];
    optsByQ[o.question_id].push(o);
  }
  const answerByQ: Record<string, typeof answers[0]> = {};
  for (const a of answers) answerByQ[a.question_id] = a;

  const needsManualGrading = attempt.grading_status === "AUTO_GRADED";

  return (
    <main className="max-w-4xl mx-auto p-4">
      <Card>
        <a href={`/exam-builder?exam_id=${examId}&tab=results`} className="text-sm text-gray-400 hover:underline">← Back to Results</a>
        <h1 className="text-lg font-bold mt-2">{exam.title}</h1>
        <div className="text-sm text-gray-500">
          Student: <strong>{attempt.student_name}</strong> · Attempt {attempt.attempt_no}
        </div>
        {attempt.score_pct !== null && (
          <div className="text-sm text-gray-500 mt-1">
            Score: {attempt.score_raw}/{attempt.score_total} ({Math.round(Number(attempt.score_pct))}%)
          </div>
        )}
      </Card>

      <form action={gradeAction}>
        <input type="hidden" name="attempt_id" value={attemptId} />
        <input type="hidden" name="exam_id" value={examId} />

        {questions.map((q, i) => {
          const opts = optsByQ[q.id] || [];
          const ans = answerByQ[q.id];
          const isManual = q.question_type === "SHORT_ANSWER" || q.question_type === "ESSAY";
          const selectedIds = ans?.selected_option_ids ? ans.selected_option_ids.split(",") : [];

          return (
            <Card key={q.id}>
              <div className="flex gap-3 items-start">
                <div className="min-w-[28px] text-center">
                  <div className="font-bold text-teal-700">{i + 1}</div>
                  <div className="text-xs text-gray-400">{q.marks}m</div>
                </div>
                <div className="flex-1">
                  <div className="flex gap-2 items-center mb-1">
                    <span className="inline-block px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-[11px] font-semibold">
                      {qTypeLabel(q.question_type)}
                    </span>
                    {ans?.score_awarded !== null && ans?.score_awarded !== undefined && (
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        Number(ans.score_awarded) >= Number(q.marks) ? "bg-green-50 text-green-700"
                        : Number(ans.score_awarded) > 0 ? "bg-amber-50 text-amber-700"
                        : "bg-red-50 text-red-700"
                      }`}>
                        {ans.score_awarded}/{q.marks}
                      </span>
                    )}
                  </div>

                  <div className="text-sm mb-3">{q.question_text}</div>

                  {/* MCQ / Multiple Select / True-False — show options with correct/selected highlighting */}
                  {opts.length > 0 && (
                    <div className="space-y-1 mb-3">
                      {opts.map((o, j) => {
                        const wasSelected = selectedIds.includes(String(j)) || selectedIds.includes(o.option_text);
                        const isCorrect = o.is_correct === 1;
                        let bg = "bg-gray-50";
                        if (wasSelected && isCorrect) bg = "bg-green-50 border-green-200";
                        else if (wasSelected && !isCorrect) bg = "bg-red-50 border-red-200";
                        else if (isCorrect) bg = "bg-green-50/50";

                        return (
                          <div key={j} className={`px-3 py-2 rounded-lg text-sm border ${bg}`}>
                            {wasSelected && <span className="font-semibold mr-1">●</span>}
                            {o.option_text}
                            {isCorrect && <span className="text-green-600 ml-2 text-xs font-semibold">✓ Correct</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Short answer / Essay — show student's text answer */}
                  {isManual && (
                    <div className="mb-3">
                      <div className="text-xs text-gray-500 mb-1">Student&apos;s answer:</div>
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm whitespace-pre-wrap">
                        {ans?.answer_text || <span className="text-gray-400 italic">No answer provided</span>}
                      </div>
                      {q.model_answer && (
                        <div className="mt-2">
                          <div className="text-xs text-gray-500 mb-1">Model answer:</div>
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm whitespace-pre-wrap">
                            {q.model_answer}
                          </div>
                        </div>
                      )}

                      {/* Grading inputs */}
                      {needsManualGrading && (
                        <div className="grid grid-cols-2 gap-3 mt-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Score (max {q.marks})</label>
                            <input
                              name={`score_${q.id}`}
                              type="number"
                              min="0"
                              max={q.marks}
                              step="0.5"
                              defaultValue={ans?.score_awarded ?? ""}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Note (optional)</label>
                            <input
                              name={`note_${q.id}`}
                              defaultValue={ans?.teacher_note || ""}
                              placeholder="Feedback"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            />
                          </div>
                        </div>
                      )}

                      {/* Show existing note if already graded */}
                      {!needsManualGrading && ans?.teacher_note && (
                        <div className="mt-2 text-xs text-gray-500">
                          Teacher note: <span className="text-gray-700">{ans.teacher_note}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}

        {needsManualGrading && (
          <div className="sticky bottom-0 bg-white border-t border-gray-200 p-3 rounded-b-xl">
            <button type="submit" className="px-6 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
              Save Grades
            </button>
          </div>
        )}
      </form>
    </main>
  );
}
