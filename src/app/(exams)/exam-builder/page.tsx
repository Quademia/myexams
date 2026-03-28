// src/app/exam-builder/page.tsx
// Exam Builder — the most complex page in the app.
// 6 tabs: Settings, Questions, Publish, Access, Results, Approvals.
//
// This is the server-rendered foundation. Interactive features (dynamic option
// adding, drag-to-reorder) will be added in the client-side interactivity pass.

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership, fmtISO } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { TabNav } from "@/components/ui/TabNav";
import { GradeBandsEditor } from "@/components/exam/GradeBandsEditor";
import { CustomFieldsEditor } from "@/components/exam/CustomFieldsEditor";
import { QuestionFormFields } from "@/components/exam/QuestionFormFields";
import { ResultsTable } from "@/components/exam/ResultsTable";

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

  // Block teachers from saving settings if exam belongs to a sitting.
  const sitting = await first(
    `SELECT 1 FROM exam_sitting_papers esp
     JOIN exam_sittings es ON es.id = esp.sitting_id
     WHERE esp.exam_id=? AND es.tenant_id=?`,
    [examId, active!.tenant_id]
  );
  if (sitting && active!.role === "TEACHER") {
    redirect(`/exam-builder?exam_id=${examId}&tab=settings`);
  }

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

  // Grade bands — delete and reinsert
  await run("DELETE FROM exam_grade_bands WHERE exam_id=?", [examId]);
  const bandLabels = formData.getAll("band_label[]") as string[];
  const bandMins = formData.getAll("band_min[]") as string[];
  for (let i = 0; i < bandLabels.length; i++) {
    const label = (bandLabels[i] || "").trim();
    const minPct = parseFloat(bandMins[i]);
    if (label && !Number.isNaN(minPct)) {
      await run(
        "INSERT INTO exam_grade_bands (id, exam_id, label, min_percent, created_at) VALUES (?,?,?,?,?)",
        [crypto.randomUUID(), examId, label, minPct, now]
      );
    }
  }

  // Custom fields — delete and reinsert
  await run("DELETE FROM exam_custom_fields WHERE exam_id=?", [examId]);
  const cfLabels = formData.getAll("cf_label[]") as string[];
  const cfTypes = formData.getAll("cf_type[]") as string[];
  const cfOptions = formData.getAll("cf_options[]") as string[];
  const cfRequired = formData.getAll("cf_required[]") as string[];
  for (let i = 0; i < cfLabels.length; i++) {
    const label = (cfLabels[i] || "").trim();
    const type = cfTypes[i] || "TEXT";
    if (label) {
      await run(
        "INSERT INTO exam_custom_fields (id, exam_id, field_label, field_type, field_options, is_required, sort_order, created_at) VALUES (?,?,?,?,?,?,?,?)",
        [
          crypto.randomUUID(), examId, label, type,
          type === "DROPDOWN" ? (cfOptions[i] || "").trim() || null : null,
          cfRequired[i] === "1" ? 1 : 0,
          i + 1,
          now
        ]
      );
    }
  }

  redirect(`/exam-builder?exam_id=${examId}&tab=settings`);
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

  // Block teacher if exam belongs to a sitting.
  const sitting = await first(
    `SELECT 1 FROM exam_sitting_papers WHERE exam_id=? LIMIT 1`, [examId]
  );
  if (sitting && active!.role === "TEACHER") redirect(`/exam-builder?exam_id=${examId}&tab=publish`);

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

  // Block teacher if exam belongs to a sitting.
  const sitting = await first(
    `SELECT 1 FROM exam_sitting_papers WHERE exam_id=? LIMIT 1`, [examId]
  );
  if (sitting && active!.role === "TEACHER") redirect(`/exam-builder?exam_id=${examId}&tab=publish`);

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
  const { first, run } = getDb();

  // Block teacher if exam belongs to a sitting.
  const sitting = await first(
    `SELECT 1 FROM exam_sitting_papers WHERE exam_id=? LIMIT 1`, [examId]
  );
  if (sitting && active!.role === "TEACHER") redirect(`/exam-builder?exam_id=${examId}&tab=publish`);

  await run("UPDATE exams SET results_published_at=?, updated_at=? WHERE id=? AND tenant_id=?",
    [new Date().toISOString(), new Date().toISOString(), examId, active!.tenant_id]);
  redirect(`/exam-builder?exam_id=${examId}&tab=publish`);
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
// Question Server Actions
// ============================================================

