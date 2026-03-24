// src/app/exam-builder/page.tsx
// Exam Builder — the most complex page in the app.
// 6 tabs: Settings, Questions, Publish, Access, Results, Approvals.
//
// This is the server-rendered foundation. Interactive features (dynamic option
// adding, drag-to-reorder) will be added in the client-side interactivity pass.

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership, fmtISO } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card } from "@/components/Card";
import { TabNav } from "@/components/TabNav";
import { QuestionForm } from "@/components/QuestionForm";

// ============================================================
// Helper: save/sync question to personal question bank
// ============================================================

async function saveToBankHelper(
  run: (sql: string, params: unknown[]) => Promise<unknown>,
  first: <T = Record<string, unknown>>(sql: string, params: unknown[]) => Promise<T | null>,
  bankId: string | null,
  tenantId: string,
  userId: string,
  qType: string, qText: string, marks: number, partialMarking: number,
  modelAnswer: string | null, feedback: string | null,
  formData: FormData, now: string
) {
  if (bankId) {
    // Update existing bank question.
    const existing = await first("SELECT id FROM question_bank WHERE id=? AND tenant_id=?", [bankId, tenantId]);
    if (existing) {
      await run(
        "UPDATE question_bank SET question_type=?, question_text=?, marks=?, partial_marking=?, model_answer=?, feedback=?, updated_at=? WHERE id=?",
        [qType, qText, marks, partialMarking, modelAnswer, feedback, now, bankId]
      );
      // Rebuild bank options.
      await run("DELETE FROM question_bank_options WHERE bank_question_id=?", [bankId]);
      await saveBankOptions(run, bankId, qType, formData, now);
      return;
    }
  }
  // Create new bank question.
  const newBankId = crypto.randomUUID();
  await run(
    `INSERT INTO question_bank (id, tenant_id, created_by, question_type, question_text, marks, partial_marking, model_answer, feedback, visibility, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,'PERSONAL',?,?)`,
    [newBankId, tenantId, userId, qType, qText, marks, partialMarking, modelAnswer, feedback, now, now]
  );
  await saveBankOptions(run, newBankId, qType, formData, now);
}

async function saveBankOptions(
  run: (sql: string, params: unknown[]) => Promise<unknown>,
  bankId: string, qType: string, formData: FormData, now: string
) {
  if (qType === "TRUE_FALSE") {
    const correct = (formData.get("tf_correct") as string || "True").trim();
    await run("INSERT INTO question_bank_options (id, bank_question_id, option_text, is_correct, feedback, sort_order, created_at) VALUES (?,?,?,?,?,?,?)",
      [crypto.randomUUID(), bankId, "True", correct === "True" ? 1 : 0, null, 1, now]);
    await run("INSERT INTO question_bank_options (id, bank_question_id, option_text, is_correct, feedback, sort_order, created_at) VALUES (?,?,?,?,?,?,?)",
      [crypto.randomUUID(), bankId, "False", correct === "False" ? 1 : 0, null, 2, now]);
  } else if (qType === "MCQ" || qType === "MULTIPLE_SELECT") {
    const texts = formData.getAll("opt_text[]") as string[];
    const feedbacks = formData.getAll("opt_feedback[]") as string[];
    const correctRaw = formData.getAll("opt_correct[]") as string[];
    const correctSet = new Set(correctRaw.map(v => String(v)));
    for (let i = 0; i < texts.length; i++) {
      const text = (texts[i] || "").trim();
      if (!text) continue;
      const isCorrect = correctSet.has(String(i)) ? 1 : 0;
      const optFeedback = (feedbacks[i] || "").trim() || null;
      await run("INSERT INTO question_bank_options (id, bank_question_id, option_text, is_correct, feedback, sort_order, created_at) VALUES (?,?,?,?,?,?,?)",
        [crypto.randomUUID(), bankId, text, isCorrect, optFeedback, i + 1, now]);
    }
  }
}

// ============================================================
// Server Actions
// ============================================================

async function saveSettingsAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active) redirect("/");

  const examId = formData.get("exam_id") as string;
  const { first, run } = getDb();
  const exam = await first<{ status: string }>("SELECT status FROM exams WHERE id=? AND tenant_id=?", [examId, active!.tenant_id]);
  if (!exam || exam.status === "PUBLISHED" || exam.status === "CLOSED") redirect(`/exam-builder?exam_id=${examId}`);

  const now = new Date().toISOString();
  const endsAt = (formData.get("ends_at") as string || "").trim() || null;
  await run(
    `UPDATE exams SET title=?, description=?, duration_mins=?, max_attempts=?,
       starts_at=?, ends_at=?, late_submission_policy=?,
       exam_password=?,
       shuffle_questions=?, shuffle_options=?, show_marks_during=?,
       allow_review=?, navigation_mode=?,
       results_release_policy=?, score_display=?, pass_mark_percent=?,
       updated_at=?
     WHERE id=? AND tenant_id=?`,
    [
      (formData.get("title") as string || "").trim(),
      (formData.get("description") as string || "").trim() || null,
      Math.max(1, parseInt(formData.get("duration_mins") as string || "60", 10)),
      Math.max(1, parseInt(formData.get("max_attempts") as string || "1", 10)),
      (formData.get("starts_at") as string || "").trim() || null,
      endsAt,
      endsAt ? (formData.get("late_submission_policy") as string || "HARD_CUT") : null,
      (formData.get("exam_password") as string || "").trim() || null,
      formData.get("shuffle_questions") === "1" ? 1 : 0,
      formData.get("shuffle_options") === "1" ? 1 : 0,
      formData.get("show_marks_during") === "1" ? 1 : 0,
      formData.get("allow_review") === "1" ? 1 : 0,
      formData.get("navigation_mode") || "FREE",
      formData.get("results_release_policy") || "MANUAL",
      formData.get("score_display") || "BOTH",
      (formData.get("pass_mark_percent") as string || "").trim() ? parseFloat(formData.get("pass_mark_percent") as string) : null,
      now, examId, active!.tenant_id,
    ]
  );
  redirect(`/exam-builder?exam_id=${examId}&tab=settings`);
}

