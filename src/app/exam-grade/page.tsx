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
import { Card } from "@/components/Card";
import { MobileGradingDrawer } from "@/components/MobileGradingDrawer";

// ============================================================
// Question type label helper
// ============================================================

const qTypeLabel = (t: string) => {
  if (t === "MCQ") return "Multiple Choice";
  if (t === "MULTIPLE_SELECT") return "Multiple Select";
  if (t === "TRUE_FALSE") return "True / False";
  if (t === "SHORT_ANSWER") return "Short Answer";
  if (t === "ESSAY") return "Essay";
  return t;
};

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

  redirect(`/exam-builder?exam_id=${examId}&tab=results`);
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

  redirect("/approvals");
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
     JOIN users u ON u.id = ea.user_id
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
         JOIN users u ON u.id = sar.approver_id
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
       JOIN users u ON u.id = sac.approver_id
       WHERE sac.exam_id=? AND sac.gate_type='GRADING' AND sac.attempt_id=? AND sac.tenant_id=?
       ORDER BY sac.created_at ASC`,
      [examId, attemptId, tid]
    );
  }

  // ---------- Derived state ----------
  const needsManualGrading = !viewOnly && attempt.grading_status === "AUTO_GRADED";

  // Build ungraded questions list for sidebar + mobile drawer.
  const manualQuestions = questions
    .map((q, i) => ({ ...q, number: i + 1 }))
    .filter((q) => q.question_type === "SHORT_ANSWER" || q.question_type === "ESSAY");

  const ungradedManual = manualQuestions.filter((q) => {
    const ans = answerByQ[q.id];
    return ans?.score_awarded === null || ans?.score_awarded === undefined;
  });

  // Score so far.
  const scoreSoFar = answers.reduce((s, a) => s + Number(a.score_awarded ?? 0), 0);
  const scoreTotal = questions.reduce((s, q) => s + Number(q.marks), 0);

  // Index other approver comments by question.
  const otherCommentsByQ: Record<string, { comment: string; approver_name: string }[]> = {};
  for (const c of otherApproverComments) {
    if (!otherCommentsByQ[c.question_id]) otherCommentsByQ[c.question_id] = [];
    // Skip own comments in "other" list when in approver mode.
    if (isGradingApprover && myGradingComments[c.question_id] === c.comment) continue;
    otherCommentsByQ[c.question_id].push(c);
  }

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

  // ============================================================
  // JSX — Question card renderer (used inside and outside form)
  // ============================================================

  const questionCards = questions.map((q, i) => {
    const opts = optsByQ[q.id] || [];
    const ans = answerByQ[q.id];
    const isManual = q.question_type === "SHORT_ANSWER" || q.question_type === "ESSAY";
    const isAlreadyGraded = ans?.score_awarded !== null && ans?.score_awarded !== undefined;

    // Parse answer_json for selected option IDs.
    let selectedIds: Set<string> = new Set();
    if (ans?.answer_json) {
      try {
        const parsed = JSON.parse(ans.answer_json);
        if (Array.isArray(parsed)) {
          selectedIds = new Set(parsed.map(String));
        } else if (parsed !== null && parsed !== undefined) {
          selectedIds = new Set([String(parsed)]);
        }
      } catch { /* ignore */ }
    }

    // Student's text answer (for SHORT_ANSWER/ESSAY).
    let studentTextAnswer = "";
    if (isManual && ans?.answer_json) {
      try {
        studentTextAnswer = typeof ans.answer_json === "string" ? ans.answer_json : "";
        // If it's a JSON string (quoted), try to parse it.
        const parsed = JSON.parse(ans.answer_json);
        if (typeof parsed === "string") studentTextAnswer = parsed;
      } catch {
        studentTextAnswer = ans.answer_json || "";
      }
    }

    const otherComments = otherCommentsByQ[q.id] || [];

    return (
      <div key={q.id} id={`q-${q.id}`}>
        <Card>
          <div className="flex gap-3 items-start">
            {/* Question number badge */}
            <div className="min-w-[32px] h-8 flex items-center justify-center rounded-full bg-teal-700 text-white text-sm font-bold flex-shrink-0">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              {/* Header row: type badge + marks */}
              <div className="flex gap-2 items-center mb-1 flex-wrap">
                <span className="inline-block px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-[11px] font-semibold">
                  {qTypeLabel(q.question_type)}
                </span>
                {isAlreadyGraded ? (
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                    Number(ans!.score_awarded) >= Number(q.marks) ? "bg-green-50 text-green-700"
                    : Number(ans!.score_awarded) > 0 ? "bg-amber-50 text-amber-700"
                    : "bg-red-50 text-red-700"
                  }`}>
                    {ans!.score_awarded}/{q.marks}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400 ml-auto">{q.marks} mark{Number(q.marks) !== 1 ? "s" : ""}</span>
                )}
              </div>

              {/* Question text */}
              <div className="text-sm mb-3 whitespace-pre-wrap">{q.question_text}</div>

              {/* MCQ / TRUE_FALSE / MULTIPLE_SELECT — option list */}
              {opts.length > 0 && (
                <div className="space-y-1 mb-3">
                  {opts.map((o) => {
                    const wasSelected = selectedIds.has(String(o.id));
                    const isCorrect = o.is_correct === 1;
                    const isMultipleSelect = q.question_type === "MULTIPLE_SELECT";

                    let bg = "bg-gray-50 border-gray-200";
                    let icon = "";
                    if (wasSelected && isCorrect) {
                      bg = "bg-green-50 border-green-200";
                      icon = "✓";
                    } else if (wasSelected && !isCorrect) {
                      bg = "bg-red-50 border-red-200";
                      icon = "✗";
                    } else if (isCorrect && isMultipleSelect) {
                      // Correct option student missed (MULTIPLE_SELECT only).
                      bg = "bg-amber-50 border-amber-200";
                      icon = "✓";
                    } else if (isCorrect) {
                      bg = "bg-green-50/50 border-green-100";
                      icon = "✓";
                    }

                    return (
                      <div key={o.id} className={`px-3 py-2 rounded-lg text-sm border ${bg} flex items-center gap-2`}>
                        {icon && (
                          <span className={`text-xs font-bold ${
                            icon === "✓" ? "text-green-600" : "text-red-600"
                          }`}>{icon}</span>
                        )}
                        <span>{o.option_text}</span>
                        {wasSelected && <span className="font-semibold text-xs text-gray-500 ml-1">● selected</span>}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* SHORT_ANSWER / ESSAY */}
              {isManual && (
                <div className="mb-3">
                  <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Student&apos;s answer</div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm whitespace-pre-wrap min-h-[2rem]">
                    {studentTextAnswer || <span className="text-gray-400 italic">No answer provided</span>}
                  </div>

                  {/* Model answer */}
                  {q.model_answer && (
                    <div className="mt-2">
                      <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Model answer</div>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm whitespace-pre-wrap">
                        {q.model_answer}
                      </div>
                    </div>
                  )}

                  {/* Grading inputs — only in grade mode and not yet fully graded */}
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

                  {/* Existing teacher note (view mode or already graded in grade mode) */}
                  {(viewOnly || (isAlreadyGraded && !needsManualGrading)) && ans?.teacher_note && (
                    <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <div className="text-xs text-amber-700 font-semibold uppercase tracking-wide mb-1">Teacher note</div>
                      <div className="text-sm">{ans.teacher_note}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Approver comments section (view mode only) */}
              {viewOnly && (
                <div className="space-y-2">
                  {/* Other approvers' comments */}
                  {otherComments.map((c, ci) => (
                    <div key={ci} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <div className="text-xs text-gray-500 font-semibold mb-1">{c.approver_name}</div>
                      <div className="text-sm">{c.comment}</div>
                    </div>
                  ))}

                  {/* Own comment textarea (approver mode) */}
                  {isGradingApprover && (
                    <div className="mt-2">
                      <label className="block text-xs text-gray-500 mb-1">Your comment on this question (optional)</label>
                      <textarea
                        name={`comment_${q.id}`}
                        defaultValue={myGradingComments[q.id] || ""}
                        rows={2}
                        placeholder="Add a comment…"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>
    );
  });

  // ============================================================
  // Render
  // ============================================================

  return (
    <main className="max-w-6xl mx-auto p-4">
      {/* Header card */}
      <Card>
        <a href={backHref} className="text-sm text-gray-400 hover:underline">{backLabel}</a>
        <h1 className="text-lg font-bold mt-2">{pageTitle}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{exam.title}</p>
        <div className="text-xs text-gray-400 mt-1">
          Student: <strong className="text-gray-600">{attempt.student_name}</strong>
          {" · "}Attempt {attempt.attempt_no}
          {attempt.submitted_at && <>{" · "}Submitted {fmtISO(attempt.submitted_at)}</>}
        </div>
      </Card>

      {/* Banners */}
      {/* Gate decision banner (view mode, not approver) */}
      {viewOnly && !isGradingApprover && gateDecision && (
        <div className={`rounded-xl p-3 mb-3 text-sm ${
          gateDecision.status === "APPROVED"
            ? "bg-green-50 border border-green-200 text-green-700"
            : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          {gateDecision.status === "APPROVED" ? "✅" : "❌"} Grading Gate {gateDecision.status === "APPROVED" ? "Approved" : "Rejected"} by {gateDecision.approver_name}
          {gateDecision.note && <div className="mt-1 text-xs opacity-80">{gateDecision.note}</div>}
        </div>
      )}

      {/* Approver banner */}
      {isGradingApprover && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 mb-3 text-sm text-amber-800">
          You are reviewing this submission for the Grading Gate. Add comments per question below, then approve or reject at the bottom.
        </div>
      )}

      {/* View-only banner (not approver) */}
      {viewOnly && !isGradingApprover && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-3 text-sm text-blue-700">
          This attempt is fully graded — view only
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4">
        {/* LEFT COLUMN — Questions */}
        <div>
          {needsManualGrading ? (
            // Grade mode — wrap in form.
            <form action={gradeAction}>
              <input type="hidden" name="attempt_id" value={attemptId} />
              <input type="hidden" name="exam_id" value={examId} />
              {questionCards}
              {/* Mobile sticky save bar */}
              <div className="md:hidden sticky bottom-0 bg-white border-t border-gray-200 p-3 mt-3 rounded-b-xl">
                <button type="submit" className="w-full px-6 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
                  Save Grades
                </button>
              </div>
            </form>
          ) : isGradingApprover ? (
            // Approver mode — wrap in form for comments + approve/reject.
            <form action={gradingReviewRespondAction}>
              <input type="hidden" name="attempt_id" value={attemptId} />
              <input type="hidden" name="exam_id" value={examId} />
              <input type="hidden" name="gate_type" value="GRADING" />
              {questionCards}

              {/* Approver decision card */}
              <Card>
                <h3 className="font-bold text-sm mb-3">Grading Gate Decision</h3>
                <label className="block text-xs text-gray-500 mb-1">Overall note (optional)</label>
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
            <>{questionCards}</>
          )}
        </div>

        {/* RIGHT SIDEBAR — desktop only */}
        <div className="hidden md:block">
          <div className="sticky top-4 space-y-3">
            {needsManualGrading ? (
              // Grade mode sidebar.
              <>
                <Card>
                  <h3 className="font-bold text-sm mb-2">Needs Grading</h3>
                  {ungradedManual.length === 0 ? (
                    <p className="text-sm text-green-600">All questions graded ✓</p>
                  ) : (
                    <ul className="space-y-1">
                      {ungradedManual.map((q) => (
                        <li key={q.id}>
                          <a
                            href={`#q-${q.id}`}
                            className="text-sm text-teal-700 hover:underline no-underline block"
                          >
                            <span className="font-bold">Q{q.number}</span>{" "}
                            <span className="text-gray-500 text-xs">
                              {q.question_text.length > 30 ? q.question_text.slice(0, 30) + "…" : q.question_text}
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
                <Card>
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Score so far</div>
                  <div className="text-xl font-bold">{scoreSoFar} <span className="text-gray-400 font-normal">/ {scoreTotal}</span></div>
                </Card>
                {/* Submit button in sidebar */}
                <button
                  type="submit"
                  form="grade-form-stub"
                  className="w-full px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800 hidden"
                >
                  Save Grades
                </button>
                {/* Since the button needs to be inside the form to submit it,
                    we use a script-free approach: a link-style button that
                    triggers the form via the form attribute — but Next.js
                    server actions require the button inside the form element.
                    Instead, the actual submit is in the form itself.
                    This sidebar serves as reference/navigation. */}
              </>
            ) : (
              // View mode sidebar — score summary.
              <Card>
                <h3 className="font-bold text-sm mb-2">Score Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Score</span>
                    <span className="font-semibold">
                      {attempt.score_raw !== null ? `${attempt.score_raw} / ${attempt.score_total}` : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Percentage</span>
                    <span className="font-semibold">
                      {attempt.score_pct !== null ? `${Math.round(attempt.score_pct)}%` : "—"}
                    </span>
                  </div>
                  {attempt.grade && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Grade</span>
                      <span className="font-semibold">{attempt.grade}</span>
                    </div>
                  )}
                  {attempt.pass_mark_percent !== null && attempt.score_pct !== null && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Result</span>
                      {attempt.score_pct >= attempt.pass_mark_percent ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-50 text-green-700">Pass</span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700">Fail</span>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Mobile grading drawer (grade mode only) */}
      {needsManualGrading && (
        <MobileGradingDrawer
          ungradedQuestions={ungradedManual.map((q) => ({
            id: q.id,
            number: q.number,
            text: q.question_text,
          }))}
          totalUngraded={ungradedManual.length}
        />
      )}
    </main>
  );
}
