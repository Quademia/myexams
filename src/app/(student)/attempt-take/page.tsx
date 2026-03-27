// src/app/attempt-take/page.tsx
// Server component — loads attempt data and passes it to the ExamEngine client component.

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ExamEngine } from "@/components/exam/ExamEngine";

// ── Types ───────────────────────────────────────────────────────────────

interface AttemptRow {
  id: string;
  tenant_id: string;
  exam_id: string;
  user_id: string;
  status: string;
  started_at: string;
  effective_duration_secs: number;
  question_order_json: string;
}

interface ExamRow {
  id: string;
  title: string;
  duration_mins: number;
  ends_at: string | null;
  navigation_mode: string;
  show_marks_during: number;
  shuffle_options: number;
}

interface QuestionRow {
  id: string;
  question_type: string;
  question_text: string;
  marks: number;
  sort_order: number;
}

interface OptionRow {
  id: string;
  question_id: string;
  option_text: string;
  sort_order: number;
}

interface AnswerRow {
  question_id: string;
  answer_json: string | null;
  is_flagged: number;
}

// ── Auto-submit helper ──────────────────────────────────────────────────

async function doServerAutoSubmit(
  attemptId: string,
  startedAt: string,
  examId: string,
  tenantId: string
) {
  const { run, first } = getDb();
  const ts = new Date().toISOString();
  const timeTakenSecs = Math.round((Date.parse(ts) - Date.parse(startedAt)) / 1000);
  const ex = await first<{ ends_at: string | null }>(
    `SELECT ends_at FROM exams WHERE id=?`,
    [examId]
  );
  const isLate = ex?.ends_at && Date.parse(ts) > Date.parse(ex.ends_at) ? 1 : 0;
  await run(
    `UPDATE exam_attempts SET status='SUBMITTED', submitted_at=?, time_taken_secs=?, auto_submitted=1, is_late=?, updated_at=? WHERE id=? AND tenant_id=?`,
    [ts, timeTakenSecs, isLate, ts, attemptId, tenantId]
  );
}

// ── Page component ──────────────────────────────────────────────────────

export default async function AttemptTakePage({
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
    `SELECT * FROM exam_attempts WHERE id=? AND user_id=? AND tenant_id=?`,
    [attemptId, userId, tid]
  );
  if (!attempt) redirect("/student");
  if (attempt.status !== "IN_PROGRESS") {
    redirect(`/attempt-complete?attempt_id=${attemptId}`);
  }

  // Load exam
  const exam = await first<ExamRow>(
    `SELECT * FROM exams WHERE id=? AND tenant_id=?`,
    [attempt.exam_id, tid]
  );
  if (!exam) redirect("/student");

  // Server-side expiry checks
  if (exam.ends_at && Date.now() > Date.parse(exam.ends_at)) {
    await doServerAutoSubmit(attemptId, attempt.started_at, attempt.exam_id, tid);
    redirect(`/attempt-complete?attempt_id=${attemptId}`);
  }

  const deadlineMs =
    Date.parse(attempt.started_at) + attempt.effective_duration_secs * 1000;
  if (Date.now() >= deadlineMs) {
    await doServerAutoSubmit(attemptId, attempt.started_at, attempt.exam_id, tid);
    redirect(`/attempt-complete?attempt_id=${attemptId}`);
  }

  // Load questions in snapshot order
  const questionOrder: string[] = JSON.parse(attempt.question_order_json || "[]");
  const allQs = await all<QuestionRow>(
    `SELECT * FROM exam_questions WHERE exam_id=? AND tenant_id=?`,
    [attempt.exam_id, tid]
  );
  const qMap = Object.fromEntries(allQs.map((q) => [q.id, q]));
  const questions = questionOrder.map((id) => qMap[id]).filter(Boolean);
  if (questions.length === 0) redirect("/student");

  // Load options (never expose is_correct to client)
  const qIds = questions.map((q) => q.id);
  const allOpts = await all<OptionRow>(
    `SELECT id, question_id, option_text, sort_order FROM exam_question_options WHERE question_id IN (${qIds.map(() => "?").join(",")}) ORDER BY sort_order ASC`,
    qIds
  );
  const optsByQ: Record<string, OptionRow[]> = {};
  for (const o of allOpts) {
    if (!optsByQ[o.question_id]) optsByQ[o.question_id] = [];
    optsByQ[o.question_id].push(o);
  }

  // Load saved answers
  const savedRows = await all<AnswerRow>(
    `SELECT question_id, answer_json, is_flagged FROM exam_answers WHERE attempt_id=?`,
    [attemptId]
  );
  const answerMap: Record<string, AnswerRow> = {};
  for (const r of savedRows) {
    answerMap[r.question_id] = r;
  }

  // Calculate time remaining
  const timeRemainingSecs = Math.max(
    0,
    Math.ceil((deadlineMs - Date.now()) / 1000)
  );

  // Duration warning
  const fullDurationSecs = (exam.duration_mins || 60) * 60;
  const showDurationWarning = attempt.effective_duration_secs < fullDurationSecs;
  const warningMins = Math.ceil(attempt.effective_duration_secs / 60);

  // Build serialisable props
  const examData = {
    attemptId: attempt.id,
    examTitle: exam.title,
    navigationMode: (exam.navigation_mode || "FREE").toUpperCase() as
      | "FREE"
      | "SEQUENTIAL",
    showMarksDuring: exam.show_marks_during === 1,
    timeRemainingSecs,
    showDurationWarning,
    warningMins,
    questions: questions.map((q) => ({
      id: q.id,
      question_type: q.question_type,
      question_text: q.question_text,
      marks: Number(q.marks),
      options: (optsByQ[q.id] || []).map((o) => ({
        id: o.id,
        option_text: o.option_text,
      })),
    })),
    savedAnswers: Object.fromEntries(
      questions.map((q) => {
        const ans = answerMap[q.id];
        let parsed: string | string[] | null = null;
        try {
          if (ans?.answer_json) parsed = JSON.parse(ans.answer_json);
        } catch {
          /* ignore */
        }
        return [q.id, parsed];
      })
    ),
    savedFlags: Object.fromEntries(
      questions.map((q) => {
        const ans = answerMap[q.id];
        return [q.id, ans ? Number(ans.is_flagged) === 1 : false];
      })
    ),
  };

  return <ExamEngine {...examData} />;
}