async function addQuestionAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || (active.role !== "TEACHER" && active.role !== "SCHOOL_ADMIN")) redirect("/");

  const examId = formData.get("exam_id") as string;
  if (!examId) redirect("/teacher");

  const { first, all, run } = getDb();
  const tid = active.tenant_id;
  const userId = auth.user!.id;

  // Verify exam belongs to this tenant.
  const exam = await first<{ id: string; status: string }>(
    "SELECT id, status FROM exams WHERE id=? AND tenant_id=?", [examId, tid]
  );
  if (!exam) redirect("/teacher");
  if (exam.status === "PUBLISHED" || exam.status === "CLOSED") redirect(`/exam-builder?exam_id=${examId}&tab=questions`);

  const qType = (formData.get("question_type") as string) || "MCQ";
  const qText = (formData.get("question_text") as string || "").trim();
  if (!qText) redirect(`/exam-builder?exam_id=${examId}&tab=questions`);

  const marksVal = Math.max(0.5, parseFloat(formData.get("marks") as string) || 1);
  const pm = qType === "MULTIPLE_SELECT" ? (formData.get("partial_marking") === "1" ? 1 : 0) : 0;
  const ma = qType === "SHORT_ANSWER" ? ((formData.get("model_answer") as string || "").trim() || null) : null;
  const fb = (formData.get("feedback") as string || "").trim() || null;
  const now = new Date().toISOString();

  // Sort order: put at the end.
  const lastOrder = await first<{ m: number | null }>(
    "SELECT MAX(sort_order) AS m FROM exam_questions WHERE exam_id=?", [examId]
  );
  const sortOrder = (lastOrder?.m ?? 0) + 1;

  // Auto-save to question bank as PERSONAL.
  const bankId = await saveToBank(null, tid, userId, qType, qText, marksVal, pm, ma, fb, formData, now);

  // Insert exam question.
  const qId = crypto.randomUUID();
  await run(
    `INSERT INTO exam_questions (id, exam_id, tenant_id, question_type, question_text, marks, sort_order, partial_marking, model_answer, feedback, bank_question_id, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [qId, examId, tid, qType, qText, marksVal, sortOrder, pm, ma, fb, bankId, now, now]
  );

  // Insert options.
  await saveQuestionOptions(qId, qType, formData, now);

  redirect(`/exam-builder?exam_id=${examId}&tab=questions`);
}

async function updateQuestionAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || (active.role !== "TEACHER" && active.role !== "SCHOOL_ADMIN")) redirect("/");

  const examId = formData.get("exam_id") as string;
  const questionId = formData.get("question_id") as string;
  if (!examId || !questionId) redirect("/teacher");

  const { first, run } = getDb();
  const tid = active.tenant_id;
  const userId = auth.user!.id;

  const exam = await first<{ id: string; status: string }>(
    "SELECT id, status FROM exams WHERE id=? AND tenant_id=?", [examId, tid]
  );
  if (!exam) redirect("/teacher");
  if (exam.status === "PUBLISHED" || exam.status === "CLOSED") redirect(`/exam-builder?exam_id=${examId}&tab=questions`);

  const qType = (formData.get("question_type") as string) || "MCQ";
  const qText = (formData.get("question_text") as string || "").trim();
  if (!qText) redirect(`/exam-builder?exam_id=${examId}&tab=questions&edit_q=${questionId}`);

  const marksVal = Math.max(0.5, parseFloat(formData.get("marks") as string) || 1);
  const pm = qType === "MULTIPLE_SELECT" ? (formData.get("partial_marking") === "1" ? 1 : 0) : 0;
  const ma = qType === "SHORT_ANSWER" ? ((formData.get("model_answer") as string || "").trim() || null) : null;
  const fb = (formData.get("feedback") as string || "").trim() || null;
  const now = new Date().toISOString();

  // Get existing question's bank link.
  const existingQ = await first<{ bank_question_id: string | null }>(
    "SELECT bank_question_id FROM exam_questions WHERE id=? AND exam_id=?", [questionId, examId]
  );

  // Only sync back to bank if exam is DRAFT.
  let bankId = existingQ?.bank_question_id ?? null;
  if (exam.status === "DRAFT") {
    bankId = await saveToBank(bankId, tid, userId, qType, qText, marksVal, pm, ma, fb, formData, now);
  }

  await run(
    `UPDATE exam_questions SET question_type=?, question_text=?, marks=?, partial_marking=?, model_answer=?, feedback=?, bank_question_id=?, updated_at=?
     WHERE id=? AND exam_id=?`,
    [qType, qText, marksVal, pm, ma, fb, bankId, now, questionId, examId]
  );

  // Delete old options and re-insert.
  await run("DELETE FROM exam_question_options WHERE question_id=?", [questionId]);
  await saveQuestionOptions(questionId, qType, formData, now);

  redirect(`/exam-builder?exam_id=${examId}&tab=questions`);
}

async function deleteQuestionAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || (active.role !== "TEACHER" && active.role !== "SCHOOL_ADMIN")) redirect("/");

  const examId = formData.get("exam_id") as string;
  const questionId = formData.get("question_id") as string;
  if (!examId || !questionId) redirect("/teacher");

  const { first, all, run } = getDb();
  const tid = active.tenant_id;

  const exam = await first<{ id: string }>(
    "SELECT id FROM exams WHERE id=? AND tenant_id=?", [examId, tid]
  );
  if (!exam) redirect("/teacher");

  // Delete options, then the question.
  await run("DELETE FROM exam_question_options WHERE question_id=?", [questionId]);
  await run("DELETE FROM exam_questions WHERE id=? AND exam_id=?", [questionId, examId]);

  // Renumber remaining questions so sort_order stays contiguous (1, 2, 3...).
  const remaining = await all<{ id: string }>(
    "SELECT id FROM exam_questions WHERE exam_id=? ORDER BY sort_order ASC", [examId]
  );
  for (let i = 0; i < remaining.length; i++) {
    await run("UPDATE exam_questions SET sort_order=? WHERE id=?", [i + 1, remaining[i].id]);
  }

  redirect(`/exam-builder?exam_id=${examId}&tab=questions`);
}

async function reorderQuestionAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || (active.role !== "TEACHER" && active.role !== "SCHOOL_ADMIN")) redirect("/");

  const examId = formData.get("exam_id") as string;
  const questionId = formData.get("question_id") as string;
  const direction = formData.get("direction") as string;
  if (!examId || !questionId) redirect("/teacher");

  const { all, first, run } = getDb();
  const tid = active.tenant_id;

  const exam = await first<{ id: string }>(
    "SELECT id FROM exams WHERE id=? AND tenant_id=?", [examId, tid]
  );
  if (!exam) redirect(`/exam-builder?exam_id=${examId}&tab=questions`);

  const questions = await all<{ id: string; sort_order: number }>(
    "SELECT id, sort_order FROM exam_questions WHERE exam_id=? ORDER BY sort_order ASC", [examId]
  );

  const idx = questions.findIndex((q) => q.id === questionId);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;

  if (idx < 0 || swapIdx < 0 || swapIdx >= questions.length) {
    redirect(`/exam-builder?exam_id=${examId}&tab=questions`);
  }

  // Swap sort_order values between the two questions.
  const orderA = questions[idx].sort_order;
  const orderB = questions[swapIdx].sort_order;
  await run("UPDATE exam_questions SET sort_order=? WHERE id=?", [orderB, questions[idx].id]);
  await run("UPDATE exam_questions SET sort_order=? WHERE id=?", [orderA, questions[swapIdx].id]);

  redirect(`/exam-builder?exam_id=${examId}&tab=questions`);
}

// ── Question helper: save to bank ────────────────────────────────────────────
// Saves a question to the question_bank table. If bankId exists and is found
// in the bank, it updates that row. Otherwise it creates a new PERSONAL entry.
// Returns the bank question ID.
async function saveToBank(
  bankId: string | null, tenantId: string, userId: string,
  qType: string, qText: string, marks: number, pm: number,
  ma: string | null, fb: string | null,
  formData: FormData, ts: string
): Promise<string> {
  const { first, run } = getDb();

  if (bankId) {
    const existing = await first<{ id: string }>(
      "SELECT id FROM question_bank WHERE id=? AND tenant_id=?", [bankId, tenantId]
    );
    if (existing) {
      await run(
        `UPDATE question_bank SET question_type=?, question_text=?, marks=?, partial_marking=?, model_answer=?, feedback=?, updated_at=?
         WHERE id=?`,
        [qType, qText, marks, pm, ma, fb, ts, bankId]
      );
      await run("DELETE FROM question_bank_options WHERE bank_question_id=?", [bankId]);
      await saveBankOptions(bankId, qType, formData, ts);
      return bankId;
    }
  }

  // Create new bank entry.
  const newId = crypto.randomUUID();
  await run(
    `INSERT INTO question_bank (id, tenant_id, created_by, question_type, question_text, marks, partial_marking, model_answer, feedback, visibility, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [newId, tenantId, userId, qType, qText, marks, pm, ma, fb, "PERSONAL", ts, ts]
  );
  await saveBankOptions(newId, qType, formData, ts);
  return newId;
}

