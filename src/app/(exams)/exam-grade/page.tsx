// src/app/exam-grade/page.tsx
// Grading page — three modes:
//   1. GRADE MODE — teacher scores manual questions (AUTO_GRADED attempts)
//   2. VIEW MODE — read-only view of fully graded attempt
//   3. APPROVER MODE — grading gate approver reviews + approves/rejects
//
// Two-column layout on desktop: questions left, sticky sidebar right.
// Mobile: single column with floating grade-count button + drawer.

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership, fmtISO } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { GradingEngine } from "@/components/exam/GradingEngine";

// ============================================================
// Server Actions
// ============================================================

async function gradeAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || (active.role !== "TEACHER" && active.role !== "SCHOOL_ADMIN")) redirect("/");

  const attemptId = formData.get("attempt_id") as string;
  const examId = formData.get("exam_id") as string;
  if (!attemptId || !examId) redirect("/teacher");

  const { all, first, run } = getDb();
  const now = new Date().toISOString();

  // 1. Get manual questions (SHORT_ANSWER, ESSAY).
  const manualQs = await all<{ id: string; marks: number }>(
    "SELECT id, marks FROM exam_questions WHERE exam_id=? AND (question_type='SHORT_ANSWER' OR question_type='ESSAY')",
    [examId]
  );

  // 2. For each, read score and note from form, update exam_answers.
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

  // 3. recalcAttempt — inline implementation
  const attempt = await first<{ id: string; grade_bands_json: string | null }>(
    `SELECT id, grade_bands_json FROM exam_attempts WHERE id=? AND tenant_id=?`,
    [attemptId, active.tenant_id]
  );
  if (!attempt) redirect(`/exam-builder?exam_id=${examId}&tab=results`);

  const rows = await all<{ score_awarded: number | null; marks: number; question_type: string }>(
    `SELECT a.score_awarded, q.marks, q.question_type
     FROM exam_answers a
     JOIN exam_questions q ON q.id = a.question_id
     WHERE a.attempt_id=?`,
    [attemptId]
  );

  const scoreTotal = rows.reduce((sum, r) => sum + Number(r.marks || 0), 0);
  const scoreRaw = rows.reduce((sum, r) =>
    sum + (r.score_awarded !== null && r.score_awarded !== undefined ? Number(r.score_awarded) : 0), 0);
  const scorePct = scoreTotal > 0 ? Math.round((scoreRaw / scoreTotal) * 10000) / 100 : 0;

  let grade: string | null = null;
  try {
    const bands = JSON.parse(attempt.grade_bands_json || "[]") as { label: string; min_percent: number }[];
    for (const band of bands) {
      if (scorePct >= Number(band.min_percent)) { grade = band.label; break; }
    }
  } catch { /* ignore */ }

  const needsManual = rows.some(
    (r) => (r.question_type === "SHORT_ANSWER" || r.question_type === "ESSAY") && r.score_awarded === null
  );
  const gradingStatus = needsManual ? "AUTO_GRADED" : "FULLY_GRADED";

  await run(
    `UPDATE exam_attempts SET score_raw=?, score_total=?, score_pct=?, grade=?, grading_status=?, updated_at=? WHERE id=? AND tenant_id=?`,
    [scoreRaw, scoreTotal, scorePct, grade, gradingStatus, now, attemptId, active.tenant_id]
  );

  redirect(`/exam-builder?exam_id=${examId}&tab=results&toast=Grades+saved`);
}