async function deleteQuestionAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active) redirect("/");

  const examId = formData.get("exam_id") as string;
  const questionId = formData.get("question_id") as string;
  const { run } = getDb();
  await run("DELETE FROM exam_question_options WHERE question_id=?", [questionId]);
  await run("DELETE FROM exam_questions WHERE id=? AND exam_id=?", [questionId, examId]);
  redirect(`/exam-builder?exam_id=${examId}&tab=questions`);
}

async function reorderQuestionAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active) redirect("/");

  const examId = formData.get("exam_id") as string;
  const questionId = formData.get("question_id") as string;
  const direction = formData.get("direction") as string;
  const { all, run } = getDb();

  const questions = await all<{ id: string; sort_order: number }>(
    "SELECT id, sort_order FROM exam_questions WHERE exam_id=? ORDER BY sort_order ASC", [examId]
  );
  const idx = questions.findIndex((q) => q.id === questionId);
  if (idx < 0) redirect(`/exam-builder?exam_id=${examId}&tab=questions`);

  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= questions.length) redirect(`/exam-builder?exam_id=${examId}&tab=questions`);

  const a = questions[idx], b = questions[swapIdx];
  await run("UPDATE exam_questions SET sort_order=? WHERE id=?", [b.sort_order, a.id]);
  await run("UPDATE exam_questions SET sort_order=? WHERE id=?", [a.sort_order, b.id]);
  redirect(`/exam-builder?exam_id=${examId}&tab=questions`);
}