// ── Question helper: save bank options ───────────────────────────────────────
async function saveBankOptions(bankQId: string, qType: string, formData: FormData, ts: string) {
  const { run } = getDb();

  if (qType === "TRUE_FALSE") {
    const tfCorrect = formData.get("tf_correct") as string;
    await run(
      "INSERT INTO question_bank_options (id, bank_question_id, option_text, is_correct, sort_order, created_at) VALUES (?,?,?,?,?,?)",
      [crypto.randomUUID(), bankQId, "True", tfCorrect === "True" ? 1 : 0, 1, ts]
    );
    await run(
      "INSERT INTO question_bank_options (id, bank_question_id, option_text, is_correct, sort_order, created_at) VALUES (?,?,?,?,?,?)",
      [crypto.randomUUID(), bankQId, "False", tfCorrect === "False" ? 1 : 0, 2, ts]
    );
    return;
  }

  if (qType === "MCQ" || qType === "MULTIPLE_SELECT") {
    const texts = formData.getAll("opt_text[]") as string[];
    const correctIndices = new Set(
      (formData.getAll("opt_correct[]") as string[]).map((v) => parseInt(v, 10))
    );
    const feedbacks = formData.getAll("opt_feedback[]") as string[];
    let sortOrder = 1;
    for (let i = 0; i < texts.length; i++) {
      const text = (texts[i] || "").trim();
      if (!text) continue;
      await run(
        "INSERT INTO question_bank_options (id, bank_question_id, option_text, is_correct, feedback, sort_order, created_at) VALUES (?,?,?,?,?,?,?)",
        [crypto.randomUUID(), bankQId, text, correctIndices.has(i) ? 1 : 0, (feedbacks[i] || "").trim() || null, sortOrder, ts]
      );
      sortOrder++;
    }
  }
  // SHORT_ANSWER and ESSAY have no options.
}

