// src/app/question-bank/page.tsx
// Question Bank — teachers create, edit, and share reusable questions here.
//
// WHAT IS THE QUESTION BANK?
// Think of it as a personal library of exam questions. Instead of writing the
// same question every time you create an exam, you save it once here and then
// "pick from bank" inside the exam builder.
//
// VISIBILITY:
// - PERSONAL: only you can see and use this question.
// - SCHOOL: every teacher in your school can see and use it.
//
// ARCHITECTURE:
// This is a server component. All form submissions go to server actions
// defined at the top of this file. The interactive form fields (adding
// options, toggling question type) are handled by the BankQuestionFormFields
// client component — it receives only plain data, never functions.

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership, fmtISO } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { BankQuestionFormFields } from "@/components/bank/BankQuestionFormFields";

// ============================================================
// Server Actions
// ============================================================

async function createBankQuestionAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || (active.role !== "TEACHER" && active.role !== "SCHOOL_ADMIN")) redirect("/");

  const { run } = getDb();
  const tid = active.tenant_id;
  const userId = auth.user!.id;
  const now = new Date().toISOString();

  const qType = (formData.get("question_type") as string) || "MCQ";
  const qText = (formData.get("question_text") as string || "").trim();
  if (!qText) redirect("/question-bank");

  const marksVal = Math.max(0.5, parseFloat(formData.get("marks") as string) || 1);
  const pm = qType === "MULTIPLE_SELECT" ? (formData.get("partial_marking") === "1" ? 1 : 0) : 0;
  const ma = qType === "SHORT_ANSWER" ? ((formData.get("model_answer") as string || "").trim() || null) : null;
  const fb = (formData.get("feedback") as string || "").trim() || null;
  const vis = formData.get("visibility") === "SCHOOL" ? "SCHOOL" : "PERSONAL";

  const newId = crypto.randomUUID();
  await run(
    `INSERT INTO question_bank (id, tenant_id, created_by, question_type, question_text, marks, partial_marking, model_answer, feedback, visibility, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [newId, tid, userId, qType, qText, marksVal, pm, ma, fb, vis, now, now]
  );

  await saveBankOptions(newId, qType, formData, now);

  redirect("/question-bank?toast=Question+added+to+bank");
}

async function updateBankQuestionAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || (active.role !== "TEACHER" && active.role !== "SCHOOL_ADMIN")) redirect("/");

  const questionId = formData.get("question_id") as string;
  if (!questionId) redirect("/question-bank");

  const { first, run } = getDb();
  const tid = active.tenant_id;
  const userId = auth.user!.id;
  const now = new Date().toISOString();

  // Verify the current user owns this question.
  const existing = await first<{ id: string }>(
    "SELECT id FROM question_bank WHERE id=? AND tenant_id=? AND created_by=?",
    [questionId, tid, userId]
  );
  if (!existing) redirect("/question-bank");

  const qType = (formData.get("question_type") as string) || "MCQ";
  const qText = (formData.get("question_text") as string || "").trim();
  if (!qText) redirect(`/question-bank?edit=${questionId}`);

  const marksVal = Math.max(0.5, parseFloat(formData.get("marks") as string) || 1);
  const pm = qType === "MULTIPLE_SELECT" ? (formData.get("partial_marking") === "1" ? 1 : 0) : 0;
  const ma = qType === "SHORT_ANSWER" ? ((formData.get("model_answer") as string || "").trim() || null) : null;
  const fb = (formData.get("feedback") as string || "").trim() || null;
  const vis = formData.get("visibility") === "SCHOOL" ? "SCHOOL" : "PERSONAL";

  await run(
    `UPDATE question_bank SET question_type=?, question_text=?, marks=?, partial_marking=?, model_answer=?, feedback=?, visibility=?, updated_at=?
     WHERE id=?`,
    [qType, qText, marksVal, pm, ma, fb, vis, now, questionId]
  );

  // Delete old options and re-insert.
  await run("DELETE FROM question_bank_options WHERE bank_question_id=?", [questionId]);
  await saveBankOptions(questionId, qType, formData, now);

  redirect("/question-bank?toast=Question+updated");
}

async function deleteBankQuestionAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || (active.role !== "TEACHER" && active.role !== "SCHOOL_ADMIN")) redirect("/");

  const questionId = formData.get("question_id") as string;
  if (!questionId) redirect("/question-bank");

  const { first, run } = getDb();
  const tid = active.tenant_id;
  const userId = auth.user!.id;

  // Only the owner can delete.
  const existing = await first<{ id: string }>(
    "SELECT id FROM question_bank WHERE id=? AND tenant_id=? AND created_by=?",
    [questionId, tid, userId]
  );
  if (!existing) redirect("/question-bank");

  await run("DELETE FROM question_bank_options WHERE bank_question_id=?", [questionId]);
  await run("DELETE FROM question_bank WHERE id=?", [questionId]);

  // Unlink from any exam questions that reference this bank question.
  // We don't delete the exam questions — just remove the bank link.
  await run("UPDATE exam_questions SET bank_question_id=NULL WHERE bank_question_id=?", [questionId]);

  redirect("/question-bank?toast=Question+deleted");
}

async function shareToggleAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || (active.role !== "TEACHER" && active.role !== "SCHOOL_ADMIN")) redirect("/");

  const questionId = formData.get("question_id") as string;
  if (!questionId) redirect("/question-bank");

  const { first, run } = getDb();
  const tid = active.tenant_id;
  const userId = auth.user!.id;
  const now = new Date().toISOString();

  const existing = await first<{ id: string; visibility: string }>(
    "SELECT id, visibility FROM question_bank WHERE id=? AND tenant_id=? AND created_by=?",
    [questionId, tid, userId]
  );
  if (!existing) redirect("/question-bank");

  const newVis = existing.visibility === "SCHOOL" ? "PERSONAL" : "SCHOOL";
  await run("UPDATE question_bank SET visibility=?, updated_at=? WHERE id=?", [newVis, now, questionId]);

  if (newVis === "SCHOOL") {
    redirect("/question-bank?toast=Question+shared+with+school");
  } else {
    redirect("/question-bank?toast=Question+set+to+private");
  }
}

// ── Helper: save bank question options ──────────────────────────────────────
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

// ── Display helpers ──────────────────────────────────────────────────────────
const qTypeLabel = (t: string) => {
  if (t === "MCQ") return "Multiple Choice";
  if (t === "MULTIPLE_SELECT") return "Multiple Select";
  if (t === "TRUE_FALSE") return "True / False";
  if (t === "SHORT_ANSWER") return "Short Answer";
  if (t === "ESSAY") return "Essay";
  return t;
};

const qTypeBadge = (t: string) => {
  if (t === "MCQ") return "bg-blue-50 text-blue-700";
  if (t === "MULTIPLE_SELECT") return "bg-purple-50 text-purple-700";
  if (t === "TRUE_FALSE") return "bg-green-50 text-green-700";
  if (t === "SHORT_ANSWER") return "bg-orange-50 text-orange-700";
  if (t === "ESSAY") return "bg-red-50 text-red-700";
  return "bg-gray-100 text-gray-600";
};

// ============================================================
// Page Component
// ============================================================

export default async function QuestionBankPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; vis?: string; edit?: string }>;
}) {
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active) redirect("/");
  if (active.role !== "TEACHER" && active.role !== "SCHOOL_ADMIN") redirect("/");

  const params = await searchParams;
  const filterType = params.type || "";
  const filterVis = params.vis || "";
  const editId = params.edit || "";
  const userId = auth.user!.id;
  const tid = active.tenant_id;

  const { first, all } = getDb();

  // ── Load questions ─────────────────────────────────────────────────────────
  let query = `SELECT qb.id, qb.question_type, qb.question_text, qb.marks, qb.visibility,
                      qb.partial_marking, qb.model_answer, qb.feedback, qb.created_by,
                      qb.created_at, qb.updated_at, u.name AS creator_name
               FROM question_bank qb
               JOIN qa_users u ON u.id = qb.created_by
               WHERE qb.tenant_id=? AND (qb.created_by=? OR qb.visibility='SCHOOL')`;
  const queryParams: (string | number)[] = [tid, userId];

  if (filterType) {
    query += " AND qb.question_type=?";
    queryParams.push(filterType);
  }

  if (filterVis === "PERSONAL") {
    query += " AND qb.created_by=? AND qb.visibility='PERSONAL'";
    queryParams.push(userId);
  } else if (filterVis === "SCHOOL") {
    query += " AND qb.visibility='SCHOOL'";
  }

  query += " ORDER BY qb.updated_at DESC";

  const questions = await all<{
    id: string; question_type: string; question_text: string; marks: number;
    visibility: string; partial_marking: number; model_answer: string | null;
    feedback: string | null; created_by: string; created_at: string;
    updated_at: string; creator_name: string;
  }>(query, queryParams);

  // ── Load options for all displayed questions in one query ───────────────────
  const qIds = questions.map((q) => q.id);
  let optionsMap: Record<string, { option_text: string; is_correct: number; feedback: string | null; sort_order: number }[]> = {};
  if (qIds.length > 0) {
    const placeholders = qIds.map(() => "?").join(",");
    const allOpts = await all<{
      bank_question_id: string; option_text: string; is_correct: number;
      feedback: string | null; sort_order: number;
    }>(
      `SELECT bank_question_id, option_text, is_correct, feedback, sort_order
       FROM question_bank_options WHERE bank_question_id IN (${placeholders}) ORDER BY sort_order ASC`,
      qIds
    );
    for (const opt of allOpts) {
      if (!optionsMap[opt.bank_question_id]) optionsMap[opt.bank_question_id] = [];
      optionsMap[opt.bank_question_id].push(opt);
    }
  }

  // ── Find question to edit (if any) ─────────────────────────────────────────
  const editQ = editId ? questions.find((q) => q.id === editId && q.created_by === userId) : null;
  const editOpts = editQ ? (optionsMap[editQ.id] || []) : [];

  // School name for display.
  const school = await first<{ name: string }>(
    "SELECT name FROM tenants WHERE id=?", [tid]
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="max-w-3xl mx-auto p-4 mt-4">
      {/* Header */}
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <a href="/teacher" className="text-sm text-gray-400 hover:underline">← Back to My Exams</a>
            <h1 className="text-lg font-bold mt-1">Question Bank</h1>
            <p className="text-sm text-gray-500">{school?.name || "Your school"}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{auth.user!.name}</span>
            <a href="/logout" className="text-sm text-gray-400 hover:underline">Logout</a>
          </div>
        </div>
      </Card>

      {/* Filter bar — uses plain <a> links so no client JS is needed */}
      <Card>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Type</label>
            <select
              defaultValue={filterType}
              onChange={undefined}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
              // This select doesn't do anything on its own — use the links below.
              // It's here for visual consistency. The real filters are the <a> links.
              disabled
            >
              <option value="">All types</option>
            </select>
          </div>
        </div>
        {/* Filter links */}
        <div className="flex flex-wrap gap-2 mt-2">
          <a href="/question-bank" className={`px-3 py-1 rounded-full text-xs font-semibold no-underline ${!filterType && !filterVis ? "bg-teal-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>All</a>
          <a href={`/question-bank?type=MCQ${filterVis ? `&vis=${filterVis}` : ""}`} className={`px-3 py-1 rounded-full text-xs font-semibold no-underline ${filterType === "MCQ" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>MCQ</a>
          <a href={`/question-bank?type=MULTIPLE_SELECT${filterVis ? `&vis=${filterVis}` : ""}`} className={`px-3 py-1 rounded-full text-xs font-semibold no-underline ${filterType === "MULTIPLE_SELECT" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Multi-select</a>
          <a href={`/question-bank?type=TRUE_FALSE${filterVis ? `&vis=${filterVis}` : ""}`} className={`px-3 py-1 rounded-full text-xs font-semibold no-underline ${filterType === "TRUE_FALSE" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>True/False</a>
          <a href={`/question-bank?type=SHORT_ANSWER${filterVis ? `&vis=${filterVis}` : ""}`} className={`px-3 py-1 rounded-full text-xs font-semibold no-underline ${filterType === "SHORT_ANSWER" ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Short Answer</a>
          <a href={`/question-bank?type=ESSAY${filterVis ? `&vis=${filterVis}` : ""}`} className={`px-3 py-1 rounded-full text-xs font-semibold no-underline ${filterType === "ESSAY" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Essay</a>

          <span className="text-gray-300">|</span>

          <a href={`/question-bank?${filterType ? `type=${filterType}` : ""}`} className={`px-3 py-1 rounded-full text-xs font-semibold no-underline ${!filterVis ? "bg-teal-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>All visibility</a>
          <a href={`/question-bank?vis=PERSONAL${filterType ? `&type=${filterType}` : ""}`} className={`px-3 py-1 rounded-full text-xs font-semibold no-underline ${filterVis === "PERSONAL" ? "bg-gray-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>My questions</a>
          <a href={`/question-bank?vis=SCHOOL${filterType ? `&type=${filterType}` : ""}`} className={`px-3 py-1 rounded-full text-xs font-semibold no-underline ${filterVis === "SCHOOL" ? "bg-teal-100 text-teal-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>School</a>
        </div>
        <p className="text-xs text-gray-400 mt-2">{questions.length} question{questions.length !== 1 ? "s" : ""}</p>
      </Card>

      {/* Empty state */}
      {questions.length === 0 && (
        <Card>
          <div className="text-center py-6">
            <p className="text-sm text-gray-500">
              {filterType || filterVis
                ? "No questions match your filters."
                : "Your question bank is empty — add your first question below."}
            </p>
          </div>
        </Card>
      )}

      {/* Question list */}
      {questions.map((q) => {
        const opts = optionsMap[q.id] || [];
        const isOwner = q.created_by === userId;

        return (
          <Card key={q.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                {/* Badges */}
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${qTypeBadge(q.question_type)}`}>
                    {qTypeLabel(q.question_type)}
                  </span>
                  <span className="text-xs text-gray-400">{q.marks} {Number(q.marks) === 1 ? "mark" : "marks"}</span>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                    q.visibility === "SCHOOL" ? "bg-teal-50 text-teal-700" : "bg-gray-100 text-gray-500"
                  }`}>
                    {q.visibility === "SCHOOL" ? "School" : "Personal"}
                  </span>
                  {!isOwner && <span className="text-xs text-gray-400">by {q.creator_name}</span>}
                  {q.partial_marking === 1 && (
                    <span className="inline-block px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs">Partial marking</span>
                  )}
                </div>

                {/* Question text */}
                <p className="text-sm text-gray-800 mb-2">{q.question_text}</p>

                {/* Options preview */}
                {(q.question_type === "MCQ" || q.question_type === "TRUE_FALSE" || q.question_type === "MULTIPLE_SELECT") && opts.length > 0 && (
                  <ul className="text-xs text-gray-500 space-y-0.5 pl-1">
                    {opts.map((opt, i) => (
                      <li key={i}>
                        {opt.is_correct ? "✓" : "○"} {opt.option_text}
                      </li>
                    ))}
                  </ul>
                )}

                {/* Timestamps */}
                <p className="text-xs text-gray-300 mt-2">Updated {fmtISO(q.updated_at)}</p>
              </div>

              {/* Action buttons — only for question owner */}
              {isOwner ? (
                <div className="flex flex-col gap-1 shrink-0">
                  <a
                    href={`/question-bank?edit=${q.id}${filterType ? `&type=${filterType}` : ""}${filterVis ? `&vis=${filterVis}` : ""}`}
                    className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded hover:bg-gray-200 text-center no-underline"
                  >
                    Edit
                  </a>
                  <form action={shareToggleAction}>
                    <input type="hidden" name="question_id" value={q.id} />
                    <button type="submit" className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded hover:bg-gray-200 w-full">
                      {q.visibility === "SCHOOL" ? "Make personal" : "Share"}
                    </button>
                  </form>
                  <form action={deleteBankQuestionAction}>
                    <input type="hidden" name="question_id" value={q.id} />
                    <button type="submit" className="px-2 py-1 bg-red-50 text-red-600 text-xs rounded hover:bg-red-100 w-full">
                      Delete
                    </button>
                  </form>
                </div>
              ) : (
                <span className="text-xs text-gray-400 italic">Read-only</span>
              )}
            </div>
          </Card>
        );
      })}

      {/* Add / Edit form */}
      <Card title={editQ ? "Edit Question" : "Add Question"}>
        <form action={editQ ? updateBankQuestionAction : createBankQuestionAction}>
          <BankQuestionFormFields
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
            visibility={editQ?.visibility || "PERSONAL"}
            isEdit={!!editQ}
            questionId={editQ?.id || ""}
          />
        </form>
      </Card>
    </main>
  );
}
