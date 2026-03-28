// src/app/exam-bank-picker/page.tsx
// Exam Bank Picker — lets a teacher add questions from the question bank
// into a specific exam they are building.
//
// WHY THIS EXISTS:
// When building an exam, a teacher might want to re-use questions they've
// previously saved to the Question Bank. Rather than re-typing them,
// this page shows the available bank questions and lets the teacher
// pick one to copy into the exam's question list.
//
// HOW COPYING WORKS:
// When a bank question is added to an exam, we INSERT a new row into
// exam_questions (with bank_question_id set to track the source).
// This is a copy — changes to the bank question later won't affect
// the exam question, and vice versa. This keeps exams stable.
//
// ROUTE: /exam-bank-picker?exam_id=<id>
// ACCESS: TEACHER or SCHOOL_ADMIN only

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card } from "@/components/ui/Card";

// ── Server Action: add a bank question to the exam ─────────────────────────────
async function addBankQuestionToExamAction(formData: FormData) {
  "use server";

  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || (active.role !== "TEACHER" && active.role !== "SCHOOL_ADMIN")) redirect("/");

  const examId = formData.get("exam_id") as string;
  const bankQuestionId = formData.get("bank_question_id") as string;

  if (!examId || !bankQuestionId) redirect("/teacher");

  const { first, all, run } = getDb();

  // Verify the exam belongs to this school.
  const exam = await first<{ id: string; status: string }>(
    "SELECT id, status FROM exams WHERE id=? AND tenant_id=?",
    [examId, active.tenant_id]
  );
  if (!exam) redirect("/teacher");

  // Don't allow edits to published or closed exams.
  if (exam.status === "PUBLISHED" || exam.status === "CLOSED") {
    redirect(`/exam-bank-picker?exam_id=${examId}`);
  }

  // Load the source bank question — must belong to this school.
  const bankQ = await first<{
    id: string; question_type: string; question_text: string;
    marks: number; partial_marking: number; model_answer: string | null; feedback: string | null;
  }>(
    "SELECT id, question_type, question_text, marks, partial_marking, model_answer, feedback FROM question_bank WHERE id=? AND tenant_id=?",
    [bankQuestionId, active.tenant_id]
  );
  if (!bankQ) redirect(`/exam-bank-picker?exam_id=${examId}`);

  // Also load the bank question's options (for MCQ/TRUE_FALSE).
  const bankOptions = await all<{
    option_text: string; is_correct: number; sort_order: number;
  }>(
    "SELECT option_text, is_correct, sort_order FROM question_bank_options WHERE bank_question_id=? ORDER BY sort_order ASC",
    [bankQuestionId]
  );

  // Calculate what sort_order to assign — put it at the end of the question list.
  const lastOrder = await first<{ max_order: number | null }>(
    "SELECT MAX(sort_order) AS max_order FROM exam_questions WHERE exam_id=?",
    [examId]
  );
  const nextOrder = (lastOrder?.max_order ?? 0) + 1;

  const now = new Date().toISOString();

  // INSERT the new exam question, referencing the bank question as source.
  const newQuestionId = crypto.randomUUID();
  await run(
    `INSERT INTO exam_questions
       (id, exam_id, tenant_id, question_type, question_text, marks, sort_order,
        partial_marking, model_answer, feedback, bank_question_id, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?, ?,?,?,?,?,?)`,
    [
      newQuestionId, examId, active.tenant_id,
      bankQ.question_type, bankQ.question_text, bankQ.marks, nextOrder,
      bankQ.partial_marking, bankQ.model_answer, bankQ.feedback,
      bankQuestionId, now, now,
    ]
  );

  // Copy the options across (for MCQ / TRUE_FALSE / MULTIPLE_SELECT).
  for (const opt of bankOptions) {
    const optId = crypto.randomUUID();
    await run(
      `INSERT INTO exam_question_options (id, question_id, option_text, is_correct, sort_order, created_at)
       VALUES (?,?,?,?,?,?)`,
      [optId, newQuestionId, opt.option_text, opt.is_correct, opt.sort_order, now]
    );
  }

  // Return the teacher to the exam builder's questions tab.
  redirect(`/exam-builder?exam_id=${examId}&tab=questions`);
}

// Helper labels.
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