// ── Question helper: save exam question options ──────────────────────────────
async function saveQuestionOptions(qId: string, qType: string, formData: FormData, ts: string) {
  const { run } = getDb();

  if (qType === "TRUE_FALSE") {
    const tfCorrect = formData.get("tf_correct") as string;
    await run(
      "INSERT INTO exam_question_options (id, question_id, option_text, is_correct, sort_order, created_at) VALUES (?,?,?,?,?,?)",
      [crypto.randomUUID(), qId, "True", tfCorrect === "True" ? 1 : 0, 1, ts]
    );
    await run(
      "INSERT INTO exam_question_options (id, question_id, option_text, is_correct, sort_order, created_at) VALUES (?,?,?,?,?,?)",
      [crypto.randomUUID(), qId, "False", tfCorrect === "False" ? 1 : 0, 2, ts]
    );
    return;
  }

  if (qType === "MCQ" || qType === "MULTIPLE_SELECT") {
    const texts = formData.getAll("opt_text[]") as string[];
    const correctIndices = new Set(
      (formData.getAll("opt_correct[]") as string[]).map((v) => parseInt(v, 10))
    );
    const feedbacks = formData.getAll("opt_feedback[]") as string[];
    let sortOrder = 1;
    for (let i = 0; i < texts.length; i++) {
      const text = (texts[i] || "").trim();
      if (!text) continue;
      await run(
        "INSERT INTO exam_question_options (id, question_id, option_text, is_correct, feedback, sort_order, created_at) VALUES (?,?,?,?,?,?,?)",
        [crypto.randomUUID(), qId, text, correctIndices.has(i) ? 1 : 0, (feedbacks[i] || "").trim() || null, sortOrder, ts]
      );
      sortOrder++;
    }
  }
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
    results_published_at: string | null; results_release_policy: string | null;
    late_submission_policy: string | null; closed_at: string | null;
    published_at: string | null;
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

  // Sitting lock — teachers can't edit settings/publish if exam belongs to a sitting.
  const sittingForExam = await first<{ sitting_title: string }>(
    `SELECT es.title AS sitting_title
     FROM exam_sitting_papers esp
     JOIN exam_sittings es ON es.id = esp.sitting_id
     WHERE esp.exam_id=? AND es.tenant_id=?
     LIMIT 1`,
    [examId, tid]
  );
  const sittingLocked = !!sittingForExam && active?.role === "TEACHER";

  const locked = exam.status === "PUBLISHED" || exam.status === "CLOSED";
  const base = `/exam-builder?exam_id=${examId}`;

  // Question count + total marks for publish tab summary.
  const qStats = await first<{ c: number; total_marks: number }>(
    "SELECT COUNT(*) AS c, COALESCE(SUM(marks),0) AS total_marks FROM exam_questions WHERE exam_id=? AND tenant_id=?",
    [examId, tid]
  );
  const questionCount = Number(qStats?.c ?? 0);
  const totalMarks = Number(qStats?.total_marks ?? 0);

  // Gate statuses for publish tab gate checks.
  const gateStatuses = Object.fromEntries(
    (await all<{ gate_type: string; status: string }>(
      `SELECT gate_type,
         CASE
           WHEN COUNT(*) = 0 THEN 'NOT_CONFIGURED'
           WHEN SUM(CASE WHEN status='APPROVED' THEN 1 ELSE 0 END) = COUNT(*) THEN 'APPROVED'
           WHEN SUM(CASE WHEN status='REJECTED' THEN 1 ELSE 0 END) > 0 THEN 'REJECTED'
           ELSE 'PENDING'
         END AS status
       FROM sitting_approval_responses
       WHERE exam_id=? AND tenant_id=?
       GROUP BY gate_type`,
      [examId, tid]
    )).map(r => [r.gate_type, r.status])
  );
  const getGateStatus = (g: string) => gateStatuses[g] ?? "NOT_CONFIGURED";

  // Grade bands and custom fields for settings + publish summary.
  const bands = await all<{ id: string; label: string; min_percent: number }>(
    "SELECT id, label, min_percent FROM exam_grade_bands WHERE exam_id=? ORDER BY min_percent DESC",
    [examId]
  );
  const customFields = await all<{ id: string; field_label: string; field_type: string; field_options: string | null; is_required: number }>(
    "SELECT id, field_label, field_type, field_options, is_required FROM exam_custom_fields WHERE exam_id=? ORDER BY sort_order ASC",
    [examId]
  );

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
        <>
          {locked && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg p-3 mb-3">
              This exam is {exam.status.toLowerCase()} — settings are locked.
            </div>
          )}
          {sittingLocked && (
            <div className="bg-gray-50 border border-gray-200 text-gray-500 text-sm rounded-lg p-3 mb-3">
              🔒 This exam belongs to <strong>{sittingForExam!.sitting_title}</strong>. Settings are managed by the sitting admin.
            </div>
          )}
          <form action={saveSettingsAction}>
            <input type="hidden" name="exam_id" value={exam.id} />
            <fieldset disabled={locked || sittingLocked} className="border-none p-0 m-0">

              {/* Section 1 — Basic Info */}
              <Card title="Basic Info">
                <label className="block text-sm font-medium mb-1">Title</label>
                <input name="title" defaultValue={exam.title} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />
                <label className="block text-sm font-medium mb-1">Instructions <span className="font-normal text-gray-400">— shown to student before timer starts</span></label>
                <textarea name="description" rows={3} defaultValue={exam.description || ""} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Duration (mins)</label>
                    <input name="duration_mins" type="number" min={1} defaultValue={exam.duration_mins || 60} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Max attempts</label>
                    <input name="max_attempts" type="number" min={1} defaultValue={exam.max_attempts} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                </div>
              </Card>

              {/* Section 2 — Schedule */}
              <Card title="Schedule">
                <p className="text-xs text-gray-400 mb-3">Optional — leave blank to open immediately and close manually.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Opens at</label>
                    <input name="starts_at" type="datetime-local" defaultValue={exam.starts_at?.slice(0, 16) || ""} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Closes at</label>
                    <input name="ends_at" id="ends_at_input" type="datetime-local" defaultValue={exam.ends_at?.slice(0, 16) || ""} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                </div>
                <div id="late-policy-wrap" style={!exam.ends_at ? { display: "none" } : undefined}>
                  <label className="block text-sm font-medium mb-1">Late submission policy</label>
                  <select name="late_submission_policy" defaultValue={(exam as any).late_submission_policy || "HARD_CUT"} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="HARD_CUT">Hard cut (no late submissions)</option>
                    <option value="ALLOW_DURATION">Allow — student keeps full duration after start</option>
                  </select>
                </div>
              </Card>

              {/* Section 3 — Security */}
              <Card title="Security">
                <label className="block text-sm font-medium mb-1">Exam password <span className="font-normal text-gray-400">(optional)</span></label>
                <input name="exam_password" autoComplete="off" defaultValue={exam.exam_password || ""} placeholder="Leave blank for no password" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </Card>

              {/* Section 4 — Exam Behaviour */}
              <Card title="Exam Behaviour">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium">Shuffle questions</div>
                      <div className="text-xs text-gray-400">Each student sees questions in a different random order</div>
                    </div>
                    <select name="shuffle_questions" defaultValue={String(exam.shuffle_questions)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-24 flex-shrink-0">
                      <option value="0">No</option>
                      <option value="1">Yes</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium">Shuffle answer options</div>
                      <div className="text-xs text-gray-400">For MCQ questions, randomise the order of options</div>
                    </div>
                    <select name="shuffle_options" defaultValue={String((exam as any).shuffle_options ?? 0)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-24 flex-shrink-0">
                      <option value="0">No</option>
                      <option value="1">Yes</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium">Show question marks during exam</div>
                      <div className="text-xs text-gray-400">Students can see how many marks each question is worth</div>
                    </div>
                    <select name="show_marks_during" defaultValue={String((exam as any).show_marks_during ?? 0)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-24 flex-shrink-0">
                      <option value="0">No</option>
                      <option value="1">Yes</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium">Allow review after submission</div>
                      <div className="text-xs text-gray-400">After submitting, students can re-read questions and see correct answers</div>
                    </div>
                    <select name="allow_review" defaultValue={String(exam.allow_review)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-24 flex-shrink-0">
                      <option value="1">Yes</option>
                      <option value="0">No</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium">Question navigation</div>
                    </div>
                    <select name="navigation_mode" defaultValue={(exam as any).navigation_mode || "FREE"} className="px-3 py-2 border border-gray-300 rounded-lg text-sm flex-shrink-0">
                      <option value="FREE">Free — student can jump between any questions</option>
                      <option value="SEQUENTIAL">Sequential — must answer in order, cannot go back</option>
                    </select>
                  </div>
                </div>
              </Card>

              {/* Section 5 — Results & Grading */}
              <Card title="Results &amp; Grading">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Results release</label>
                    <select name="results_release_policy" defaultValue={(exam as any).results_release_policy || "MANUAL"} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                      <option value="MANUAL">Manual (release when ready)</option>
                      <option value="IMMEDIATE">Immediate (on publish)</option>
                      <option value="AFTER_CLOSE">After exam closes</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Score display</label>
                    <select name="score_display" defaultValue={exam.score_display} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                      <option value="BOTH">Raw score and percentage</option>
                      <option value="RAW">Raw score only</option>
                      <option value="PERCENT">Percentage only</option>
                      <option value="PASS_FAIL">Pass / Fail only</option>
                      <option value="HIDDEN">Hidden — student sees no score</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Pass mark %</label>
                    <input name="pass_mark_percent" type="number" min={0} max={100} defaultValue={exam.pass_mark_percent ?? ""} placeholder="Leave blank for no pass mark" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                </div>
              </Card>

              {/* Section 6 — Grade Bands */}
              <Card title="Grade Bands (optional)">
                <p className="text-xs text-gray-400 mb-3">Example: Distinction = 75%+, Credit = 65%+, Pass = 50%+</p>
                <GradeBandsEditor initialBands={bands} />
              </Card>

              {/* Section 7 — Custom Fields */}
              <Card title="Custom Fields (optional)">
                <p className="text-xs text-gray-400 mb-3">Students fill these in before starting the exam. Use for things like: Index Number, Seat Number.</p>
                <CustomFieldsEditor initialFields={customFields} />
              </Card>

            </fieldset>
            {!locked && !sittingLocked && (
              <div className="mt-3">
                <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
                  Save Settings
                </button>
              </div>
            )}
          </form>
        </>
      )}

      {/* Questions Tab */}
      {tab === "questions" && <QuestionsTab examId={exam.id} locked={locked} editQId={params.edit_q} />}

      {/* Publish Tab — 3 always-visible sections */}
      {tab === "publish" && (
        <>
          {/* Section 1 — Publish Exam */}
          <Card title="Publish Exam">
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-gray-100"><td className="py-1.5 pr-4 text-gray-500 w-44">Questions</td><td className="py-1.5">{questionCount} questions — {totalMarks} marks</td></tr>
                  <tr className="border-b border-gray-100"><td className="py-1.5 pr-4 text-gray-500">Duration</td><td className="py-1.5">{exam.duration_mins ?? 60} mins</td></tr>
                  <tr className="border-b border-gray-100"><td className="py-1.5 pr-4 text-gray-500">Max attempts</td><td className="py-1.5">{exam.max_attempts}</td></tr>
                  <tr className="border-b border-gray-100"><td className="py-1.5 pr-4 text-gray-500">Opens at</td><td className="py-1.5">{exam.starts_at ? fmtISO(exam.starts_at) : "—"}</td></tr>
                  <tr className="border-b border-gray-100"><td className="py-1.5 pr-4 text-gray-500">Closes at</td><td className="py-1.5">{exam.ends_at ? fmtISO(exam.ends_at) : "—"}</td></tr>
                  <tr className="border-b border-gray-100"><td className="py-1.5 pr-4 text-gray-500">Late submission</td><td className="py-1.5">{(exam as any).late_submission_policy || "—"}</td></tr>
                  <tr className="border-b border-gray-100"><td className="py-1.5 pr-4 text-gray-500">Exam password</td><td className="py-1.5">{exam.exam_password || "None"}</td></tr>
                  <tr className="border-b border-gray-100"><td className="py-1.5 pr-4 text-gray-500">Score display</td><td className="py-1.5">{exam.score_display}</td></tr>
                  <tr className="border-b border-gray-100"><td className="py-1.5 pr-4 text-gray-500">Pass mark %</td><td className="py-1.5">{exam.pass_mark_percent != null ? `${exam.pass_mark_percent}%` : "—"}</td></tr>
                  <tr className="border-b border-gray-100"><td className="py-1.5 text-gray-400 w-40 text-sm">Shuffle questions</td><td className="py-1.5 text-sm">{exam.shuffle_questions ? "Yes" : "No"}</td></tr>
                  <tr className="border-b border-gray-100"><td className="py-1.5 text-gray-400 w-40 text-sm">Shuffle options</td><td className="py-1.5 text-sm">{(exam as any).shuffle_options ? "Yes" : "No"}</td></tr>
                  <tr className="border-b border-gray-100"><td className="py-1.5 text-gray-400 w-40 text-sm">Show marks during</td><td className="py-1.5 text-sm">{(exam as any).show_marks_during ? "Yes" : "No"}</td></tr>
                  <tr className="border-b border-gray-100"><td className="py-1.5 text-gray-400 w-40 text-sm">Allow review</td><td className="py-1.5 text-sm">{exam.allow_review ? "Yes" : "No"}</td></tr>
                  <tr className="border-b border-gray-100"><td className="py-1.5 text-gray-400 w-40 text-sm">Navigation mode</td><td className="py-1.5 text-sm">{(exam as any).navigation_mode || "FREE"}</td></tr>
                  <tr className="border-b border-gray-100"><td className="py-1.5 text-gray-400 w-40 text-sm">Grade bands</td><td className="py-1.5 text-sm">{bands.length > 0 ? `${bands.length} band${bands.length !== 1 ? "s" : ""}` : <span className="text-gray-300">None</span>}</td></tr>
                  <tr className="border-b border-gray-100"><td className="py-1.5 text-gray-400 w-40 text-sm">Custom fields</td><td className="py-1.5 text-sm">{customFields.length > 0 ? `${customFields.length} field${customFields.length !== 1 ? "s" : ""}` : <span className="text-gray-300">None</span>}</td></tr>
                </tbody>
              </table>
            </div>

            {sittingLocked ? (
              <>
                <div className="bg-gray-50 border border-gray-200 text-gray-500 text-sm rounded-lg p-3 mb-3">
                  🔒 This exam belongs to <strong>{sittingForExam!.sitting_title}</strong>. Publishing is managed by the sitting admin.
                </div>
                <button disabled className="px-4 py-2 bg-gray-200 text-gray-400 text-sm font-semibold rounded-lg cursor-not-allowed">Publish Exam</button>
              </>
            ) : exam.status !== "DRAFT" ? (
              <>
                <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg p-3 mb-3">
                  ✅ {(exam as any).published_at ? `Published on ${fmtISO((exam as any).published_at)}` : "This exam has been published."}
                </div>
                <button disabled className="px-4 py-2 bg-gray-200 text-gray-400 text-sm font-semibold rounded-lg cursor-not-allowed">Publish Exam</button>
              </>
            ) : questionCount === 0 ? (
              <>
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg p-3 mb-3">
                  ⚠️ Add at least one question before publishing.
                </div>
                <button disabled className="px-4 py-2 bg-gray-200 text-gray-400 text-sm font-semibold rounded-lg cursor-not-allowed">Publish Exam</button>
              </>
            ) : active?.role === "SCHOOL_ADMIN" && getGateStatus("QUESTIONS") !== "APPROVED" && getGateStatus("QUESTIONS") !== "NOT_CONFIGURED" ? (
              <>
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg p-3 mb-3">
                  ⚠️ Questions approval required before publishing.
                </div>
                <button disabled className="px-4 py-2 bg-gray-200 text-gray-400 text-sm font-semibold rounded-lg cursor-not-allowed">Publish Exam</button>
              </>
            ) : (
              <form action={publishAction}>
                <input type="hidden" name="exam_id" value={exam.id} />
                <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
                  Publish Exam
                </button>
              </form>
            )}
          </Card>

          {/* Section 2 — Close Exam */}
          <Card title="Close Exam">
            <div className="text-sm text-gray-500 mb-3">
              {exam.status === "CLOSED" && (exam as any).closed_at ? (
                <span>📅 Closed on: {fmtISO((exam as any).closed_at)}</span>
              ) : exam.status === "PUBLISHED" && exam.ends_at && new Date(exam.ends_at) > new Date() ? (
                <span>📅 Scheduled to close: {fmtISO(exam.ends_at)}</span>
              ) : exam.status === "PUBLISHED" && exam.ends_at && new Date(exam.ends_at) <= new Date() ? (
                <span>📅 Scheduled close date passed: {fmtISO(exam.ends_at)}</span>
              ) : exam.status === "PUBLISHED" ? (
                <span>📅 No automatic close date set</span>
              ) : null}
            </div>

            {sittingLocked ? (
              <>
                <div className="bg-gray-50 border border-gray-200 text-gray-500 text-sm rounded-lg p-3 mb-3">
                  🔒 This exam belongs to <strong>{sittingForExam!.sitting_title}</strong>. Closing is managed by the sitting admin.
                </div>
                <button disabled className="px-4 py-2 bg-gray-200 text-gray-400 text-sm font-semibold rounded-lg cursor-not-allowed">Close Exam</button>
              </>
            ) : exam.status === "DRAFT" ? (
              <>
                <p className="text-sm text-gray-500 mb-3">Publish the exam first.</p>
                <button disabled className="px-4 py-2 bg-gray-200 text-gray-400 text-sm font-semibold rounded-lg cursor-not-allowed">Close Exam</button>
              </>
            ) : exam.status === "CLOSED" ? (
              <>
                <p className="text-sm text-gray-500 mb-3">This exam is already closed.</p>
                <button disabled className="px-4 py-2 bg-gray-200 text-gray-400 text-sm font-semibold rounded-lg cursor-not-allowed">Close Exam</button>
              </>
            ) : exam.status === "PUBLISHED" && exam.ends_at && new Date(exam.ends_at) > new Date() ? (
              <>
                <p className="text-sm text-gray-500 mb-3">Exam is scheduled to close automatically on {fmtISO(exam.ends_at)}.</p>
                <button disabled className="px-4 py-2 bg-gray-200 text-gray-400 text-sm font-semibold rounded-lg cursor-not-allowed">Close Exam</button>
              </>
            ) : exam.status === "PUBLISHED" && exam.ends_at && new Date(exam.ends_at) <= new Date() ? (
              <>
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg p-3 mb-3">
                  ⚠️ Your scheduled close date has passed.
                </div>
                <form action={closeAction}>
                  <input type="hidden" name="exam_id" value={exam.id} />
                  <button type="submit" className="px-4 py-2 bg-red-50 text-red-700 text-sm font-semibold rounded-lg hover:bg-red-100">
                    Close Exam Now
                  </button>
                </form>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-500 mb-3">No automatic close date is set.</p>
                <form action={closeAction}>
                  <input type="hidden" name="exam_id" value={exam.id} />
                  <button type="submit" className="px-4 py-2 bg-red-50 text-red-700 text-sm font-semibold rounded-lg hover:bg-red-100">
                    Close Exam Now
                  </button>
                </form>
              </>
            )}
          </Card>

          {/* Section 3 — Release Results */}
          <Card title="Release Results">
            <div className="text-sm text-gray-500 mb-3">
              {(exam as any).results_release_policy === "IMMEDIATE" ? (
                <span>📅 Auto-releases on publish</span>
              ) : (exam as any).results_release_policy === "AFTER_CLOSE" ? (
                <span>📅 Auto-releases when exam closes</span>
              ) : exam.results_published_at ? (
                <span>📅 Released on: {fmtISO(exam.results_published_at)}</span>
              ) : (
                <span>📅 Not yet released</span>
              )}
            </div>

            {sittingLocked ? (
              <>
                <div className="bg-gray-50 border border-gray-200 text-gray-500 text-sm rounded-lg p-3 mb-3">
                  🔒 This exam belongs to <strong>{sittingForExam!.sitting_title}</strong>. Results release is managed by the sitting admin.
                </div>
                <button disabled className="px-4 py-2 bg-gray-200 text-gray-400 text-sm font-semibold rounded-lg cursor-not-allowed">Release Results</button>
              </>
            ) : exam.status !== "CLOSED" ? (
              <>
                <p className="text-sm text-gray-500 mb-3">Close the exam first before releasing results.</p>
                <button disabled className="px-4 py-2 bg-gray-200 text-gray-400 text-sm font-semibold rounded-lg cursor-not-allowed">Release Results</button>
              </>
            ) : (exam as any).results_release_policy === "IMMEDIATE" ? (
              <>
                <p className="text-sm text-gray-500 mb-3">Results release automatically on publish (IMMEDIATE policy).</p>
                <button disabled className="px-4 py-2 bg-gray-200 text-gray-400 text-sm font-semibold rounded-lg cursor-not-allowed">Release Results</button>
              </>
            ) : (exam as any).results_release_policy === "AFTER_CLOSE" ? (
              <>
                <p className="text-sm text-gray-500 mb-3">Results release automatically when exam closes (AFTER_CLOSE policy).</p>
                <button disabled className="px-4 py-2 bg-gray-200 text-gray-400 text-sm font-semibold rounded-lg cursor-not-allowed">Release Results</button>
              </>
            ) : exam.results_published_at ? (
              <>
                <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg p-3 mb-3">
                  ✅ Results already released on {fmtISO(exam.results_published_at)}.
                </div>
                <button disabled className="px-4 py-2 bg-gray-200 text-gray-400 text-sm font-semibold rounded-lg cursor-not-allowed">Release Results</button>
              </>
            ) : active?.role === "SCHOOL_ADMIN" && getGateStatus("GRADING") !== "APPROVED" && getGateStatus("GRADING") !== "NOT_CONFIGURED" ? (
              <>
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg p-3 mb-3">
                  ⚠️ Grading approval required before releasing results.
                </div>
                <button disabled className="px-4 py-2 bg-gray-200 text-gray-400 text-sm font-semibold rounded-lg cursor-not-allowed">Release Results</button>
              </>
            ) : active?.role === "SCHOOL_ADMIN" && getGateStatus("RESULTS") !== "APPROVED" && getGateStatus("RESULTS") !== "NOT_CONFIGURED" ? (
              <>
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg p-3 mb-3">
                  ⚠️ Results approval required before releasing results.
                </div>
                <button disabled className="px-4 py-2 bg-gray-200 text-gray-400 text-sm font-semibold rounded-lg cursor-not-allowed">Release Results</button>
              </>
            ) : (
              <form action={releaseResultsAction}>
                <input type="hidden" name="exam_id" value={exam.id} />
                <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
                  Release Results Now
                </button>
              </form>
            )}
          </Card>
        </>
      )}

      {/* Access Tab */}
      {tab === "access" && <AccessTab examId={exam.id} courseId={exam.course_id} tenantId={tid} examStatus={exam.status} />}

      {/* Results Tab */}
      {tab === "results" && <ResultsTab examId={exam.id} tenantId={tid} resultsPublished={exam.results_published_at} maxAttempts={exam.max_attempts} passMarkPercent={exam.pass_mark_percent} />}

      {/* Approvals Tab */}
      {tab === "approvals" && hasGates && <ApprovalsTab examId={exam.id} tenantId={tid} userRole={active?.role || "SCHOOL_ADMIN"} />}
    </main>
  );
}