async function gradingReviewRespondAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || (active.role !== "TEACHER" && active.role !== "SCHOOL_ADMIN")) redirect("/");

  const attemptId = formData.get("attempt_id") as string;
  const examId = formData.get("exam_id") as string;
  const response = formData.get("response") as string; // 'APPROVED' or 'REJECTED'
  const note = (formData.get("note") as string || "").trim() || null;
  if (!attemptId || !examId || !response) redirect("/teacher");

  const { all, first, run } = getDb();
  const now = new Date().toISOString();

  // Verify user has a PENDING response for this exam/gate.
  const pendingResp = await first<{ id: string }>(
    `SELECT id FROM sitting_approval_responses
     WHERE exam_id=? AND gate_type='GRADING' AND approver_id=? AND status='PENDING' AND tenant_id=?`,
    [examId, auth.user!.id, active.tenant_id]
  );
  if (!pendingResp) redirect("/approvals");

  // Save per-question comments.
  const allQuestions = await all<{ id: string }>(
    "SELECT id FROM exam_questions WHERE exam_id=? AND tenant_id=?",
    [examId, active.tenant_id]
  );
  const validQuestionIds = new Set(allQuestions.map((q) => q.id));

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("comment_")) continue;
    const questionId = key.slice("comment_".length);
    const commentText = (value as string || "").trim();
    if (!commentText || !validQuestionIds.has(questionId)) continue;

    const existing = await first<{ id: string }>(
      `SELECT id FROM sitting_approval_comments
       WHERE exam_id=? AND gate_type='GRADING' AND question_id=? AND approver_id=? AND attempt_id=? AND tenant_id=?`,
      [examId, questionId, auth.user!.id, attemptId, active.tenant_id]
    );

    if (existing) {
      await run(
        "UPDATE sitting_approval_comments SET comment=?, updated_at=? WHERE id=?",
        [commentText, now, existing.id]
      );
    } else {
      await run(
        `INSERT INTO sitting_approval_comments (id, exam_id, gate_type, question_id, approver_id, tenant_id, comment, attempt_id, created_at, updated_at)
         VALUES (?,?,'GRADING',?,?,?,?,?,?,?)`,
        [crypto.randomUUID(), examId, questionId, auth.user!.id, active.tenant_id, commentText, attemptId, now, now]
      );
    }
  }

  // Update the gate response.
  await run(
    "UPDATE sitting_approval_responses SET status=?, note=?, updated_at=? WHERE id=?",
    [response, note, now, pendingResp.id]
  );

  if (response === "APPROVED") {
    redirect("/approvals?toast=Approved");
  } else {
    redirect("/approvals?toast=Rejected&toast_type=error");
  }
}

// ============================================================
// Page Component
// ============================================================

