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

// ============================================================
// Server Action: Respond to gate with per-question comments
// ============================================================
async function respondWithCommentsAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active) redirect("/choose-school");

  const examId = (formData.get("exam_id") as string || "").trim();
  const gateType = (formData.get("gate_type") as string || "").trim();
  const response = (formData.get("response") as string || "").trim();
  const note = (formData.get("note") as string || "").trim() || null;

  if (!examId || !["QUESTIONS", "GRADING", "RESULTS"].includes(gateType)) redirect("/approvals");
  if (!["APPROVED", "REJECTED"].includes(response)) redirect("/approvals");

  const { first, run, all: dbAll } = getDb();
  const userId = auth.user!.id;
  const tenantId = active.tenant_id;
  const now = new Date().toISOString();

  // Verify user is assigned approver with a PENDING response.
  const gate = await first(
    "SELECT id FROM sitting_approval_gates WHERE exam_id=? AND gate_type=? AND user_id=? AND tenant_id=?",
    [examId, gateType, userId, tenantId]
  );
  if (!gate) redirect("/approvals");

  const pendingResp = await first<{ id: string }>(
    "SELECT id FROM sitting_approval_responses WHERE exam_id=? AND gate_type=? AND approver_id=? AND status='PENDING' AND tenant_id=?",
    [examId, gateType, userId, tenantId]
  );
  if (!pendingResp) redirect("/approvals");

  // Save per-question comments (form fields named comment_<questionId>).
  const allKeys = Array.from(formData.keys());
  for (const key of allKeys) {
    if (!key.startsWith("comment_")) continue;
    const questionId = key.slice(8);
    const commentText = ((formData.get(key) as string) || "").trim();
    if (!commentText) continue;

    // Verify question belongs to this exam + tenant.
    const qRow = await first(
      "SELECT id FROM exam_questions WHERE id=? AND exam_id=? AND tenant_id=?",
      [questionId, examId, tenantId]
    );
    if (!qRow) continue;

    const existingCmt = await first<{ id: string }>(
      "SELECT id FROM sitting_approval_comments WHERE exam_id=? AND gate_type=? AND question_id=? AND approver_id=? AND tenant_id=?",
      [examId, gateType, questionId, userId, tenantId]
    );
    if (existingCmt) {
      await run("UPDATE sitting_approval_comments SET comment=?, updated_at=? WHERE id=?",
        [commentText, now, existingCmt.id]);
    } else {
      await run(
        `INSERT INTO sitting_approval_comments (id, exam_id, gate_type, question_id, approver_id, tenant_id, comment, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [crypto.randomUUID(), examId, gateType, questionId, userId, tenantId, commentText, now, now]
      );
    }
  }

  // Update gate response.
  await run("UPDATE sitting_approval_responses SET status=?, note=?, updated_at=? WHERE id=?",
    [response, note, now, pendingResp.id]);

  redirect("/approvals");
}

// Helper: turn a question_type code into a readable label.
function qTypeLabel(t: string): string {
  if (t === "MCQ") return "Multiple Choice";
  if (t === "MULTIPLE_SELECT") return "Multiple Select";
  if (t === "TRUE_FALSE") return "True / False";
  if (t === "SHORT_ANSWER") return "Short Answer";
  if (t === "ESSAY") return "Essay";
  return t;
}

function QuestionsList({ questions, optionsMap, otherCommentsByQ, myComments, isApproverMode, GATE_LABELS }: {
  questions: { id: string; question_text: string; question_type: string; marks: number; sort_order: number; model_answer: string | null; feedback: string | null }[];
  optionsMap: Map<string, { id: string; option_text: string; is_correct: number; sort_order: number }[]>;
  otherCommentsByQ: Record<string, { approver_name: string; comment: string; gate_type?: string }[]>;
  myComments: Record<string, string>;
  isApproverMode: boolean;
  GATE_LABELS: Record<string, string>;
}) {
  return (
    <>
      {questions.map((q, index) => {
        const options = optionsMap.get(q.id) ?? [];
        const isChoice = q.question_type === "MCQ" || q.question_type === "TRUE_FALSE" || q.question_type === "MULTIPLE_SELECT";
        return (
          <Card key={q.id}>
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 bg-teal-700 text-white text-xs font-bold rounded-full shrink-0">{index + 1}</span>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{qTypeLabel(q.question_type)}</span>
              </div>
              <span className="text-xs font-semibold text-gray-500 shrink-0">{q.marks} {Number(q.marks) === 1 ? "mark" : "marks"}</span>
            </div>
            <p className="text-sm text-gray-800 leading-relaxed mb-3">{q.question_text}</p>
            {isChoice && options.length > 0 && (
              <div className="space-y-2">
                {options.map((opt) => (
                  <div key={opt.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${opt.is_correct ? "border-green-300 bg-green-50 text-green-800" : "border-gray-200 bg-gray-50 text-gray-700"}`}>
                    <span className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${opt.is_correct ? "border-green-500 bg-green-500" : "border-gray-300"}`}>
                      {opt.is_correct && <span className="w-2 h-2 bg-white rounded-full block" />}
                    </span>
                    {opt.option_text}
                    {opt.is_correct && <span className="ml-auto text-xs text-green-600 font-semibold">✓ correct</span>}
                  </div>
                ))}
              </div>
            )}
            {(q.question_type === "SHORT_ANSWER" || q.question_type === "ESSAY") && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-400 italic">
                {q.question_type === "ESSAY" ? "Student writes a long-form essay here…" : "Student types a short answer here…"}
              </div>
            )}
            {q.model_answer && (
              <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs font-semibold text-blue-700 mb-1">Model Answer</p>
                <p className="text-xs text-blue-800">{q.model_answer}</p>
              </div>
            )}
            {q.feedback && (
              <div className="mt-2 p-2 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-xs font-semibold text-gray-500 mb-1">Feedback</p>
                <p className="text-xs text-gray-600">{q.feedback}</p>
              </div>
            )}
            {(otherCommentsByQ[q.id] || []).length > 0 && (
              <div className="mt-3 space-y-1">
                {otherCommentsByQ[q.id].map((c, ci) => (
                  <div key={ci} className="p-2 bg-purple-50 border border-purple-200 rounded-lg">
                    <p className="text-[11px] font-semibold text-purple-600">{c.approver_name}{c.gate_type ? ` (${GATE_LABELS[c.gate_type] || c.gate_type})` : ""}</p>
                    <p className="text-xs text-purple-800">{c.comment}</p>
                  </div>
                ))}
              </div>
            )}
            {isApproverMode && (
              <div className="mt-3">
                <label className="block text-[11px] font-semibold text-blue-600 mb-1">Your comment on Q{index + 1} (optional)</label>
                <textarea name={`comment_${q.id}`} rows={2} defaultValue={myComments[q.id] || ""} placeholder="Add a comment about this question…" className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm bg-blue-50" />
              </div>
            )}
          </Card>
        );
      })}
    </>
  );
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

  // Access: TEACHER, SCHOOL_ADMIN, system admin, or assigned approver.
  const isSystemAdmin = auth.user!.is_system_admin === 1;
  const userId = auth.user!.id;

  // ── Params ──────────────────────────────────────────────────────────────────
  const params = await searchParams;
  const examId = params.exam_id;
  if (!examId) redirect("/teacher");

  // ── Data loading ─────────────────────────────────────────────────────────────
  const { first, all } = getDb();
  const tenantId = active?.tenant_id;

  const exam = await first<{
    id: string; title: string; description: string | null;
    duration_mins: number | null;
    shuffle_questions: number; pass_mark_percent: number | null;
    status: string; course_id: string;
  }>(
    tenantId
      ? "SELECT id, title, description, duration_mins, shuffle_questions, pass_mark_percent, status, course_id FROM exams WHERE id=? AND tenant_id=?"
      : "SELECT id, title, description, duration_mins, shuffle_questions, pass_mark_percent, status, course_id FROM exams WHERE id=?",
    tenantId ? [examId, tenantId] : [examId]
  );
  if (!exam) redirect("/teacher");

  // Access check: school admin, teacher (owns course), system admin, or assigned approver.
  let canAccess = isSystemAdmin;
  if (!canAccess && active) {
    if (active.role === "SCHOOL_ADMIN") {
      canAccess = true;
    } else if (active.role === "TEACHER") {
      const owns = await first("SELECT 1 AS x FROM course_teachers WHERE course_id=? AND user_id=? LIMIT 1", [exam.course_id, userId]);
      if (owns) canAccess = true;
    }
    if (!canAccess && tenantId) {
      const anyGate = await first("SELECT id FROM sitting_approval_gates WHERE exam_id=? AND user_id=? AND tenant_id=? LIMIT 1", [examId, userId, tenantId]);
      if (anyGate) canAccess = true;
    }
  }
  if (!canAccess) redirect("/");

  // Approver mode: does this user have a PENDING response on any gate for this exam?
  let approverGateType: string | null = null;
  if (tenantId) {
    const pendingGate = await first<{ gate_type: string }>(
      `SELECT sag.gate_type FROM sitting_approval_gates sag
       JOIN sitting_approval_responses sar
         ON sar.exam_id=sag.exam_id AND sar.gate_type=sag.gate_type
        AND sar.approver_id=sag.user_id AND sar.tenant_id=sag.tenant_id
       WHERE sag.exam_id=? AND sag.user_id=? AND sag.tenant_id=? AND sar.status='PENDING'
       LIMIT 1`,
      [examId, userId, tenantId]
    );
    approverGateType = pendingGate?.gate_type ?? null;
  }
  const isApproverMode = !!approverGateType;

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

  // ── Approver comments data ─────────────────────────────────────────────────
  // Pre-fill this approver's existing comments + load other approvers' comments.
  const myComments: Record<string, string> = {};
  const otherCommentsByQ: Record<string, { approver_name: string; comment: string; gate_type?: string }[]> = {};

  if (isApproverMode && tenantId) {
    const myRows = await all<{ question_id: string; comment: string }>(
      "SELECT question_id, comment FROM sitting_approval_comments WHERE exam_id=? AND gate_type=? AND approver_id=? AND tenant_id=?",
      [examId, approverGateType, userId, tenantId]
    );
    for (const c of myRows) myComments[c.question_id] = c.comment;

    // All comments on this gate (all approvers).
    const allComments = await all<{ question_id: string; approver_id: string; comment: string; approver_name: string }>(
      `SELECT sac.question_id, sac.approver_id, sac.comment, u.name AS approver_name
       FROM sitting_approval_comments sac JOIN users u ON u.id = sac.approver_id
       WHERE sac.exam_id=? AND sac.gate_type=? AND sac.tenant_id=?
       ORDER BY sac.created_at ASC`,
      [examId, approverGateType, tenantId]
    );
    for (const c of allComments) {
      if (c.approver_id === userId) continue; // Skip own — shown in textarea.
      if (!otherCommentsByQ[c.question_id]) otherCommentsByQ[c.question_id] = [];
      otherCommentsByQ[c.question_id].push({ approver_name: c.approver_name, comment: c.comment });
    }
  } else if (!isApproverMode && tenantId && active && (active.role === "SCHOOL_ADMIN" || active.role === "TEACHER")) {
    // Teacher/admin sees all comments across all gates (read-only).
    const allComments = await all<{ question_id: string; comment: string; approver_name: string; gate_type: string }>(
      `SELECT sac.question_id, sac.gate_type, sac.comment, u.name AS approver_name
       FROM sitting_approval_comments sac JOIN users u ON u.id = sac.approver_id
       WHERE sac.exam_id=? AND sac.tenant_id=?
       ORDER BY sac.gate_type ASC, sac.created_at ASC`,
      [examId, tenantId]
    );
    for (const c of allComments) {
      if (!otherCommentsByQ[c.question_id]) otherCommentsByQ[c.question_id] = [];
      otherCommentsByQ[c.question_id].push({ approver_name: c.approver_name, comment: c.comment, gate_type: c.gate_type });
    }
  }

  const GATE_LABELS: Record<string, string> = { QUESTIONS: "Questions", GRADING: "Grading", RESULTS: "Results" };

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
          {/* Mode badge */}
          <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full shrink-0 ${
            isApproverMode ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"
          }`}>
            {isApproverMode ? `Approver Review — ${GATE_LABELS[approverGateType!] || approverGateType}` : "Preview Mode"}
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
            <div className="font-bold text-teal-700">{exam.duration_mins ?? "—"}</div>
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

      {/* Wrap in form when in approver mode so comment fields + approve/reject submit together */}
      {isApproverMode ? (
        <form action={respondWithCommentsAction}>
          <input type="hidden" name="exam_id" value={examId} />
          <input type="hidden" name="gate_type" value={approverGateType!} />
          <QuestionsList questions={questions} optionsMap={optionsMap} otherCommentsByQ={otherCommentsByQ} myComments={myComments} isApproverMode={isApproverMode} GATE_LABELS={GATE_LABELS} />

          {/* Approve / Reject form */}
          {questions.length > 0 && (
            <Card>
              <div className="font-bold text-base mb-2">Submit Your Review</div>
              <label className="block text-xs text-gray-500 mb-1">Overall note (optional)</label>
              <textarea name="note" rows={2} placeholder="Add a note…" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />
              <div className="flex gap-3">
                <button name="response" value="APPROVED" type="submit"
                  className="flex-1 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
                  ✓ Approve
                </button>
                <button name="response" value="REJECTED" type="submit"
                  className="flex-1 py-2 bg-red-50 text-red-700 text-sm font-semibold rounded-lg hover:bg-red-100">
                  ✗ Reject
                </button>
              </div>
            </Card>
          )}

          <div className="text-center text-xs text-gray-400 mt-2 mb-8">
            End of review — {questions.length} question{questions.length !== 1 ? "s" : ""} · {totalMarks} mark{totalMarks !== 1 ? "s" : ""} total
          </div>
        </form>
      ) : (
        <>
          <QuestionsList questions={questions} optionsMap={optionsMap} otherCommentsByQ={otherCommentsByQ} myComments={myComments} isApproverMode={false} GATE_LABELS={GATE_LABELS} />
          {questions.length > 0 && (
            <div className="text-center text-xs text-gray-400 mt-2 mb-8">
              End of preview — {questions.length} question{questions.length !== 1 ? "s" : ""} · {totalMarks} mark{totalMarks !== 1 ? "s" : ""} total
            </div>
          )}
        </>
      )}
    </main>
  );
}
