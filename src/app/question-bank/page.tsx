// src/app/question-bank/page.tsx
// Question Bank — a library of reusable questions that teachers can store
// and then pull into any exam they're building.
//
// WHY THIS EXISTS:
// Without a question bank, teachers would have to re-type the same question
// every time they use it in a different exam. The bank lets them write each
// question once and reuse it across multiple exams. It's like a question library.
//
// This page shows:
//   - All existing bank questions for this school
//   - Their type, marks, and text
//   - A "Create Question" form at the top to add new ones
//
// ROUTE: /question-bank
// ACCESS: TEACHER or SCHOOL_ADMIN only

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card } from "@/components/Card";

// ── Server Action: create a new bank question ──────────────────────────────────
async function createBankQuestionAction(formData: FormData) {
  "use server";

  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || (active.role !== "TEACHER" && active.role !== "SCHOOL_ADMIN")) redirect("/");

  const questionText = (formData.get("question_text") as string || "").trim();
  const questionType = (formData.get("question_type") as string || "MCQ").trim();
  const marks = parseInt(formData.get("marks") as string || "1") || 1;
  const modelAnswer = (formData.get("model_answer") as string || "").trim() || null;
  const visibility = (formData.get("visibility") as string || "PRIVATE").trim();

  // Validate: question text is required.
  if (!questionText) redirect("/question-bank");

  const { run } = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await run(
    `INSERT INTO question_bank
       (id, tenant_id, created_by, question_type, question_text, marks,
        partial_marking, model_answer, visibility, created_at, updated_at)
     VALUES (?,?,?,?,?,?, 0,?,?,?,?)`,
    [
      id, active.tenant_id, auth.user!.id,
      questionType, questionText, marks,
      modelAnswer, visibility, now, now,
    ]
  );

  // Redirect back to the question bank page to show the new question.
  redirect("/question-bank");
}

// ── Server Action: delete a bank question ────────────────────────────────────
async function deleteBankQuestionAction(formData: FormData) {
  "use server";

  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || (active.role !== "TEACHER" && active.role !== "SCHOOL_ADMIN")) redirect("/");

  const questionId = formData.get("question_id") as string;
  if (!questionId) redirect("/question-bank");

  const { run } = getDb();
  // tenant_id check ensures teachers can only delete their own school's questions.
  await run(
    "DELETE FROM question_bank WHERE id=? AND tenant_id=?",
    [questionId, active.tenant_id]
  );

  redirect("/question-bank");
}

// Helper: readable labels for question types.
function qTypeLabel(t: string): string {
  if (t === "MCQ") return "Multiple Choice";
  if (t === "MULTIPLE_SELECT") return "Multiple Select";
  if (t === "TRUE_FALSE") return "True / False";
  if (t === "SHORT_ANSWER") return "Short Answer";
  if (t === "ESSAY") return "Essay";
  return t;
}