export default async function ExamGradePage({
  searchParams,
}: {
  searchParams: Promise<{ attempt_id?: string; exam_id?: string; view?: string }>;
}) {
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || (active.role !== "TEACHER" && active.role !== "SCHOOL_ADMIN")) redirect("/teacher");

  const params = await searchParams;
  let attemptId = params.attempt_id;
  let examId = params.exam_id;
  const viewOnly = params.view === "1";
  if (!attemptId) redirect("/teacher");

  const { first, all } = getDb();
  const tid = active.tenant_id;

  // Resolve exam_id from attempt if not provided.
  if (!examId && attemptId) {
    const att = await first<{ exam_id: string }>("SELECT exam_id FROM exam_attempts WHERE id=? AND tenant_id=?", [attemptId, tid]);
    if (att) examId = att.exam_id;
  }
  if (!examId) redirect("/teacher");

  // Fetch exam.
  const exam = await first<{ id: string; title: string; course_id: string }>(
    "SELECT id, title, course_id FROM exams WHERE id=? AND tenant_id=?", [examId, tid]
  );
  if (!exam) redirect("/teacher");

  // Fetch attempt with student name.
  const attempt = await first<{
    id: string; user_id: string; student_name: string; attempt_no: number;
    grading_status: string; score_raw: number | null; score_total: number | null;
    score_pct: number | null; grade: string | null; pass_mark_percent: number | null;
    submitted_at: string | null; grade_bands_json: string | null;
  }>(
    `SELECT ea.id, ea.user_id, u.name AS student_name, ea.attempt_no,
       ea.grading_status, ea.score_raw, ea.score_total, ea.score_pct,
       ea.grade, ea.pass_mark_percent, ea.submitted_at, ea.grade_bands_json
     FROM exam_attempts ea
     JOIN qa_users u ON u.id = ea.user_id
     WHERE ea.id=? AND ea.exam_id=? AND ea.tenant_id=? AND ea.status='SUBMITTED'`,
    [attemptId, examId, tid]
  );
  if (!attempt) redirect(`/exam-builder?exam_id=${examId}&tab=results`);

  // Fetch questions in teacher sort order.
  const questions = await all<{
    id: string; question_type: string; question_text: string; marks: number;
    model_answer: string | null; feedback: string | null; sort_order: number;
  }>(
    "SELECT id, question_type, question_text, marks, model_answer, feedback, sort_order FROM exam_questions WHERE exam_id=? AND tenant_id=? ORDER BY sort_order ASC",
    [examId, tid]
  );

  // Fetch options for choice-type questions.
  const optionTypeQs = questions.filter((q) => ["MCQ", "TRUE_FALSE", "MULTIPLE_SELECT"].includes(q.question_type));
  const allOptions = optionTypeQs.length > 0
    ? await all<{ id: string; question_id: string; option_text: string; is_correct: number; sort_order: number }>(
        `SELECT id, question_id, option_text, is_correct, sort_order
         FROM exam_question_options
         WHERE question_id IN (${optionTypeQs.map(() => "?").join(",")})
         ORDER BY sort_order ASC`,
        optionTypeQs.map((q) => q.id)
      )
    : [];

  // Fetch answers for this attempt.
  const answers = await all<{
    question_id: string; answer_json: string | null;
    score_awarded: number | null; teacher_note: string | null;
  }>(
    "SELECT question_id, answer_json, score_awarded, teacher_note FROM exam_answers WHERE attempt_id=?",
    [attemptId]
  );

  // Index options and answers by question.
  const optsByQ: Record<string, typeof allOptions> = {};
  for (const o of allOptions) {
    if (!optsByQ[o.question_id]) optsByQ[o.question_id] = [];
    optsByQ[o.question_id].push(o);
  }
  const answerByQ: Record<string, (typeof answers)[0]> = {};
  for (const a of answers) answerByQ[a.question_id] = a;

  // ---------- Approver mode detection ----------
  let isGradingApprover = false;
  let gateDecision: { status: string; note: string | null; approver_name: string } | null = null;
  let myGradingComments: Record<string, string> = {};
  let otherApproverComments: { question_id: string; comment: string; approver_name: string }[] = [];

  if (viewOnly) {
    // Check if current user is a GRADING gate approver with PENDING response.
    const pendingGate = await first<{ id: string }>(
      `SELECT sar.id
       FROM sitting_approval_gates sag
       JOIN sitting_approval_responses sar
         ON sar.exam_id=sag.exam_id AND sar.gate_type=sag.gate_type
        AND sar.approver_id=sag.user_id AND sar.tenant_id=sag.tenant_id
       WHERE sag.exam_id=? AND sag.gate_type='GRADING' AND sag.user_id=? AND sag.tenant_id=? AND sar.status='PENDING'
       LIMIT 1`,
      [examId, auth.user!.id, tid]
    );
    if (pendingGate) isGradingApprover = true;

    // Gate decision banner data (only when NOT approver).
    if (!isGradingApprover) {
      gateDecision = await first<{ status: string; note: string | null; approver_name: string }>(
        `SELECT sar.status, sar.note, u.name AS approver_name
         FROM sitting_approval_responses sar
         JOIN qa_users u ON u.id = sar.approver_id
         WHERE sar.exam_id=? AND sar.gate_type='GRADING' AND sar.tenant_id=?
         AND sar.status IN ('APPROVED','REJECTED')
         LIMIT 1`,
        [examId, tid]
      );
    }

    // Own comments (approver mode).
    if (isGradingApprover) {
      const myComments = await all<{ question_id: string; comment: string }>(
        `SELECT question_id, comment FROM sitting_approval_comments
         WHERE exam_id=? AND gate_type='GRADING' AND approver_id=? AND attempt_id=? AND tenant_id=?`,
        [examId, auth.user!.id, attemptId, tid]
      );
      for (const c of myComments) myGradingComments[c.question_id] = c.comment;
    }

    // Other approvers' comments (all view modes).
    otherApproverComments = await all<{ question_id: string; comment: string; approver_name: string }>(
      `SELECT sac.question_id, sac.comment, u.name AS approver_name
       FROM sitting_approval_comments sac
       JOIN qa_users u ON u.id = sac.approver_id
       WHERE sac.exam_id=? AND sac.gate_type='GRADING' AND sac.attempt_id=? AND sac.tenant_id=?
       ORDER BY sac.created_at ASC`,
      [examId, attemptId, tid]
    );
  }

  // ---------- Derived state ----------
  const needsManualGrading = !viewOnly && attempt.grading_status === "AUTO_GRADED";

  const scoreTotalVal = questions.reduce((s, q) => s + Number(q.marks), 0);

  // Index other approver comments by question.
  const otherCommentsByQ: Record<string, { comment: string; approver_name: string }[]> = {};
  for (const c of otherApproverComments) {
    if (!otherCommentsByQ[c.question_id]) otherCommentsByQ[c.question_id] = [];
    if (isGradingApprover && myGradingComments[c.question_id] === c.comment) continue;
    otherCommentsByQ[c.question_id].push(c);
  }

  // Compute baseScore: sum of scores from auto-graded (non-manual) questions only.
  // Manual question scores will be tracked live inside GradingEngine.
  let baseScore = 0;
  for (const a of answers) {
    const q = questions.find((qq) => qq.id === a.question_id);
    if (!q) continue;
    const isManual = q.question_type === "SHORT_ANSWER" || q.question_type === "ESSAY";
    if (!isManual && a.score_awarded !== null && a.score_awarded !== undefined) {
      baseScore += Number(a.score_awarded);
    }
  }

  // Build initialUngradedIds: manual question IDs that have no score yet.
  const initialUngradedIds = questions
    .filter((q) => {
      if (q.question_type !== "SHORT_ANSWER" && q.question_type !== "ESSAY") return false;
      const ans = answerByQ[q.id];
      return ans?.score_awarded === null || ans?.score_awarded === undefined;
    })
    .map((q) => q.id);

  // Build question data array for the client component.
  const questionData = questions.map((q) => ({
    id: q.id,
    question_type: q.question_type,
    question_text: q.question_text,
    marks: Number(q.marks),
    model_answer: q.model_answer,
    feedback: q.feedback,
    sort_order: q.sort_order,
    options: (optsByQ[q.id] || []).map((o) => ({
      id: o.id,
      question_id: o.question_id,
      option_text: o.option_text,
      is_correct: o.is_correct,
      sort_order: o.sort_order,
    })),
    answer: answerByQ[q.id]
      ? {
          question_id: answerByQ[q.id].question_id,
          answer_json: answerByQ[q.id].answer_json,
          score_awarded: answerByQ[q.id].score_awarded,
          teacher_note: answerByQ[q.id].teacher_note,
        }
      : null,
    otherComments: otherCommentsByQ[q.id] || [],
    myComment: myGradingComments[q.id] || "",
  }));

  // ---------- Page title ----------
  const pageTitle = isGradingApprover
    ? "Review Grading"
    : viewOnly
      ? "View Submission"
      : "Grade Submission";

  const backHref = isGradingApprover
    ? "/approvals"
    : `/exam-builder?exam_id=${examId}&tab=results`;
  const backLabel = isGradingApprover ? "← Approval Inbox" : "← Back to Results";

  // ---------- Determine mode for the client component ----------
  const engineMode: "grade" | "view" | "approver" = isGradingApprover
    ? "approver"
    : needsManualGrading
      ? "grade"
      : "view";

  // ---------- Pre-render banners as server JSX ----------
  const gateDecisionBanner =
    viewOnly && !isGradingApprover && gateDecision ? (
      <div
        className={`rounded-xl p-3 mb-3 text-sm ${
          gateDecision.status === "APPROVED"
            ? "bg-green-50 border border-green-200 text-green-700"
            : "bg-red-50 border border-red-200 text-red-700"
        }`}
      >
        {gateDecision.status === "APPROVED" ? "✅" : "❌"} Grading Gate{" "}
        {gateDecision.status === "APPROVED" ? "Approved" : "Rejected"} by{" "}
        {gateDecision.approver_name}
        {gateDecision.note && (
          <div className="mt-1 text-xs opacity-80">{gateDecision.note}</div>
        )}
      </div>
    ) : null;

  const approverBanner = isGradingApprover ? (
    <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 mb-3 text-sm text-amber-800">
      You are reviewing this submission for the Grading Gate. Add comments per
      question below, then approve or reject at the bottom.
    </div>
  ) : null;

  const viewOnlyBanner =
    viewOnly && !isGradingApprover ? (
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-3 text-sm text-blue-700">
        This attempt is fully graded — view only
      </div>
    ) : null;

  // Shared GradingEngine element
  const gradingEngine = (
    <GradingEngine
      attemptId={attemptId!}
      examId={examId!}
      mode={engineMode}
      questions={questionData}
      baseScore={baseScore}
      scoreTotal={scoreTotalVal}
      initialUngradedIds={initialUngradedIds}
      attempt={{
        score_raw: attempt.score_raw,
        score_total: attempt.score_total,
        score_pct: attempt.score_pct,
        grade: attempt.grade,
        pass_mark_percent: attempt.pass_mark_percent,
      }}
      gateDecisionBanner={gateDecisionBanner}
      approverBanner={approverBanner}
      viewOnlyBanner={viewOnlyBanner}
    />
  );

  // ============================================================
  // Render
  // ============================================================

  return (
    <main className="max-w-6xl mx-auto p-4">
      {/* Header card */}
      <Card>
        <a href={backHref} className="text-sm text-gray-400 hover:underline">
          {backLabel}
        </a>
        <h1 className="text-lg font-bold mt-2">{pageTitle}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{exam.title}</p>
        <div className="text-xs text-gray-400 mt-1">
          Student:{" "}
          <strong className="text-gray-600">{attempt.student_name}</strong>
          {" · "}Attempt {attempt.attempt_no}
          {attempt.submitted_at && (
            <>
              {" · "}Submitted {fmtISO(attempt.submitted_at)}
            </>
          )}
        </div>
      </Card>

      {needsManualGrading ? (
        // Grade mode — wrap GradingEngine in form so submit buttons work.
        <form action={gradeAction}>
          <input type="hidden" name="attempt_id" value={attemptId} />
          <input type="hidden" name="exam_id" value={examId} />
          {gradingEngine}
        </form>
      ) : isGradingApprover ? (
        // Approver mode — wrap in form for comments + approve/reject.
        <form action={gradingReviewRespondAction}>
          <input type="hidden" name="attempt_id" value={attemptId} />
          <input type="hidden" name="exam_id" value={examId} />
          <input type="hidden" name="gate_type" value="GRADING" />
          {gradingEngine}

          {/* Approver decision card */}
          <Card>
            <h3 className="font-bold text-sm mb-3">Grading Gate Decision</h3>
            <label className="block text-xs text-gray-500 mb-1">
              Overall note (optional)
            </label>
            <textarea
              name="note"
              rows={3}
              placeholder="Add an overall note…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3"
            />
            <div className="flex gap-3">
              <button
                type="submit"
                name="response"
                value="APPROVED"
                className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700"
              >
                ✅ Approve
              </button>
              <button
                type="submit"
                name="response"
                value="REJECTED"
                className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700"
              >
                ❌ Reject
              </button>
            </div>
          </Card>
        </form>
      ) : (
        // View mode — no form wrapper.
        gradingEngine
      )}
    </main>
  );
}