async function addQuestionAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active) redirect("/");

  const examId = formData.get("exam_id") as string;
  const { first, run } = getDb();

  const exam = await first<{ status: string }>("SELECT status FROM exams WHERE id=? AND tenant_id=?", [examId, active.tenant_id]);
  if (!exam || exam.status === "PUBLISHED" || exam.status === "CLOSED") redirect(`/exam-builder?exam_id=${examId}&tab=questions`);

  const qType = (formData.get("question_type") as string || "MCQ").trim();
  const qText = (formData.get("question_text") as string || "").trim();
  const marks = Math.max(0.5, parseFloat(formData.get("marks") as string || "1") || 1);
  const feedback = (formData.get("feedback") as string || "").trim() || null;
  const modelAnswer = qType === "SHORT_ANSWER" ? (formData.get("model_answer") as string || "").trim() || null : null;
  const partialMarking = qType === "MULTIPLE_SELECT" ? (formData.get("partial_marking") === "1" ? 1 : 0) : 0;
  if (!qText) redirect(`/exam-builder?exam_id=${examId}&tab=questions`);

  const now = new Date().toISOString();
  const maxOrder = await first<{ m: number | null }>("SELECT MAX(sort_order) AS m FROM exam_questions WHERE exam_id=?", [examId]);
  const sortOrder = (Number(maxOrder?.m) || 0) + 1;

  const qId = crypto.randomUUID();
  await run(
    `INSERT INTO exam_questions
     (id, exam_id, tenant_id, question_type, question_text, marks, sort_order, partial_marking, model_answer, feedback, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [qId, examId, active.tenant_id, qType, qText, marks, sortOrder, partialMarking, modelAnswer, feedback, now, now]
  );

  // Save options based on question type.
  if (qType === "TRUE_FALSE") {
    const correct = (formData.get("tf_correct") as string || "True").trim();
    await run("INSERT INTO exam_question_options (id, question_id, option_text, is_correct, feedback, sort_order, created_at) VALUES (?,?,?,?,?,?,?)",
      [crypto.randomUUID(), qId, "True", correct === "True" ? 1 : 0, null, 1, now]);
    await run("INSERT INTO exam_question_options (id, question_id, option_text, is_correct, feedback, sort_order, created_at) VALUES (?,?,?,?,?,?,?)",
      [crypto.randomUUID(), qId, "False", correct === "False" ? 1 : 0, null, 2, now]);
  } else if (qType === "MCQ" || qType === "MULTIPLE_SELECT") {
    const texts = formData.getAll("opt_text[]") as string[];
    const feedbacks = formData.getAll("opt_feedback[]") as string[];
    const correctRaw = formData.getAll("opt_correct[]") as string[];
    const correctSet = new Set(correctRaw.map(v => String(v)));
    for (let i = 0; i < texts.length; i++) {
      const text = (texts[i] || "").trim();
      if (!text) continue;
      const isCorrect = correctSet.has(String(i)) ? 1 : 0;
      const optFeedback = (feedbacks[i] || "").trim() || null;
      await run("INSERT INTO exam_question_options (id, question_id, option_text, is_correct, feedback, sort_order, created_at) VALUES (?,?,?,?,?,?,?)",
        [crypto.randomUUID(), qId, text, isCorrect, optFeedback, i + 1, now]);
    }
  }

  // Auto-save to question bank (PERSONAL).
  await saveToBankHelper(run, first, null, active.tenant_id, auth.user!.id, qType, qText, marks, partialMarking, modelAnswer, feedback, formData, now);
  // Link exam question to bank entry.
  const bankEntry = await first<{ id: string }>(
    "SELECT id FROM question_bank WHERE tenant_id=? AND created_by=? AND question_text=? ORDER BY created_at DESC LIMIT 1",
    [active.tenant_id, auth.user!.id, qText]
  );
  if (bankEntry) {
    await run("UPDATE exam_questions SET bank_question_id=? WHERE id=?", [bankEntry.id, qId]);
  }

  redirect(`/exam-builder?exam_id=${examId}&tab=questions`);
}

async function updateQuestionAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active) redirect("/");

  const examId = formData.get("exam_id") as string;
  const qId = formData.get("question_id") as string;
  const { first, run } = getDb();

  const exam = await first<{ status: string }>("SELECT status FROM exams WHERE id=? AND tenant_id=?", [examId, active.tenant_id]);
  if (!exam || !qId) redirect("/teacher");

  const qType = (formData.get("question_type") as string || "MCQ").trim();
  const qText = (formData.get("question_text") as string || "").trim();
  const marks = Math.max(0.5, parseFloat(formData.get("marks") as string || "1") || 1);
  const feedback = (formData.get("feedback") as string || "").trim() || null;
  const modelAnswer = qType === "SHORT_ANSWER" ? (formData.get("model_answer") as string || "").trim() || null : null;
  const partialMarking = qType === "MULTIPLE_SELECT" ? (formData.get("partial_marking") === "1" ? 1 : 0) : 0;
  if (!qText) redirect(`/exam-builder?exam_id=${examId}&tab=questions`);

  const now = new Date().toISOString();
  await run(
    `UPDATE exam_questions SET question_type=?, question_text=?, marks=?, partial_marking=?, model_answer=?, feedback=?, updated_at=?
     WHERE id=? AND exam_id=?`,
    [qType, qText, marks, partialMarking, modelAnswer, feedback, now, qId, examId]
  );

  // Rebuild options.
  await run("DELETE FROM exam_question_options WHERE question_id=?", [qId]);
  if (qType === "TRUE_FALSE") {
    const correct = (formData.get("tf_correct") as string || "True").trim();
    await run("INSERT INTO exam_question_options (id, question_id, option_text, is_correct, feedback, sort_order, created_at) VALUES (?,?,?,?,?,?,?)",
      [crypto.randomUUID(), qId, "True", correct === "True" ? 1 : 0, null, 1, now]);
    await run("INSERT INTO exam_question_options (id, question_id, option_text, is_correct, feedback, sort_order, created_at) VALUES (?,?,?,?,?,?,?)",
      [crypto.randomUUID(), qId, "False", correct === "False" ? 1 : 0, null, 2, now]);
  } else if (qType === "MCQ" || qType === "MULTIPLE_SELECT") {
    const texts = formData.getAll("opt_text[]") as string[];
    const feedbacks = formData.getAll("opt_feedback[]") as string[];
    const correctRaw = formData.getAll("opt_correct[]") as string[];
    const correctSet = new Set(correctRaw.map(v => String(v)));
    for (let i = 0; i < texts.length; i++) {
      const text = (texts[i] || "").trim();
      if (!text) continue;
      const isCorrect = correctSet.has(String(i)) ? 1 : 0;
      const optFeedback = (feedbacks[i] || "").trim() || null;
      await run("INSERT INTO exam_question_options (id, question_id, option_text, is_correct, feedback, sort_order, created_at) VALUES (?,?,?,?,?,?,?)",
        [crypto.randomUUID(), qId, text, isCorrect, optFeedback, i + 1, now]);
    }
  }

  // Auto-sync to question bank if exam is DRAFT.
  const existingQ = await first<{ bank_question_id: string | null }>("SELECT bank_question_id FROM exam_questions WHERE id=? AND exam_id=?", [qId, examId]);
  if (exam.status === "DRAFT") {
    await saveToBankHelper(run, first, existingQ?.bank_question_id || null, active.tenant_id, auth.user!.id, qType, qText, marks, partialMarking, modelAnswer, feedback, formData, now);
    if (!existingQ?.bank_question_id) {
      const bankEntry = await first<{ id: string }>(
        "SELECT id FROM question_bank WHERE tenant_id=? AND created_by=? AND question_text=? ORDER BY created_at DESC LIMIT 1",
        [active.tenant_id, auth.user!.id, qText]
      );
      if (bankEntry) {
        await run("UPDATE exam_questions SET bank_question_id=? WHERE id=?", [bankEntry.id, qId]);
      }
    }
  }

  redirect(`/exam-builder?exam_id=${examId}&tab=questions`);
}

async function publishAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active) redirect("/");

  const examId = formData.get("exam_id") as string;
  const { first, run } = getDb();
  const now = new Date().toISOString();

  // Verify exam exists and is DRAFT.
  const exam = await first<{ status: string; results_release_policy: string | null }>(
    "SELECT status, results_release_policy FROM exams WHERE id=? AND tenant_id=?", [examId, active!.tenant_id]
  );
  if (!exam || exam.status !== "DRAFT") redirect(`/exam-builder?exam_id=${examId}&tab=publish`);

  // Must have at least one question to publish.
  const qCount = await first<{ c: number }>("SELECT COUNT(*) AS c FROM exam_questions WHERE exam_id=?", [examId]);
  if (!qCount || Number(qCount.c) === 0) redirect(`/exam-builder?exam_id=${examId}&tab=publish`);

  // If results_release_policy is IMMEDIATE, auto-release results on publish.
  const releaseOnPublish = exam.results_release_policy === "IMMEDIATE";
  await run(
    `UPDATE exams SET status='PUBLISHED', published_at=?, published_by=?, updated_at=?${releaseOnPublish ? ", results_published_at=?" : ""} WHERE id=?`,
    releaseOnPublish ? [now, auth.user!.id, now, now, examId] : [now, auth.user!.id, now, examId]
  );
  redirect(`/exam-builder?exam_id=${examId}&tab=publish`);
}

async function closeAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active) redirect("/");

  const examId = formData.get("exam_id") as string;
  const { first, run } = getDb();
  const now = new Date().toISOString();

  // Check results_release_policy — auto-release results if AFTER_CLOSE.
  const exam = await first<{ results_release_policy: string | null }>(
    "SELECT results_release_policy FROM exams WHERE id=? AND tenant_id=?", [examId, active!.tenant_id]
  );
  const releaseOnClose = exam?.results_release_policy === "AFTER_CLOSE";
  await run(
    `UPDATE exams SET status='CLOSED', closed_at=?, updated_at=?${releaseOnClose ? ", results_published_at=?" : ""} WHERE id=?`,
    releaseOnClose ? [now, now, now, examId] : [now, now, examId]
  );
  redirect(`/exam-builder?exam_id=${examId}&tab=publish`);
}

async function releaseResultsAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active) redirect("/");

  const examId = formData.get("exam_id") as string;
  const { run } = getDb();
  await run("UPDATE exams SET results_published_at=?, updated_at=? WHERE id=? AND tenant_id=?",
    [new Date().toISOString(), new Date().toISOString(), examId, active!.tenant_id]);
  redirect(`/exam-builder?exam_id=${examId}&tab=results`);
}

async function addAccessClassAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active) redirect("/");

  const examId = formData.get("exam_id") as string;
  const classId = formData.get("class_id") as string;
  const { all, first, run } = getDb();
  const now = new Date().toISOString();

  // Validate class belongs to tenant.
  const cls = await first("SELECT id FROM classes WHERE id=? AND tenant_id=?", [classId, active.tenant_id]);
  if (!cls) redirect(`/exam-builder?exam_id=${examId}&tab=access`);

  // Use NOT IN subquery to only fetch students not already in access (matches old code).
  const toAdd = await all<{ user_id: string }>(
    `SELECT cs.user_id FROM class_students cs
     WHERE cs.class_id=? AND cs.user_id NOT IN (SELECT user_id FROM exam_access WHERE exam_id=?)`,
    [classId, examId]
  );
  for (const s of toAdd) {
    await run("INSERT INTO exam_access (id, exam_id, user_id, added_by, created_at) VALUES (?,?,?,?,?)",
      [crypto.randomUUID(), examId, s.user_id, auth.user!.id, now]);
  }
  redirect(`/exam-builder?exam_id=${examId}&tab=access`);
}

async function addAccessCourseAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active) redirect("/");

  const examId = formData.get("exam_id") as string;
  const { first, all, run } = getDb();
  const exam = await first<{ course_id: string }>("SELECT course_id FROM exams WHERE id=? AND tenant_id=?", [examId, active.tenant_id]);
  if (!exam) redirect(`/exam-builder?exam_id=${examId}&tab=access`);

  const now = new Date().toISOString();
  // Use NOT IN subquery (matches old code pattern).
  const toAdd = await all<{ user_id: string }>(
    `SELECT e.user_id FROM enrollments e
     WHERE e.course_id=? AND e.user_id NOT IN (SELECT user_id FROM exam_access WHERE exam_id=?)`,
    [exam.course_id, examId]
  );
  for (const s of toAdd) {
    await run("INSERT INTO exam_access (id, exam_id, user_id, added_by, created_at) VALUES (?,?,?,?,?)",
      [crypto.randomUUID(), examId, s.user_id, auth.user!.id, now]);
  }
  redirect(`/exam-builder?exam_id=${examId}&tab=access`);
}

async function addAccessStudentAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active) redirect("/");

  const examId = formData.get("exam_id") as string;
  const userId = formData.get("user_id") as string;
  const { first, run } = getDb();
  const now = new Date().toISOString();

  // Validate student is an active STUDENT member (matches old code).
  const member = await first(
    "SELECT 1 AS x FROM memberships WHERE user_id=? AND tenant_id=? AND role='STUDENT' AND status='ACTIVE' LIMIT 1",
    [userId, active.tenant_id]
  );
  if (!member) redirect(`/exam-builder?exam_id=${examId}&tab=access`);

  const exists = await first("SELECT 1 FROM exam_access WHERE exam_id=? AND user_id=?", [examId, userId]);
  if (!exists) {
    await run("INSERT INTO exam_access (id, exam_id, user_id, added_by, created_at) VALUES (?,?,?,?,?)",
      [crypto.randomUUID(), examId, userId, auth.user!.id, now]);
  }
  redirect(`/exam-builder?exam_id=${examId}&tab=access`);
}

async function removeAccessAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active) redirect("/");

  const examId = formData.get("exam_id") as string;
  const accessId = formData.get("access_id") as string;
  const { first, run } = getDb();

  // Don't allow removal on closed exams (matches old code).
  const exam = await first<{ status: string }>("SELECT status FROM exams WHERE id=? AND tenant_id=?", [examId, active.tenant_id]);
  if (exam?.status === "CLOSED") redirect(`/exam-builder?exam_id=${examId}&tab=access`);

  await run("DELETE FROM exam_access WHERE id=? AND exam_id=?", [accessId, examId]);
  redirect(`/exam-builder?exam_id=${examId}&tab=access`);
}

async function gateSubmitAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active) redirect("/");

  const examId = formData.get("exam_id") as string;
  const gateType = formData.get("gate_type") as string;
  if (!examId || !["QUESTIONS", "GRADING", "RESULTS"].includes(gateType)) redirect("/teacher");

  const { all, first, run } = getDb();
  const now = new Date().toISOString();

  // Get all approvers for this gate.
  const approvers = await all<{ user_id: string }>(
    "SELECT user_id FROM sitting_approval_gates WHERE exam_id=? AND gate_type=? AND tenant_id=?",
    [examId, gateType, active!.tenant_id]
  );

  // Create PENDING responses for each approver (upsert).
  for (const a of approvers) {
    const existing = await first<{ id: string }>(
      "SELECT id FROM sitting_approval_responses WHERE exam_id=? AND gate_type=? AND approver_id=? AND tenant_id=?",
      [examId, gateType, a.user_id, active!.tenant_id]
    );
    if (existing) {
      await run("UPDATE sitting_approval_responses SET status='PENDING', note=NULL, updated_at=? WHERE id=?", [now, existing.id]);
    } else {
      await run(
        `INSERT INTO sitting_approval_responses (id, exam_id, gate_type, approver_id, status, note, tenant_id, created_at, updated_at)
         VALUES (?,?,?,?,'PENDING',NULL,?,?,?)`,
        [crypto.randomUUID(), examId, gateType, a.user_id, active!.tenant_id, now, now]
      );
    }
  }

  redirect(`/exam-builder?exam_id=${examId}&tab=approvals`);
}

// ============================================================
// Page Component
// ============================================================

function StatusBadge({ status }: { status: string }) {
  const s: Record<string, string> = { PUBLISHED: "bg-green-50 text-green-700", CLOSED: "bg-red-50 text-red-700", DRAFT: "bg-gray-100 text-gray-500" };
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${s[status] || s.DRAFT}`}>{status}</span>;
}

