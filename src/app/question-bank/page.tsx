// src/app/question-bank/page.tsx
// Question Bank — reusable question library for teachers.

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card } from "@/components/Card";
import { QuestionForm } from "@/components/QuestionForm";

// ============================================================
// Helper: save bank options (MCQ, Multiple Select, True/False)
// ============================================================
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

async function createBankQuestionAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || (active.role !== "TEACHER" && active.role !== "SCHOOL_ADMIN")) redirect("/");

  const qType = (formData.get("question_type") as string || "MCQ").trim();
  const qText = (formData.get("question_text") as string || "").trim();
  const marks = Math.max(0.5, parseFloat(formData.get("marks") as string || "1") || 1);
  const feedback = (formData.get("feedback") as string || "").trim() || null;
  const modelAnswer = (formData.get("model_answer") as string || "").trim() || null;
  const partialMarking = qType === "MULTIPLE_SELECT" ? (formData.get("partial_marking") === "1" ? 1 : 0) : 0;
  const visibility = (formData.get("visibility") as string || "PERSONAL").trim();
  if (!qText) redirect("/question-bank");

  const { run } = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await run(
    `INSERT INTO question_bank
       (id, tenant_id, created_by, question_type, question_text, marks,
        partial_marking, model_answer, feedback, visibility, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, active.tenant_id, auth.user!.id, qType, qText, marks, partialMarking, modelAnswer, feedback, visibility, now, now]
  );

  // Save options.
  await saveBankOptions(run, id, qType, formData, now);

  redirect("/question-bank");
}

async function updateBankQuestionAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || (active.role !== "TEACHER" && active.role !== "SCHOOL_ADMIN")) redirect("/");

  const questionId = formData.get("question_id") as string;
  if (!questionId) redirect("/question-bank");

  const { first, run } = getDb();

  // Validate ownership.
  const existing = await first<{ id: string }>(
    "SELECT id FROM question_bank WHERE id=? AND tenant_id=? AND created_by=?",
    [questionId, active.tenant_id, auth.user!.id]
  );
  if (!existing) redirect("/question-bank");

  const qType = (formData.get("question_type") as string || "MCQ").trim();
  const qText = (formData.get("question_text") as string || "").trim();
  const marks = Math.max(0.5, parseFloat(formData.get("marks") as string || "1") || 1);
  const feedback = (formData.get("feedback") as string || "").trim() || null;
  const modelAnswer = (formData.get("model_answer") as string || "").trim() || null;
  const partialMarking = qType === "MULTIPLE_SELECT" ? (formData.get("partial_marking") === "1" ? 1 : 0) : 0;
  const visibility = (formData.get("visibility") as string || "PERSONAL").trim();
  if (!qText) redirect("/question-bank");

  const now = new Date().toISOString();
  await run(
    `UPDATE question_bank SET question_type=?, question_text=?, marks=?, partial_marking=?,
       model_answer=?, feedback=?, visibility=?, updated_at=?
     WHERE id=?`,
    [qType, qText, marks, partialMarking, modelAnswer, feedback, visibility, now, questionId]
  );

  // Rebuild options.
  await run("DELETE FROM question_bank_options WHERE bank_question_id=?", [questionId]);
  await saveBankOptions(run, questionId, qType, formData, now);

  redirect("/question-bank");
}

async function shareBankQuestionAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || (active.role !== "TEACHER" && active.role !== "SCHOOL_ADMIN")) redirect("/");

  const questionId = formData.get("question_id") as string;
  if (!questionId) redirect("/question-bank");

  const { first, run } = getDb();

  // Validate ownership.
  const existing = await first<{ visibility: string }>(
    "SELECT visibility FROM question_bank WHERE id=? AND tenant_id=? AND created_by=?",
    [questionId, active.tenant_id, auth.user!.id]
  );
  if (!existing) redirect("/question-bank");

  const newVis = existing.visibility === "SCHOOL" ? "PERSONAL" : "SCHOOL";
  await run("UPDATE question_bank SET visibility=?, updated_at=? WHERE id=?",
    [newVis, new Date().toISOString(), questionId]);

  redirect("/question-bank");
}

async function deleteBankQuestionAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || (active.role !== "TEACHER" && active.role !== "SCHOOL_ADMIN")) redirect("/");

  const questionId = formData.get("question_id") as string;
  if (!questionId) redirect("/question-bank");

  const { first, run } = getDb();

  // Validate ownership — only the creator can delete.
  const existing = await first(
    "SELECT id FROM question_bank WHERE id=? AND tenant_id=? AND created_by=?",
    [questionId, active.tenant_id, auth.user!.id]
  );
  if (!existing) redirect("/question-bank");

  // Unlink from exam questions.
  await run("UPDATE exam_questions SET bank_question_id=NULL WHERE bank_question_id=?", [questionId]);
  // Delete options then question.
  await run("DELETE FROM question_bank_options WHERE bank_question_id=?", [questionId]);
  await run("DELETE FROM question_bank WHERE id=?", [questionId]);

  redirect("/question-bank");
}

// ============================================================
// Helpers
// ============================================================
function qTypeLabel(t: string): string {
  if (t === "MCQ") return "Multiple Choice";
  if (t === "MULTIPLE_SELECT") return "Multiple Select";
  if (t === "TRUE_FALSE") return "True / False";
  if (t === "SHORT_ANSWER") return "Short Answer";
  if (t === "ESSAY") return "Essay";
  return t;
}

function qTypeBadge(t: string): string {
  if (t === "MCQ") return "bg-blue-50 text-blue-700";
  if (t === "MULTIPLE_SELECT") return "bg-purple-50 text-purple-700";
  if (t === "TRUE_FALSE") return "bg-green-50 text-green-700";
  if (t === "SHORT_ANSWER") return "bg-orange-50 text-orange-700";
  if (t === "ESSAY") return "bg-red-50 text-red-700";
  return "bg-gray-100 text-gray-600";
}

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
  const currentUserId = auth.user!.id;

  const { first, all } = getDb();

  // Build query matching old build exactly.
  let query = `SELECT qb.id, qb.question_type, qb.question_text, qb.marks, qb.visibility,
       qb.partial_marking, qb.model_answer, qb.feedback, qb.created_by,
       qb.created_at, qb.updated_at,
       u.name AS creator_name
FROM question_bank qb
JOIN users u ON u.id = qb.created_by
WHERE qb.tenant_id=? AND (qb.created_by=? OR qb.visibility='SCHOOL')`;
  const queryParams: (string | number)[] = [active.tenant_id, currentUserId];

  if (filterType) {
    query += " AND qb.question_type=?";
    queryParams.push(filterType);
  }

  if (filterVis === "PERSONAL") {
    query += " AND qb.created_by=? AND qb.visibility='PERSONAL'";
    queryParams.push(currentUserId);
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

  // Load options for all displayed questions.
  const optsByQ: Record<string, { option_text: string; is_correct: number; feedback: string | null; sort_order: number }[]> = {};
  if (questions.length > 0) {
    const ids = questions.map(q => q.id);
    const placeholders = ids.map(() => "?").join(",");
    const opts = await all<{
      question_id: string; option_text: string; is_correct: number;
      feedback: string | null; sort_order: number;
    }>(
      `SELECT bank_question_id AS question_id, option_text, is_correct, feedback, sort_order
       FROM question_bank_options WHERE bank_question_id IN (${placeholders}) ORDER BY sort_order ASC`,
      ids
    );
    for (const o of opts) {
      if (!optsByQ[o.question_id]) optsByQ[o.question_id] = [];
      optsByQ[o.question_id].push(o);
    }
  }

  // Edit question data.
  const editQ = editId ? questions.find(q => q.id === editId) : null;
  const editOpts = editQ ? (optsByQ[editQ.id] || []) : [];
  const editOwned = editQ ? editQ.created_by === currentUserId : true;

  // Build filter URL helper.
  const buildFilterUrl = (overrides: Record<string, string>) => {
    const p = new URLSearchParams();
    const type = overrides.type ?? filterType;
    const vis = overrides.vis ?? filterVis;
    const edit = overrides.edit ?? editId;
    if (type) p.set("type", type);
    if (vis) p.set("vis", vis);
    if (edit) p.set("edit", edit);
    const qs = p.toString();
    return `/question-bank${qs ? `?${qs}` : ""}`;
  };

  return (
    <main className="max-w-3xl mx-auto p-4 mt-4">
      {/* Header */}
      <Card>
        <a href="/teacher" className="text-sm text-gray-400 hover:underline">← My Exams</a>
        <div className="flex items-center justify-between mt-1">
          <h1 className="text-lg font-bold">Question Bank</h1>
          <div className="text-right">
            <div className="text-2xl font-bold text-teal-700">{questions.length}</div>
            <div className="text-xs text-gray-400">question{questions.length !== 1 ? "s" : ""}</div>
          </div>
        </div>
      </Card>

      {/* Filters */}
      <Card>
        <form method="get" className="flex flex-wrap gap-3 items-end">
          {editId && <input type="hidden" name="edit" value={editId} />}
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Type</label>
            <select name="type" defaultValue={filterType} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">All types</option>
              <option value="MCQ">Multiple Choice</option>
              <option value="MULTIPLE_SELECT">Multiple Select</option>
              <option value="TRUE_FALSE">True / False</option>
              <option value="SHORT_ANSWER">Short Answer</option>
              <option value="ESSAY">Essay</option>
            </select>
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Visibility</label>
            <select name="vis" defaultValue={filterVis} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">All (mine + school)</option>
              <option value="PERSONAL">My questions only</option>
              <option value="SCHOOL">School questions</option>
            </select>
          </div>
          <button type="submit" className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200">
            Filter
          </button>
          {(filterType || filterVis) && (
            <a href={editId ? `/question-bank?edit=${editId}` : "/question-bank"} className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 no-underline">
              Clear
            </a>
          )}
        </form>
        <p className="text-xs text-gray-400 mt-2">{questions.length} question{questions.length !== 1 ? "s" : ""} shown</p>
      </Card>

      {/* Question list */}
      {questions.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-400 text-center py-4">
            {filterType || filterVis ? "No questions match your filter." : "Your question bank is empty. Add your first question below!"}
          </p>
        </Card>
      ) : (
        questions.map((q) => {
          const opts = optsByQ[q.id] || [];
          const isOwner = q.created_by === currentUserId;
          let preview = "";
          if (q.question_type === "MCQ" || q.question_type === "MULTIPLE_SELECT" || q.question_type === "TRUE_FALSE") {
            preview = opts.slice(0, 3).map((o, i) => `${String.fromCharCode(65 + i)}) ${o.option_text}`).join(" · ");
          } else if (q.question_type === "SHORT_ANSWER") {
            preview = "Written answer";
          } else if (q.question_type === "ESSAY") {
            preview = "Essay response";
          }

          return (
            <Card key={q.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
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
                    {q.created_by !== currentUserId && (
                      <span className="text-xs text-gray-400">by {q.creator_name}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-800 line-clamp-3">{q.question_text}</p>
                  {preview && <p className="text-xs text-gray-400 mt-1 truncate">{preview}</p>}
                </div>

                <div className="shrink-0 flex flex-col gap-1 items-end">
                  {isOwner ? (
                    <>
                      <a
                        href={buildFilterUrl({ edit: q.id })}
                        className="px-2 py-1 bg-gray-100 text-teal-700 text-xs rounded-lg hover:bg-gray-200 no-underline"
                      >
                        Edit
                      </a>
                      <form action={shareBankQuestionAction}>
                        <input type="hidden" name="question_id" value={q.id} />
                        <button type="submit" className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200">
                          {q.visibility === "PERSONAL" ? "Share to school" : "Make personal"}
                        </button>
                      </form>
                      <form action={deleteBankQuestionAction}>
                        <input type="hidden" name="question_id" value={q.id} />
                        <button
                          type="submit"
                          onClick={(e) => { if (!confirm("Delete this question from bank?")) e.preventDefault(); }}
                          className="px-2 py-1 bg-gray-100 text-red-600 text-xs rounded-lg hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </form>
                    </>
                  ) : (
                    <span className="text-xs text-gray-400">Read-only</span>
                  )}
                </div>
              </div>
            </Card>
          );
        })
      )}

      {/* Add / Edit form */}
      <Card title={editQ ? "Edit question" : "Add question to bank"}>
        {editQ && !editOwned ? (
          <p className="text-sm text-red-500 py-2">You can only edit your own questions.</p>
        ) : (
          <QuestionForm
            examId=""
            addAction={createBankQuestionAction}
            editAction={updateBankQuestionAction}
            initial={editQ ? {
              id: editQ.id,
              question_type: editQ.question_type,
              question_text: editQ.question_text,
              marks: editQ.marks,
              partial_marking: editQ.partial_marking ?? 0,
              model_answer: editQ.model_answer,
              feedback: editQ.feedback,
              options: editOpts.map(o => ({ option_text: o.option_text, is_correct: o.is_correct, feedback: o.feedback })),
            } : undefined}
            onCancel={editQ ? "/question-bank" : undefined}
          >
            <div>
              <label className="block text-sm font-medium mb-1">Visibility</label>
              <select
                name="visibility"
                defaultValue={editQ?.visibility || "PERSONAL"}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="PERSONAL">Personal (only me)</option>
                <option value="SCHOOL">School (all teachers)</option>
              </select>
            </div>
          </QuestionForm>
        )}
      </Card>
    </main>
  );
}