// ============================================================
// Questions Tab
// ============================================================

// Badge colours per question type — keeps the question list visually scannable.
const qTypeBadge = (t: string) => {
  if (t === "MCQ") return "bg-blue-50 text-blue-700";
  if (t === "MULTIPLE_SELECT") return "bg-purple-50 text-purple-700";
  if (t === "TRUE_FALSE") return "bg-green-50 text-green-700";
  if (t === "SHORT_ANSWER") return "bg-orange-50 text-orange-700";
  if (t === "ESSAY") return "bg-red-50 text-red-700";
  return "bg-gray-100 text-gray-600";
};

async function QuestionsTab({ examId, locked, editQId }: { examId: string; locked: boolean; editQId?: string }) {
  const { all } = getDb();

  // Load all questions for this exam, ordered by their sort position.
  const questions = await all<{
    id: string; question_type: string; question_text: string; marks: number;
    sort_order: number; partial_marking: number; model_answer: string | null;
    feedback: string | null; bank_question_id: string | null;
  }>(
    "SELECT id, question_type, question_text, marks, sort_order, partial_marking, model_answer, feedback, bank_question_id FROM exam_questions WHERE exam_id=? ORDER BY sort_order ASC",
    [examId]
  );

  // Load options for all questions in one go (more efficient than per-question queries).
  const qIds = questions.map((q) => q.id);
  let optionsMap: Record<string, { id: string; option_text: string; is_correct: number; feedback: string | null; sort_order: number }[]> = {};
  if (qIds.length > 0) {
    const placeholders = qIds.map(() => "?").join(",");
    const allOpts = await all<{
      id: string; question_id: string; option_text: string; is_correct: number; feedback: string | null; sort_order: number;
    }>(
      `SELECT id, question_id, option_text, is_correct, feedback, sort_order FROM exam_question_options WHERE question_id IN (${placeholders}) ORDER BY sort_order ASC`,
      qIds
    );
    for (const opt of allOpts) {
      if (!optionsMap[opt.question_id]) optionsMap[opt.question_id] = [];
      optionsMap[opt.question_id].push(opt);
    }
  }

  // Calculate summary stats for the header.
  const totalMarks = questions.reduce((sum, q) => sum + Number(q.marks), 0);

  // If editing, find the question to pre-fill the form.
  const editQ = editQId ? questions.find((q) => q.id === editQId) : null;
  const editOpts = editQ ? (optionsMap[editQ.id] || []) : [];

  return (
    <>
      {/* Header card */}
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-bold">Questions</h2>
            <p className="text-sm text-gray-500">
              {questions.length} question{questions.length !== 1 ? "s" : ""} &middot; {totalMarks} mark{totalMarks !== 1 ? "s" : ""} total
            </p>
          </div>
          {!locked && (
            <a
              href={`/exam-bank-picker?exam_id=${examId}`}
              className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 no-underline"
            >
              📚 Add from bank
            </a>
          )}
        </div>
      </Card>

      {/* Locked banner */}
      {locked && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg p-3 mb-3">
          🔒 This exam is published — questions are locked and cannot be edited.
        </div>
      )}

      {/* Question list */}
      {questions.length === 0 && !locked && (
        <Card>
          <div className="text-center py-6">
            <p className="text-sm text-gray-500">
              No questions yet — add your first question below, or pick from your question bank.
            </p>
          </div>
        </Card>
      )}

      {questions.map((q, idx) => {
        const opts = optionsMap[q.id] || [];
        return (
          <Card key={q.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                {/* Question number, type badge, marks */}
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-sm font-bold text-gray-700">Q{idx + 1}</span>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${qTypeBadge(q.question_type)}`}>
                    {qTypeLabel(q.question_type)}
                  </span>
                  <span className="text-xs text-gray-400">{q.marks} {Number(q.marks) === 1 ? "mark" : "marks"}</span>
                  {q.bank_question_id && (
                    <span className="inline-block px-2 py-0.5 bg-teal-50 text-teal-700 rounded-full text-xs font-semibold">📚 From bank</span>
                  )}
                  {q.partial_marking === 1 && (
                    <span className="inline-block px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs">Partial marking</span>
                  )}
                </div>

                {/* Question text */}
                <p className="text-sm text-gray-800 mb-2">{q.question_text}</p>

                {/* Options preview for MCQ / TRUE_FALSE / MULTIPLE_SELECT */}
                {(q.question_type === "MCQ" || q.question_type === "TRUE_FALSE" || q.question_type === "MULTIPLE_SELECT") && opts.length > 0 && (
                  <ul className="text-xs text-gray-500 space-y-0.5 pl-1">
                    {opts.map((opt) => (
                      <li key={opt.id}>
                        {opt.is_correct ? "✓" : "○"} {opt.option_text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Action buttons (only if not locked) */}
              {!locked && (
                <div className="flex flex-col gap-1 shrink-0">
                  {/* Move up */}
                  <form action={reorderQuestionAction}>
                    <input type="hidden" name="exam_id" value={examId} />
                    <input type="hidden" name="question_id" value={q.id} />
                    <input type="hidden" name="direction" value="up" />
                    <button type="submit" disabled={idx === 0} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded hover:bg-gray-200 disabled:opacity-30" title="Move up">↑</button>
                  </form>
                  {/* Move down */}
                  <form action={reorderQuestionAction}>
                    <input type="hidden" name="exam_id" value={examId} />
                    <input type="hidden" name="question_id" value={q.id} />
                    <input type="hidden" name="direction" value="down" />
                    <button type="submit" disabled={idx === questions.length - 1} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded hover:bg-gray-200 disabled:opacity-30" title="Move down">↓</button>
                  </form>
                  {/* Edit */}
                  <a href={`/exam-builder?exam_id=${examId}&tab=questions&edit_q=${q.id}`} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded hover:bg-gray-200 text-center no-underline">Edit</a>
                  {/* Delete */}
                  <form action={deleteQuestionAction}>
                    <input type="hidden" name="exam_id" value={examId} />
                    <input type="hidden" name="question_id" value={q.id} />
                    <button type="submit" className="px-2 py-1 bg-red-50 text-red-600 text-xs rounded hover:bg-red-100 w-full">Delete</button>
                  </form>
                </div>
              )}
            </div>
          </Card>
        );
      })}

      {/* Add / Edit form (only when exam is not locked) */}
      {!locked && (
        <Card title={editQ ? `Edit Question Q${questions.findIndex((q) => q.id === editQId) + 1}` : "Add Question"}>
          <form action={editQ ? updateQuestionAction : addQuestionAction}>
            <QuestionFormFields
              questionType={editQ?.question_type || "MCQ"}
              options={editOpts.map((o) => ({
                text: o.option_text,
                isCorrect: o.is_correct === 1,
                feedback: o.feedback || "",
              }))}
              tfCorrect={
                editQ?.question_type === "TRUE_FALSE"
                  ? (editOpts.find((o) => o.is_correct === 1)?.option_text || "")
                  : ""
              }
              modelAnswer={editQ?.model_answer || ""}
              feedback={editQ?.feedback || ""}
              questionText={editQ?.question_text || ""}
              marks={editQ?.marks ?? 1}
              partialMarking={editQ?.partial_marking === 1}
              isEdit={!!editQ}
              questionId={editQ?.id || ""}
              examId={examId}
            />
          </form>
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
     FROM exam_access ea JOIN qa_users u ON u.id = ea.user_id
     WHERE ea.exam_id=? ORDER BY u.name ASC`,
    [examId]
  );

  const classes = await all<{ id: string; name: string }>(
    "SELECT id, name FROM classes WHERE tenant_id=? AND status='ACTIVE' ORDER BY name ASC", [tenantId]
  );

  const availableStudents = await all<{ id: string; name: string; email: string }>(
    `SELECT u.id, u.name, u.email FROM qa_users u
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

async function ResultsTab({ examId, tenantId, resultsPublished, maxAttempts, passMarkPercent }: {
  examId: string; tenantId: string; resultsPublished: string | null;
  maxAttempts: number; passMarkPercent: number | null;
}) {
  const { all, first } = getDb();

  // Fetch submitted attempts, in-progress count, custom field defs, and grade bands in parallel.
  const [attempts, inProgressRow, customFieldDefs, gradeBands] = await Promise.all([
    all<{
      id: string; user_id: string; student_name: string; attempt_no: number;
      grading_status: string; score_raw: number | null; score_total: number | null;
      score_pct: number | null; grade: string | null; pass_mark_percent: number | null;
      started_at: string | null; submitted_at: string | null;
      time_taken_secs: number | null; custom_fields_json: string | null;
    }>(
      `SELECT ea.id, ea.user_id, u.name AS student_name, ea.attempt_no,
         ea.grading_status, ea.score_raw, ea.score_total, ea.score_pct,
         ea.grade, ea.pass_mark_percent, ea.started_at, ea.submitted_at,
         ea.time_taken_secs, ea.custom_fields_json
       FROM exam_attempts ea
       JOIN qa_users u ON u.id = ea.user_id
       WHERE ea.exam_id=? AND ea.tenant_id=? AND ea.status='SUBMITTED'
       ORDER BY u.name ASC, ea.attempt_no ASC`,
      [examId, tenantId]
    ),
    first<{ c: number }>(
      `SELECT COUNT(*) AS c FROM exam_attempts
       WHERE exam_id=? AND tenant_id=? AND status='IN_PROGRESS'`,
      [examId, tenantId]
    ),
    all<{ id: string; field_label: string }>(
      `SELECT id, field_label FROM exam_custom_fields
       WHERE exam_id=? ORDER BY sort_order ASC`,
      [examId]
    ),
    all<{ label: string; min_percent: number }>(
      `SELECT label, min_percent FROM exam_grade_bands
       WHERE exam_id=? ORDER BY min_percent DESC`,
      [examId]
    ),
  ]);

  const inProgressCount = Number(inProgressRow?.c ?? 0);
  const needsGradingCount = attempts.filter((a) => a.grading_status === "AUTO_GRADED").length;
  const avgScore = attempts.length > 0
    ? Math.round(attempts.reduce((sum, a) => sum + (a.score_pct ?? 0), 0) / attempts.length)
    : null;

  // Build serialisable row objects for the client component.
  const rows = attempts.map((a) => {
    let customFields: Record<string, string> = {};
    if (a.custom_fields_json) {
      try { customFields = JSON.parse(a.custom_fields_json); } catch { /* ignore */ }
    }
    return {
      id: a.id,
      studentName: a.student_name,
      attemptNo: a.attempt_no,
      gradingStatus: a.grading_status,
      scoreRaw: a.score_raw,
      scoreTotal: a.score_total,
      scorePct: a.score_pct,
      grade: a.grade,
      passMark: a.pass_mark_percent,
      timeSecs: a.time_taken_secs,
      submittedAt: a.submitted_at,
      customFields,
    };
  });

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

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <Card>
          <p className="text-xs text-gray-500 uppercase">Total Submitted</p>
          <p className="text-2xl font-bold">{attempts.length}</p>
        </Card>
        <Card>
          <p className="text-xs text-gray-500 uppercase">In Progress</p>
          <p className="text-2xl font-bold">{inProgressCount}</p>
        </Card>
        <Card>
          <p className="text-xs text-gray-500 uppercase">Needs Grading</p>
          <p className="text-2xl font-bold">{needsGradingCount}</p>
        </Card>
        <Card>
          <p className="text-xs text-gray-500 uppercase">Avg Score</p>
          <p className="text-2xl font-bold">{avgScore !== null ? `${avgScore}%` : "—"}</p>
        </Card>
      </div>

      {/* Client-side results table with filtering and sorting */}
      <ResultsTable
        rows={rows}
        customFieldDefs={customFieldDefs.map((d) => ({ id: d.id, label: d.field_label }))}
        hasMultipleAttempts={maxAttempts > 1}
        hasPassMark={passMarkPercent !== null}
        hasGradeBands={gradeBands.length > 0}
        examId={examId}
        csvUrl={`/exam-results-csv?exam_id=${examId}`}
      />
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
     FROM sitting_approval_gates sag JOIN qa_users u ON u.id = sag.user_id
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