// Helper: colour tags for different question types.
function qTypeBadge(t: string): string {
  if (t === "MCQ") return "bg-blue-50 text-blue-700";
  if (t === "MULTIPLE_SELECT") return "bg-purple-50 text-purple-700";
  if (t === "TRUE_FALSE") return "bg-green-50 text-green-700";
  if (t === "SHORT_ANSWER") return "bg-orange-50 text-orange-700";
  if (t === "ESSAY") return "bg-red-50 text-red-700";
  return "bg-gray-100 text-gray-600";
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default async function QuestionBankPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; search?: string }>;
}) {
  // ── Auth ──────────────────────────────────────────────────────────────────────
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active) redirect("/");

  if (active.role !== "TEACHER" && active.role !== "SCHOOL_ADMIN") redirect("/");

  // ── Data loading ──────────────────────────────────────────────────────────────
  const params = await searchParams;
  const filterType = params.type || "";
  const searchTerm = params.search || "";

  const { all } = getDb();

  // Build the query dynamically based on filters.
  // We start with base conditions and add optional ones.
  let query = `SELECT id, question_type, question_text, marks, visibility, created_at
               FROM question_bank
               WHERE tenant_id=?`;
  const queryParams: (string | number)[] = [active.tenant_id];

  if (filterType) {
    query += " AND question_type=?";
    queryParams.push(filterType);
  }

  if (searchTerm) {
    // LIKE search with wildcards on both sides — finds any question containing the term.
    query += " AND question_text LIKE ?";
    queryParams.push(`%${searchTerm}%`);
  }

  query += " ORDER BY created_at DESC";

  const questions = await all<{
    id: string; question_type: string; question_text: string;
    marks: number; visibility: string; created_at: string;
  }>(query, queryParams);

  const questionTypes = ["MCQ", "TRUE_FALSE", "SHORT_ANSWER", "ESSAY", "MULTIPLE_SELECT"];

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <main className="max-w-3xl mx-auto p-4 mt-4">
      {/* Header */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Question Bank</h1>
            <p className="text-sm text-gray-500">
              Reusable questions you can add to any exam.
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-teal-700">{questions.length}</div>
            <div className="text-xs text-gray-400">question{questions.length !== 1 ? "s" : ""}</div>
          </div>
        </div>
      </Card>

      {/* Create question form */}
      <Card title="Add New Question">
        {/*
          This form calls createBankQuestionAction when submitted.
          Each field name (e.g. name="question_text") matches what the action reads
          via formData.get("question_text").
        */}
        <form action={createBankQuestionAction} className="space-y-4">
          {/* Question text */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Question Text <span className="text-red-500">*</span>
            </label>
            <textarea
              name="question_text"
              required
              rows={3}
              placeholder="Type the question here…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Question type */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Question Type
              </label>
              <select
                name="question_type"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {questionTypes.map((t) => (
                  <option key={t} value={t}>{qTypeLabel(t)}</option>
                ))}
              </select>
            </div>

            {/* Marks */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Marks
              </label>
              <input
                type="number"
                name="marks"
                min="1"
                max="100"
                defaultValue="1"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Model answer (optional) */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Model Answer <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              name="model_answer"
              rows={2}
              placeholder="Ideal answer or marking notes…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y"
            />
          </div>

          {/* Visibility */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Visibility
            </label>
            <select
              name="visibility"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {/* PRIVATE: only this teacher can use it */}
              <option value="PRIVATE">Private (only me)</option>
              {/* SCHOOL: all teachers in this school */}
              <option value="SCHOOL">School (all teachers)</option>
            </select>
          </div>

          <button
            type="submit"
            className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800"
          >
            Add to Bank
          </button>
        </form>
      </Card>

      {/* Filter bar */}
      <Card>
        <form method="get" className="flex flex-wrap gap-2 items-end">
          {/* Search */}
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Search</label>
            <input
              type="text"
              name="search"
              defaultValue={searchTerm}
              placeholder="Search question text…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          {/* Type filter */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Type</label>
            <select
              name="type"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="">All types</option>
              {questionTypes.map((t) => (
                <option key={t} value={t} selected={filterType === t}>{qTypeLabel(t)}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200"
          >
            Filter
          </button>
          {(filterType || searchTerm) && (
            <a
              href="/question-bank"
              className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 no-underline"
            >
              Clear
            </a>
          )}
        </form>
      </Card>

      {/* Questions list */}
      {questions.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-400 text-center py-4">
            {filterType || searchTerm
              ? "No questions match your filter."
              : "Your question bank is empty. Add your first question above!"}
          </p>
        </Card>
      ) : (
        questions.map((q) => (
          <Card key={q.id}>
            <div className="flex items-start justify-between gap-3">
              {/* Left: type badge + text */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${qTypeBadge(q.question_type)}`}>
                    {qTypeLabel(q.question_type)}
                  </span>
                  <span className="text-xs text-gray-400">
                    {q.marks} {Number(q.marks) === 1 ? "mark" : "marks"}
                  </span>
                  {q.visibility === "SCHOOL" && (
                    <span className="inline-block px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full text-xs">
                      Shared
                    </span>
                  )}
                </div>
                {/* Truncate long question text — full text shows on picker/builder */}
                <p className="text-sm text-gray-800 line-clamp-3">{q.question_text}</p>
              </div>

              {/* Right: delete form */}
              <form action={deleteBankQuestionAction} className="shrink-0">
                <input type="hidden" name="question_id" value={q.id} />
                <button
                  type="submit"
                  className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50"
                  onClick={(e) => {
                    // Client-side confirm — won't work server-side, but shows intent.
                    // The interactive pass will add a proper modal.
                  }}
                >
                  Delete
                </button>
              </form>
            </div>
          </Card>
        ))
      )}
    </main>
  );
}