const qTypeLabel = (t: string) => {
  if (t === "MCQ") return "Multiple Choice";
  if (t === "MULTIPLE_SELECT") return "Multiple Select";
  if (t === "TRUE_FALSE") return "True / False";
  if (t === "SHORT_ANSWER") return "Short Answer";
  if (t === "ESSAY") return "Essay";
  return t;
};

export default async function ExamBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ exam_id?: string; tab?: string; edit_q?: string }>;
}) {
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  const isSystemAdmin = auth.user!.is_system_admin === 1;
  if (!active && !isSystemAdmin) redirect("/");
  if (active && active.role !== "TEACHER" && active.role !== "SCHOOL_ADMIN") redirect("/");

  const params = await searchParams;
  const examId = params.exam_id;
  const tab = params.tab || "settings";
  if (!examId) redirect("/teacher");

  const { first, all } = getDb();
  const tenantId = active?.tenant_id;
  const exam = await first<{
    id: string; title: string; description: string | null; status: string;
    time_limit_minutes: number | null; duration_mins: number | null;
    shuffle_questions: number; score_display: string; pass_mark_percent: number | null;
    allow_review: number; max_attempts: number; exam_password: string | null;
    starts_at: string | null; ends_at: string | null; course_id: string;
    results_published_at: string | null;
  }>(
    tenantId
      ? "SELECT * FROM exams WHERE id=? AND tenant_id=?"
      : "SELECT * FROM exams WHERE id=?",
    tenantId ? [examId, tenantId] : [examId]
  );
  if (!exam) redirect("/teacher");

  // Use the exam's tenant_id for all queries — works for both school admins and system admins.
  const tid = tenantId || (exam as Record<string, unknown>).tenant_id as string || "";

  // Verify teacher owns the course.
  if (active?.role === "TEACHER") {
    const owns = await first("SELECT 1 FROM course_teachers WHERE course_id=? AND user_id=?", [exam.course_id, auth.user!.id]);
    if (!owns) redirect("/teacher");
  }

  const locked = exam.status === "PUBLISHED" || exam.status === "CLOSED";
  const base = `/exam-builder?exam_id=${examId}`;

  // Check if this exam has any approval gates configured.
  const gateCount = await first<{ cnt: number }>(
    "SELECT COUNT(*) AS cnt FROM sitting_approval_gates WHERE exam_id=? AND tenant_id=?",
    [examId, tid]
  );
  const hasGates = Number(gateCount?.cnt ?? 0) > 0;

  const tabs = [
    { label: "Settings", value: "settings", href: `${base}&tab=settings` },
    { label: "Questions", value: "questions", href: `${base}&tab=questions` },
    { label: "Preview", value: "preview", href: `/exam-preview?exam_id=${examId}` },
    { label: "Publish", value: "publish", href: `${base}&tab=publish` },
    { label: "Access", value: "access", href: `${base}&tab=access` },
    { label: "Results", value: "results", href: `${base}&tab=results` },
    ...(hasGates ? [{ label: "Approvals", value: "approvals", href: `${base}&tab=approvals` }] : []),
  ];

  return (
    <main className="max-w-5xl mx-auto p-4">
      <Card>
        <a href="/teacher" className="text-sm text-gray-400 hover:underline">← My Exams</a>
        <h1 className="text-lg font-bold mt-1">{exam.title}</h1>
        <StatusBadge status={exam.status} />
      </Card>

      <TabNav tabs={tabs} activeTab={tab} />

      {/* Settings Tab */}
      {tab === "settings" && (
        <Card title="Settings">
          {locked && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg p-3 mb-3">
              This exam is {exam.status.toLowerCase()} — settings are locked.
            </div>
          )}
          <form action={saveSettingsAction}>
            <input type="hidden" name="exam_id" value={exam.id} />
            <fieldset disabled={locked} className="border-none p-0 m-0">
              <label className="block text-sm mb-1">Title</label>
              <input name="title" defaultValue={exam.title} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />
              <label className="block text-sm mb-1">Description</label>
              <textarea name="description" rows={2} defaultValue={exam.description || ""} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-sm mb-1">Duration (mins)</label>
                  <input name="duration_mins" type="number" defaultValue={exam.duration_mins || 60} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm mb-1">Max attempts</label>
                  <input name="max_attempts" type="number" min="1" defaultValue={exam.max_attempts} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-sm mb-1">Score display</label>
                  <select name="score_display" defaultValue={exam.score_display} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="BOTH">Both (% and marks)</option>
                    <option value="PERCENT">Percentage only</option>
                    <option value="MARKS">Marks only</option>
                    <option value="NONE">None</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1">Pass mark %</label>
                  <input name="pass_mark_percent" type="number" min="0" max="100" defaultValue={exam.pass_mark_percent ?? ""} placeholder="Leave blank for no pass mark" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-sm mb-1">Shuffle questions</label>
                  <select name="shuffle_questions" defaultValue={String(exam.shuffle_questions)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="0">No</option>
                    <option value="1">Yes</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1">Shuffle options</label>
                  <select name="shuffle_options" defaultValue={String((exam as any).shuffle_options ?? 0)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="0">No</option>
                    <option value="1">Yes</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-sm mb-1">Show marks during exam</label>
                  <select name="show_marks_during" defaultValue={String((exam as any).show_marks_during ?? 0)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="0">No</option>
                    <option value="1">Yes</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1">Allow review after submit</label>
                  <select name="allow_review" defaultValue={String(exam.allow_review)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="1">Yes</option>
                    <option value="0">No</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-sm mb-1">Navigation mode</label>
                  <select name="navigation_mode" defaultValue={(exam as any).navigation_mode || "FREE"} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="FREE">Free (jump between questions)</option>
                    <option value="SEQUENTIAL">Sequential (one at a time)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1">Results release</label>
                  <select name="results_release_policy" defaultValue={(exam as any).results_release_policy || "MANUAL"} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="MANUAL">Manual (release when ready)</option>
                    <option value="IMMEDIATE">Immediate (on publish)</option>
                    <option value="AFTER_CLOSE">After exam closes</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-sm mb-1">Opens at</label>
                  <input name="starts_at" type="datetime-local" defaultValue={exam.starts_at?.slice(0, 16) || ""} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm mb-1">Closes at</label>
                  <input name="ends_at" type="datetime-local" defaultValue={exam.ends_at?.slice(0, 16) || ""} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-sm mb-1">Late submission policy</label>
                  <select name="late_submission_policy" defaultValue={(exam as any).late_submission_policy || "HARD_CUT"} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="HARD_CUT">Hard cut (no late submissions)</option>
                    <option value="ALLOW_LATE">Allow late submissions</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1">Exam password <span className="text-gray-400">(optional)</span></label>
                  <input name="exam_password" defaultValue={exam.exam_password || ""} placeholder="Leave blank for no password" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
              {!locked && (
                <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
                  Save Settings
                </button>
              )}
            </fieldset>
          </form>
        </Card>
      )}

      {/* Questions Tab */}
      {tab === "questions" && <QuestionsTab examId={exam.id} locked={locked} editQuestionId={params.edit_q} />}

      {/* Publish Tab */}
      {tab === "publish" && (
        <Card title="Publish & Status">
          <p className="text-sm text-gray-600 mb-3">Current status: <StatusBadge status={exam.status} /></p>
          {exam.status === "DRAFT" && (
            <form action={publishAction}>
              <input type="hidden" name="exam_id" value={exam.id} />
              <p className="text-sm text-gray-500 mb-3">Publishing makes this exam available to students. Settings and questions will be locked.</p>
              <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
                Publish Exam
              </button>
            </form>
          )}
          {exam.status === "PUBLISHED" && (
            <form action={closeAction}>
              <input type="hidden" name="exam_id" value={exam.id} />
              <p className="text-sm text-gray-500 mb-3">Closing the exam prevents new attempts. Existing in-progress attempts can still be submitted.</p>
              <button type="submit" className="px-4 py-2 bg-red-50 text-red-700 text-sm font-semibold rounded-lg hover:bg-red-100">
                Close Exam
              </button>
            </form>
          )}
          {exam.status === "CLOSED" && (
            <p className="text-sm text-gray-500">This exam is closed. No further changes can be made.</p>
          )}
        </Card>
      )}

      {/* Access Tab */}
      {tab === "access" && <AccessTab examId={exam.id} courseId={exam.course_id} tenantId={tid} examStatus={exam.status} />}

      {/* Results Tab */}
      {tab === "results" && <ResultsTab examId={exam.id} tenantId={tid} resultsPublished={exam.results_published_at} />}

      {/* Approvals Tab */}
      {tab === "approvals" && hasGates && <ApprovalsTab examId={exam.id} tenantId={tid} userRole={active?.role || "SCHOOL_ADMIN"} />}
    </main>
  );
}

// ============================================================
// Questions Tab
// ============================================================

async function QuestionsTab({ examId, locked, editQuestionId }: { examId: string; locked: boolean; editQuestionId?: string }) {
  const { all } = getDb();

  const questions = await all<{
    id: string; question_type: string; question_text: string;
    marks: number; sort_order: number; bank_question_id: string | null;
    partial_marking: number | null; model_answer: string | null; feedback: string | null;
  }>("SELECT id, question_type, question_text, marks, sort_order, partial_marking, model_answer, feedback, bank_question_id FROM exam_questions WHERE exam_id=? ORDER BY sort_order ASC", [examId]);

  const allOptions = questions.length > 0 ? await all<{
    question_id: string; option_text: string; is_correct: number; feedback: string | null;
  }>(
    `SELECT question_id, option_text, is_correct, feedback FROM exam_question_options
     WHERE question_id IN (${questions.map(() => "?").join(",")}) ORDER BY sort_order ASC`,
    questions.map((q) => q.id)
  ) : [];

  const optsByQ: Record<string, typeof allOptions> = {};
  for (const o of allOptions) {
    if (!optsByQ[o.question_id]) optsByQ[o.question_id] = [];
    optsByQ[o.question_id].push(o);
  }

  const totalMarks = questions.reduce((s, q) => s + Number(q.marks || 0), 0);

  return (
    <>
      <Card title={`Questions (${questions.length}) — ${totalMarks} marks`}>
        {questions.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No questions yet. Add questions below or from the question bank.</p>
        ) : (
          <div className="space-y-2">
            {questions.map((q, i) => {
              const opts = optsByQ[q.id] || [];
              return (
                <div key={q.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex gap-3 items-start">
                    <div className="min-w-[28px] text-center">
                      <div className="font-bold text-teal-700">{i + 1}</div>
                      <div className="text-xs text-gray-400">{q.marks}m</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex gap-2 items-center flex-wrap mb-1">
                        <span className="inline-block px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-[11px] font-semibold">
                          {qTypeLabel(q.question_type)}
                        </span>
                        {q.bank_question_id && (
                          <span className="inline-block px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-semibold">From bank</span>
                        )}
                        {q.partial_marking === 1 && (
                          <span className="inline-block px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-semibold">Partial marks</span>
                        )}
                      </div>
                      <div className="text-sm mb-1">{q.question_text}</div>
                      {opts.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {opts.map((o, j) => (
                            <span key={j} className={`inline-block px-2 py-0.5 rounded-md text-[11px] ${
                              o.is_correct ? "bg-teal-50 text-teal-700" : "bg-gray-100 text-gray-500"
                            }`}>
                              {o.option_text}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {!locked && (
                      <div className="flex flex-col gap-1 items-end flex-shrink-0">
                        <div className="flex gap-1">
                          <form action={reorderQuestionAction}>
                            <input type="hidden" name="exam_id" value={examId} />
                            <input type="hidden" name="question_id" value={q.id} />
                            <input type="hidden" name="direction" value="up" />
                            <button type="submit" disabled={i === 0} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200 disabled:opacity-30">
                              ↑
                            </button>
                          </form>
                          <form action={reorderQuestionAction}>
                            <input type="hidden" name="exam_id" value={examId} />
                            <input type="hidden" name="question_id" value={q.id} />
                            <input type="hidden" name="direction" value="down" />
                            <button type="submit" disabled={i === questions.length - 1} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200 disabled:opacity-30">
                              ↓
                            </button>
                          </form>
                        </div>
                        <a href={`/exam-builder?exam_id=${examId}&tab=questions&edit_q=${q.id}`}
                          className="px-2 py-1 bg-gray-100 text-teal-700 text-xs rounded-lg hover:bg-gray-200 no-underline">
                          Edit
                        </a>
                        <form action={deleteQuestionAction}>
                          <input type="hidden" name="exam_id" value={examId} />
                          <input type="hidden" name="question_id" value={q.id} />
                          <button type="submit" className="px-2 py-1 bg-gray-100 text-red-600 text-xs rounded-lg hover:bg-red-50">
                            Delete
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Edit question form — shown when edit_q param is set */}
      {!locked && editQuestionId && (() => {
        const editQ = questions.find(q => q.id === editQuestionId);
        if (!editQ) return null;
        const editOpts = optsByQ[editQ.id] || [];
        return (
          <Card title={`Edit Question ${questions.indexOf(editQ) + 1}`}>
            <QuestionForm
              examId={examId}
              addAction={addQuestionAction}
              editAction={updateQuestionAction}
              initial={{
                id: editQ.id,
                question_type: editQ.question_type,
                question_text: editQ.question_text,
                marks: editQ.marks,
                partial_marking: editQ.partial_marking ?? 0,
                model_answer: editQ.model_answer,
                feedback: editQ.feedback,
                options: editOpts.map(o => ({ option_text: o.option_text, is_correct: o.is_correct, feedback: o.feedback })),
              }}
              onCancel={`/exam-builder?exam_id=${examId}&tab=questions`}
            />
          </Card>
        );
      })()}

      {/* Add new question form */}
      {!locked && !editQuestionId && (
        <Card title="Add New Question">
          <QuestionForm
            examId={examId}
            addAction={addQuestionAction}
            editAction={updateQuestionAction}
          />
        </Card>
      )}

      {/* Bank picker link */}
      {!locked && (
        <Card>
          <p className="text-sm text-gray-500">
            Or add from the{" "}
            <a href={`/exam-bank-picker?exam_id=${examId}`} className="text-teal-700 hover:underline">Question Bank →</a>
          </p>
        </Card>
      )}
    </>
  );
}

// ============================================================
// Access Tab
// ============================================================

async function AccessTab({ examId, courseId, tenantId, examStatus }: { examId: string; courseId: string; tenantId: string; examStatus: string }) {
  const { all } = getDb();

  const accessList = await all<{
    id: string; user_id: string; student_name: string; student_email: string;
  }>(
    `SELECT ea.id, ea.user_id, u.name AS student_name, u.email AS student_email
     FROM exam_access ea JOIN users u ON u.id = ea.user_id
     WHERE ea.exam_id=? ORDER BY u.name ASC`,
    [examId]
  );

  const classes = await all<{ id: string; name: string }>(
    "SELECT id, name FROM classes WHERE tenant_id=? AND status='ACTIVE' ORDER BY name ASC", [tenantId]
  );

  const availableStudents = await all<{ id: string; name: string; email: string }>(
    `SELECT u.id, u.name, u.email FROM users u
     JOIN memberships m ON m.user_id=u.id AND m.tenant_id=? AND m.role='STUDENT' AND m.status='ACTIVE'
     WHERE u.id NOT IN (SELECT user_id FROM exam_access WHERE exam_id=?)
     ORDER BY u.name ASC`,
    [tenantId, examId]
  );

  return (
    <>
      <Card title={`Student Access (${accessList.length})`}>
        {accessList.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No students have access yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Name</th>
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Email</th>
                  {examStatus !== "CLOSED" && <th className="text-left text-xs text-gray-500 uppercase py-2 px-2"></th>}
                </tr>
              </thead>
              <tbody>
                {accessList.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100">
                    <td className="py-2 px-2">{s.student_name}</td>
                    <td className="py-2 px-2 text-gray-500">{s.student_email}</td>
                    {examStatus !== "CLOSED" && (
                      <td className="py-2 px-2">
                        <form action={removeAccessAction}>
                          <input type="hidden" name="exam_id" value={examId} />
                          <input type="hidden" name="access_id" value={s.id} />
                          <button type="submit" className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-lg hover:bg-gray-200">Remove</button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {examStatus !== "CLOSED" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card title="Add by course">
            <form action={addAccessCourseAction}>
              <input type="hidden" name="exam_id" value={examId} />
              <p className="text-xs text-gray-500 mb-2">Add all students enrolled in this exam&apos;s course.</p>
              <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
                Add Course Students
              </button>
            </form>
          </Card>
          <Card title="Add by class">
            <form action={addAccessClassAction}>
              <input type="hidden" name="exam_id" value={examId} />
              <select name="class_id" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2">
                <option value="">— select class —</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
                Add Class
              </button>
            </form>
          </Card>
          <Card title="Add individual">
            <form action={addAccessStudentAction}>
              <input type="hidden" name="exam_id" value={examId} />
              <select name="user_id" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2">
                <option value="">— select student —</option>
                {availableStudents.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.email})</option>)}
              </select>
              <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
                Add Student
              </button>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}

// ============================================================
// Results Tab
// ============================================================

async function ResultsTab({ examId, tenantId, resultsPublished }: { examId: string; tenantId: string; resultsPublished: string | null }) {
  const { all } = getDb();

  const attempts = await all<{
    id: string; student_name: string; attempt_no: number;
    grading_status: string; score_raw: number | null; score_total: number | null;
    score_pct: number | null; grade: string | null; submitted_at: string | null;
  }>(
    `SELECT ea.id, u.name AS student_name, ea.attempt_no,
       ea.grading_status, ea.score_raw, ea.score_total, ea.score_pct,
       ea.grade, ea.submitted_at
     FROM exam_attempts ea JOIN users u ON u.id = ea.user_id
     WHERE ea.exam_id=? AND ea.tenant_id=? AND ea.status='SUBMITTED'
     ORDER BY u.name ASC, ea.attempt_no ASC`,
    [examId, tenantId]
  );

  const released = resultsPublished && Date.parse(resultsPublished) <= Date.now();

  return (
    <>
      {!released && attempts.length > 0 && (
        <Card>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">Results have not been released to students yet.</p>
            <form action={releaseResultsAction}>
              <input type="hidden" name="exam_id" value={examId} />
              <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
                Release Results
              </button>
            </form>
          </div>
        </Card>
      )}
      {released && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-3 text-sm text-green-700">
          Results released on {fmtISO(resultsPublished)}
        </div>
      )}

      <Card title={`Submitted Attempts (${attempts.length})`}>
        {attempts.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No submitted attempts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Student</th>
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Grading</th>
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Score</th>
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">%</th>
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Grade</th>
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Submitted</th>
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.id} className="border-b border-gray-100">
                    <td className="py-2 px-2 font-medium">{a.student_name}</td>
                    <td className="py-2 px-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        a.grading_status === "FULLY_GRADED" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
                      }`}>
                        {a.grading_status === "FULLY_GRADED" ? "Graded" : "Needs Grading"}
                      </span>
                    </td>
                    <td className="py-2 px-2">{a.score_raw !== null ? `${a.score_raw}/${a.score_total}` : "—"}</td>
                    <td className="py-2 px-2">{a.score_pct !== null ? `${Math.round(a.score_pct)}%` : "—"}</td>
                    <td className="py-2 px-2">{a.grade || "—"}</td>
                    <td className="py-2 px-2 text-xs text-gray-400">{fmtISO(a.submitted_at)}</td>
                    <td className="py-2 px-2">
                      <a href={`/exam-grade?attempt_id=${a.id}&exam_id=${examId}`}
                        className="px-2 py-1 bg-teal-700 text-white text-xs font-semibold rounded-lg hover:bg-teal-800 no-underline">
                        {a.grading_status === "AUTO_GRADED" ? "Grade" : "View"}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

// ============================================================
// Approvals Tab — shows gate statuses and submit buttons
// ============================================================

const GATE_TYPES = ["QUESTIONS", "GRADING", "RESULTS"] as const;
const GATE_LABELS: Record<string, string> = {
  QUESTIONS: "Questions Gate",
  GRADING: "Grading Gate",
  RESULTS: "Results Gate",
};
const GATE_DESCS: Record<string, string> = {
  QUESTIONS: "Must be approved before the exam can be published",
  GRADING: "Must be approved before results can be released",
  RESULTS: "Final sign-off before results go live to students",
};

async function ApprovalsTab({ examId, tenantId, userRole }: { examId: string; tenantId: string; userRole: string }) {
  const { all } = getDb();

  // Load all gates and responses for this exam.
  const allGates = await all<{ gate_type: string; user_id: string; approver_name: string }>(
    `SELECT sag.gate_type, sag.user_id, u.name AS approver_name
     FROM sitting_approval_gates sag JOIN users u ON u.id = sag.user_id
     WHERE sag.exam_id=? AND sag.tenant_id=?
     ORDER BY sag.gate_type, u.name ASC`,
    [examId, tenantId]
  );

  const allResponses = await all<{ gate_type: string; approver_id: string; status: string; note: string | null }>(
    "SELECT gate_type, approver_id, status, note FROM sitting_approval_responses WHERE exam_id=? AND tenant_id=?",
    [examId, tenantId]
  );

  const responseMap: Record<string, Record<string, { status: string; note: string | null }>> = {};
  for (const r of allResponses) {
    if (!responseMap[r.gate_type]) responseMap[r.gate_type] = {};
    responseMap[r.gate_type][r.approver_id] = { status: r.status, note: r.note };
  }

  const configuredTypes = [...new Set(allGates.map((g) => g.gate_type))];

  return (
    <>
      {configuredTypes.map((gateType) => {
        const assignees = allGates.filter((g) => g.gate_type === gateType);
        const respForGate = responseMap[gateType] || {};
        const hasAnyResponse = Object.keys(respForGate).length > 0;

        // Calculate overall gate status.
        const allApproved = assignees.length > 0 && assignees.every((a) => respForGate[a.user_id]?.status === "APPROVED");
        const anyRejected = assignees.some((a) => respForGate[a.user_id]?.status === "REJECTED");

        let overallStatus: string;
        let statusStyle: string;
        if (allApproved) { overallStatus = "Approved"; statusStyle = "bg-green-50 text-green-700"; }
        else if (anyRejected) { overallStatus = "Rejected"; statusStyle = "bg-red-50 text-red-700"; }
        else if (hasAnyResponse) { overallStatus = "Awaiting Response"; statusStyle = "bg-gray-100 text-gray-500"; }
        else { overallStatus = "Not Submitted"; statusStyle = "bg-amber-50 text-amber-700"; }

        // Rejection notes.
        const rejections = assignees.filter((a) => respForGate[a.user_id]?.status === "REJECTED" && respForGate[a.user_id]?.note);

        return (
          <Card key={gateType}>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <span className="font-bold text-base">{GATE_LABELS[gateType] || gateType}</span>
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${statusStyle}`}>
                {overallStatus}
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-3">{GATE_DESCS[gateType]}</p>

            {/* Per-approver status */}
            <div className="mb-3">
              {assignees.map((a) => {
                const resp = respForGate[a.user_id];
                const st = resp?.status;
                let badge: { label: string; style: string };
                if (st === "APPROVED") badge = { label: "Approved", style: "text-green-700" };
                else if (st === "REJECTED") badge = { label: "Rejected", style: "text-red-600" };
                else if (hasAnyResponse) badge = { label: "Pending", style: "text-gray-400" };
                else badge = { label: "Not sent", style: "text-gray-300" };

                return (
                  <div key={a.user_id} className="flex items-center justify-between py-1.5 border-b border-gray-100">
                    <span className="text-sm">{a.approver_name}</span>
                    <span className={`text-xs font-semibold ${badge.style}`}>{badge.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Rejection notes */}
            {rejections.map((a) => (
              <div key={a.user_id} className="bg-red-50 border border-red-200 rounded-lg p-3 mb-2 text-sm">
                <strong>{a.approver_name}:</strong> {respForGate[a.user_id]?.note}
              </div>
            ))}

            {/* Submit / resubmit button — teacher only */}
            {userRole === "TEACHER" && (
              <>
                {allApproved ? (
                  <div className="text-sm text-green-700 mt-2">This gate is fully approved. No further action needed.</div>
                ) : hasAnyResponse && !anyRejected ? (
                  <div className="text-sm text-gray-500 mt-2">Submitted — waiting for all approvers to respond.</div>
                ) : (
                  <form action={gateSubmitAction} className="mt-2">
                    <input type="hidden" name="exam_id" value={examId} />
                    <input type="hidden" name="gate_type" value={gateType} />
                    <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
                      {anyRejected ? "Resubmit for Approval" : "Submit for Approval"}
                    </button>
                  </form>
                )}
              </>
            )}
          </Card>
        );
      })}

      {configuredTypes.length === 0 && (
        <Card>
          <p className="text-sm text-gray-400 text-center py-4">No approval gates configured for this exam.</p>
        </Card>
      )}
    </>
  );
}