// ── Page ───────────────────────────────────────────────────────────────────────
export default async function ExamBankPickerPage({
  searchParams,
}: {
  searchParams: Promise<{ exam_id?: string; type?: string; search?: string; vis?: string }>;
}) {
  // ── Auth ──────────────────────────────────────────────────────────────────────
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active) redirect("/");

  if (active.role !== "TEACHER" && active.role !== "SCHOOL_ADMIN") redirect("/");

  // ── Params ────────────────────────────────────────────────────────────────────
  const params = await searchParams;
  const examId = params.exam_id;
  if (!examId) redirect("/teacher");

  const filterType = params.type || "";
  const searchTerm = params.search || "";
  const filterVis = params.vis || "";
  const userId = auth.user!.id;

  // ── Data loading ──────────────────────────────────────────────────────────────
  const { first, all } = getDb();

  // Load the exam so we can show its title and verify it's editable.
  const exam = await first<{ id: string; title: string; status: string }>(
    "SELECT id, title, status FROM exams WHERE id=? AND tenant_id=?",
    [examId, active.tenant_id]
  );
  if (!exam) redirect("/teacher");

  // Load the IDs of bank questions already copied into this exam,
  // so we can show "Already added" on those entries.
  const alreadyAdded = await all<{ bank_question_id: string }>(
    "SELECT bank_question_id FROM exam_questions WHERE exam_id=? AND bank_question_id IS NOT NULL",
    [examId]
  );
  const addedIds = new Set(alreadyAdded.map((r) => r.bank_question_id));

  // Load bank questions — teachers see their own + school-shared. JOIN qa_users for creator name.
  let query = `SELECT qb.id, qb.question_type, qb.question_text, qb.marks, qb.visibility, qb.created_by, u.name AS creator_name
               FROM question_bank qb JOIN qa_users u ON u.id = qb.created_by
               WHERE qb.tenant_id=? AND (qb.created_by=? OR qb.visibility='SCHOOL')`;
  const queryParams: (string | number)[] = [active.tenant_id, userId];

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

  if (searchTerm) {
    query += " AND qb.question_text LIKE ?";
    queryParams.push(`%${searchTerm}%`);
  }

  query += " ORDER BY qb.updated_at DESC";

  const bankQuestions = await all<{
    id: string; question_type: string; question_text: string;
    marks: number; visibility: string; created_by: string; creator_name: string;
  }>(query, queryParams);

  const questionTypes = ["MCQ", "TRUE_FALSE", "SHORT_ANSWER", "ESSAY", "MULTIPLE_SELECT"];
  const isEditable = exam.status !== "PUBLISHED" && exam.status !== "CLOSED";

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <main className="max-w-3xl mx-auto p-4 mt-4">
      {/* Header */}
      <Card>
        <a href={`/exam-builder?exam_id=${examId}&tab=questions`} className="text-sm text-gray-400 hover:underline">
          ← Back to Exam Builder
        </a>
        <h1 className="text-lg font-bold mt-2">Add from Question Bank</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Picking questions for: <span className="font-semibold text-gray-700">{exam.title}</span>
        </p>

        {!isEditable && (
          <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-700">
              This exam is {exam.status.toLowerCase()} and cannot be edited.
            </p>
          </div>
        )}
      </Card>

      {/* Filter bar */}
      <Card>
        <form method="get" className="flex flex-wrap gap-2 items-end">
          <input type="hidden" name="exam_id" value={examId} />
          <div className="flex-1 min-w-40">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Search</label>
            <input
              type="text"
              name="search"
              defaultValue={searchTerm}
              placeholder="Search question text…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Type</label>
            <select
              name="type"
              defaultValue={filterType}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="">All types</option>
              {questionTypes.map((t) => (
                <option key={t} value={t}>{qTypeLabel(t)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Visibility</label>
            <select
              name="vis"
              defaultValue={filterVis}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="">All</option>
              <option value="PERSONAL">My questions only</option>
              <option value="SCHOOL">School questions</option>
            </select>
          </div>
          <button type="submit" className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200">
            Filter
          </button>
          {(filterType || searchTerm || filterVis) && (
            <a
              href={`/exam-bank-picker?exam_id=${examId}`}
              className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 no-underline"
            >
              Clear
            </a>
          )}
        </form>
        <p className="text-xs text-gray-400 mt-2">{bankQuestions.length} question{bankQuestions.length !== 1 ? "s" : ""} found</p>
      </Card>

      {/* Empty state */}
      {bankQuestions.length === 0 && (
        <Card>
          <div className="text-center py-6">
            <p className="text-sm text-gray-500">
              {filterType || searchTerm
                ? "No bank questions match your filter."
                : "Your question bank is empty."}
            </p>
            <a
              href="/question-bank"
              className="mt-3 inline-block text-sm text-teal-700 hover:underline"
            >
              Go to Question Bank →
            </a>
          </div>
        </Card>
      )}

      {/* Bank question cards */}
      {bankQuestions.map((q) => {
        const alreadyIn = addedIds.has(q.id);

        return (
          <Card key={q.id}>
            <div className="flex items-start gap-3">
              {/* Question info */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${qTypeBadge(q.question_type)}`}>
                    {qTypeLabel(q.question_type)}
                  </span>
                  <span className="text-xs text-gray-400">
                    {q.marks} {Number(q.marks) === 1 ? "mark" : "marks"}
                  </span>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                    q.visibility === "SCHOOL"
                      ? "bg-teal-50 text-teal-700"
                      : "bg-gray-100 text-gray-500"
                  }`}>
                    {q.visibility === "SCHOOL" ? "School" : "Personal"}
                  </span>
                  {q.created_by !== userId && (
                    <span className="text-xs text-gray-400">by {q.creator_name}</span>
                  )}
                  {alreadyIn && (
                    <span className="inline-block px-2 py-0.5 bg-teal-50 text-teal-700 rounded-full text-xs font-semibold">
                      Already added
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-800 line-clamp-2">{q.question_text}</p>
              </div>

              {/* Add button — only if exam is editable */}
              {isEditable && (
                <form action={addBankQuestionToExamAction} className="shrink-0">
                  <input type="hidden" name="exam_id" value={examId} />
                  <input type="hidden" name="bank_question_id" value={q.id} />
                  <button
                    type="submit"
                    // If already added, we allow adding again (teachers may want duplicates).
                    className={`px-3 py-2 text-sm font-semibold rounded-lg ${
                      alreadyIn
                        ? "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        : "bg-teal-700 text-white hover:bg-teal-800"
                    }`}
                  >
                    {alreadyIn ? "Add again" : "Add to Exam"}
                  </button>
                </form>
              )}
            </div>
          </Card>
        );
      })}

      {/* Footer link back */}
      {bankQuestions.length > 0 && (
        <div className="text-center mt-2 mb-8">
          <a
            href={`/exam-builder?exam_id=${examId}&tab=questions`}
            className="text-sm text-teal-700 hover:underline"
          >
            ← Back to Exam Builder
          </a>
        </div>
      )}
    </main>
  );
}
