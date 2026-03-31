// src/app/exam-preview/page.tsx
// Exam Preview — pure student view of the exam.
// No correct answers, no model answers, no feedback.
// Also serves as the approver review page when the user has a PENDING gate response.

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { PreviewToggle } from "@/components/exam/PreviewToggle";
import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { SidebarNav } from "@/components/layout/SidebarNav";
import { WorkspaceHeader } from "@/components/layout/WorkspaceHeader";
import { getTeacherNavItems } from "@/lib/teacher-nav";

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

  redirect("/approvals?toast=Response+submitted");
}

// ============================================================
// Page Component
// ============================================================

export default async function ExamPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ exam_id?: string }>;
}) {
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  const isSystemAdmin = auth.user!.is_system_admin === 1;
  const userId = auth.user!.id;

  const params = await searchParams;
  const examId = params.exam_id;
  if (!examId) redirect("/teacher");

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

  // Questions — NO model_answer, NO feedback (pure student view).
  const questions = await all<{
    id: string; question_text: string; question_type: string;
    marks: number; sort_order: number;
  }>(
    "SELECT id, question_text, question_type, marks, sort_order FROM exam_questions WHERE exam_id=? ORDER BY sort_order ASC",
    [examId]
  );

  // Options — NO is_correct (pure student view).
  const optionsMap = new Map<string, { option_text: string; sort_order: number }[]>();
  if (questions.length > 0) {
    const questionIds = questions.map((q) => q.id);
    const placeholders = questionIds.map(() => "?").join(",");
    const opts = await all<{
      question_id: string; option_text: string; sort_order: number;
    }>(
      `SELECT question_id, option_text, sort_order FROM exam_question_options WHERE question_id IN (${placeholders}) ORDER BY sort_order ASC`,
      questionIds
    );
    for (const opt of opts) {
      if (!optionsMap.has(opt.question_id)) optionsMap.set(opt.question_id, []);
      optionsMap.get(opt.question_id)!.push(opt);
    }
  }

  const totalMarks = questions.reduce((sum, q) => sum + Number(q.marks), 0);

  // Build serialisable questions array for the client component.
  const questionsWithOptions = questions.map(q => ({
    id: q.id,
    question_type: q.question_type,
    question_text: q.question_text,
    marks: q.marks,
    options: (optionsMap.get(q.id) ?? []).map(o => ({ option_text: o.option_text })),
  }));

  // Approver comments data.
  const myComments: Record<string, string> = {};
  const otherCommentsByQ: Record<string, { approver_name: string; comment: string }[]> = {};

  if (isApproverMode && tenantId) {
    const myRows = await all<{ question_id: string; comment: string }>(
      "SELECT question_id, comment FROM sitting_approval_comments WHERE exam_id=? AND gate_type=? AND approver_id=? AND tenant_id=?",
      [examId, approverGateType, userId, tenantId]
    );
    for (const c of myRows) myComments[c.question_id] = c.comment;

    const allComments = await all<{ question_id: string; approver_id: string; comment: string; approver_name: string }>(
      `SELECT sac.question_id, sac.approver_id, sac.comment, u.name AS approver_name
       FROM sitting_approval_comments sac JOIN qa_users u ON u.id = sac.approver_id
       WHERE sac.exam_id=? AND sac.gate_type=? AND sac.tenant_id=?
       ORDER BY sac.created_at ASC`,
      [examId, approverGateType, tenantId]
    );
    for (const c of allComments) {
      if (c.approver_id === userId) continue;
      if (!otherCommentsByQ[c.question_id]) otherCommentsByQ[c.question_id] = [];
      otherCommentsByQ[c.question_id].push({ approver_name: c.approver_name, comment: c.comment });
    }
  } else if (!isApproverMode && tenantId && active && (active.role === "SCHOOL_ADMIN" || active.role === "TEACHER")) {
    const allComments = await all<{ question_id: string; comment: string; approver_name: string; gate_type: string }>(
      `SELECT sac.question_id, sac.gate_type, sac.comment, u.name AS approver_name
       FROM sitting_approval_comments sac JOIN qa_users u ON u.id = sac.approver_id
       WHERE sac.exam_id=? AND sac.tenant_id=?
       ORDER BY sac.gate_type ASC, sac.created_at ASC`,
      [examId, tenantId]
    );
    for (const c of allComments) {
      if (!otherCommentsByQ[c.question_id]) otherCommentsByQ[c.question_id] = [];
      otherCommentsByQ[c.question_id].push({ approver_name: c.approver_name, comment: c.comment });
    }
  }

  const GATE_LABELS: Record<string, string> = { QUESTIONS: "Questions", GRADING: "Grading", RESULTS: "Results" };

  // Back link logic — match old build.
  const isTeacherOrAdmin = active && (active.role === "TEACHER" || active.role === "SCHOOL_ADMIN");
  const isTeacher = active?.role === "TEACHER";
  const backHref = isTeacherOrAdmin ? `/exam-builder?exam_id=${examId}` : "/approvals";
  const backLabel = isTeacherOrAdmin ? "← Exam Builder" : "← Approval Inbox";

  // Pending approvals count for teacher sidebar badge.
  const pendingCount = isTeacher && tenantId ? await first<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM sitting_approval_gates sag
     JOIN sitting_approval_responses sar
       ON sar.exam_id=sag.exam_id AND sar.gate_type=sag.gate_type
      AND sar.approver_id=sag.user_id AND sar.tenant_id=sag.tenant_id
     WHERE sag.user_id=? AND sag.tenant_id=? AND sar.status='PENDING'`,
    [userId, tenantId]
  ) : null;
  const pendingNum = Number(pendingCount?.cnt ?? 0);

  // ── Render ───────────────────────────────────────────────────────────────────
  const content = (
    <main className="max-w-2xl mx-auto p-4 mt-4">
      {/* Header card */}
      <Card>
        <a href={backHref} className="text-sm text-gray-400 hover:underline">
          {backLabel}
        </a>
        <div className="mt-2 flex items-start justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold">{exam.title}</h1>
            {course && <div className="text-sm text-gray-500">{course.title}</div>}
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full shrink-0 ${
              exam.status === "PUBLISHED" ? "bg-green-50 text-green-700" : exam.status === "CLOSED" ? "bg-red-50 text-red-700" : "bg-gray-100 text-gray-500"
            }`}>
              {exam.status}
            </span>
            <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full shrink-0 ${
              isApproverMode ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"
            }`}>
              {isApproverMode ? `Approver Review — ${GATE_LABELS[approverGateType!] || approverGateType} Gate` : "Preview Mode"}
            </span>
          </div>
        </div>

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
      </Card>

      {/* Approver banner */}
      {isApproverMode && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 text-sm text-amber-800">
          👁️ You are reviewing this exam for the <strong>{GATE_LABELS[approverGateType!] || approverGateType} Gate</strong>. Leave comments on individual questions below, then approve or reject at the bottom.
        </div>
      )}

      {/* Empty state */}
      {questions.length === 0 && (
        <Card>
          <p className="text-sm text-gray-500 text-center py-4">
            No questions have been added to this exam yet.{" "}
            {isTeacherOrAdmin && (
              <a href={`/exam-builder?exam_id=${examId}&tab=questions`} className="text-teal-700 underline">
                Add questions →
              </a>
            )}
          </p>
        </Card>
      )}

      {/* Questions + Approve/Reject */}
      {questions.length > 0 && isApproverMode ? (
        <form action={respondWithCommentsAction}>
          <input type="hidden" name="exam_id" value={examId} />
          <input type="hidden" name="gate_type" value={approverGateType!} />

          <PreviewToggle
            questions={questionsWithOptions}
            isApproverMode={true}
            approverGateType={approverGateType}
            myComments={myComments}
            otherCommentsByQ={otherCommentsByQ}
            examId={examId}
          />

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

          <div className="text-center text-xs text-gray-400 mt-2 mb-8">
            End of review — {questions.length} question{questions.length !== 1 ? "s" : ""} · {totalMarks} mark{totalMarks !== 1 ? "s" : ""} total
          </div>
        </form>
      ) : questions.length > 0 ? (
        <>
          <PreviewToggle
            questions={questionsWithOptions}
            isApproverMode={false}
            approverGateType={null}
            myComments={myComments}
            otherCommentsByQ={otherCommentsByQ}
            examId={examId}
          />
          <div className="text-center text-xs text-gray-400 mt-2 mb-8">
            End of preview — {questions.length} question{questions.length !== 1 ? "s" : ""} · {totalMarks} mark{totalMarks !== 1 ? "s" : ""} total
          </div>
        </>
      ) : null}
    </main>
  );

  if (isTeacher) {
    return (
      <WorkspaceShell
        sidebar={
          <SidebarNav
            items={getTeacherNavItems(pendingNum)}
            schoolName={active!.tenant_name}
            roleName="Teacher"
            currentPath="/exam-preview"
            switchSchool={auth.memberships.length > 1}
          />
        }
        header={
          <WorkspaceHeader
            title={exam.title}
            subtitle="Exam Preview"
            actions={
              <a href={`/teacher?exam_id=${examId}`} className="text-sm text-teal-700 hover:underline no-underline">
                ← Back to Exam
              </a>
            }
          />
        }
      >
        {content}
      </WorkspaceShell>
    );
  }

  return content;
}
