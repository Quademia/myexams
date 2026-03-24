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
  const exam = await first<{ status: string }>("SELECT status FROM exams WHERE id=? AND tenant_id=?", [examId, active.tenant_id]);
  if (!exam || exam.status === "PUBLISHED" || exam.status === "CLOSED") redirect(`/exam-builder?exam_id=${examId}`);

  const now = new Date().toISOString();
  await run(
    `UPDATE exams SET title=?, description=?, time_limit_minutes=?, duration_mins=?,
       shuffle_questions=?, score_display=?, pass_mark_percent=?, allow_review=?,
       max_attempts=?, exam_password=?, starts_at=?, ends_at=?, updated_at=?
     WHERE id=? AND tenant_id=?`,
    [
      (formData.get("title") as string || "").trim(),
      (formData.get("description") as string || "").trim() || null,
      parseInt(formData.get("time_limit_minutes") as string || "0") || null,
      parseInt(formData.get("duration_mins") as string || "60") || 60,
      formData.get("shuffle_questions") === "1" ? 1 : 0,
      formData.get("score_display") || "BOTH",
      (formData.get("pass_mark_percent") as string || "").trim() ? parseInt(formData.get("pass_mark_percent") as string) : null,
      formData.get("allow_review") === "1" ? 1 : 0,
      parseInt(formData.get("max_attempts") as string || "1") || 1,
      (formData.get("exam_password") as string || "").trim() || null,
      (formData.get("starts_at") as string || "").trim() || null,
      (formData.get("ends_at") as string || "").trim() || null,
      now, examId, active.tenant_id,
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

async function publishAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active) redirect("/");

  const examId = formData.get("exam_id") as string;
  const { run } = getDb();
  await run("UPDATE exams SET status='PUBLISHED', updated_at=? WHERE id=? AND tenant_id=? AND status='DRAFT'",
    [new Date().toISOString(), examId, active.tenant_id]);
  redirect(`/exam-builder?exam_id=${examId}&tab=publish`);
}

async function closeAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active) redirect("/");

  const examId = formData.get("exam_id") as string;
  const { run } = getDb();
  await run("UPDATE exams SET status='CLOSED', closed_at=?, updated_at=? WHERE id=? AND tenant_id=?",
    [new Date().toISOString(), new Date().toISOString(), examId, active.tenant_id]);
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
    [new Date().toISOString(), new Date().toISOString(), examId, active.tenant_id]);
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

  const students = await all<{ user_id: string }>("SELECT user_id FROM class_students WHERE class_id=?", [classId]);
  for (const s of students) {
    const exists = await first("SELECT 1 FROM exam_access WHERE exam_id=? AND user_id=?", [examId, s.user_id]);
    if (!exists) {
      await run("INSERT INTO exam_access (id, exam_id, user_id, created_at) VALUES (?,?,?,?)",
        [crypto.randomUUID(), examId, s.user_id, now]);
    }
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
  const exam = await first<{ course_id: string }>("SELECT course_id FROM exams WHERE id=?", [examId]);
  if (!exam) redirect(`/exam-builder?exam_id=${examId}&tab=access`);

  const now = new Date().toISOString();
  const enrolled = await all<{ user_id: string }>("SELECT user_id FROM enrollments WHERE course_id=?", [exam.course_id]);
  for (const s of enrolled) {
    const exists = await first("SELECT 1 FROM exam_access WHERE exam_id=? AND user_id=?", [examId, s.user_id]);
    if (!exists) {
      await run("INSERT INTO exam_access (id, exam_id, user_id, created_at) VALUES (?,?,?,?)",
        [crypto.randomUUID(), examId, s.user_id, now]);
    }
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

  const exists = await first("SELECT 1 FROM exam_access WHERE exam_id=? AND user_id=?", [examId, userId]);
  if (!exists) {
    await run("INSERT INTO exam_access (id, exam_id, user_id, created_at) VALUES (?,?,?,?)",
      [crypto.randomUUID(), examId, userId, now]);
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
  const { run } = getDb();
  await run("DELETE FROM exam_access WHERE id=?", [accessId]);
  redirect(`/exam-builder?exam_id=${examId}&tab=access`);
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
  searchParams: Promise<{ exam_id?: string; tab?: string }>;
}) {
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || (active.role !== "TEACHER" && active.role !== "SCHOOL_ADMIN")) redirect("/");

  const params = await searchParams;
  const examId = params.exam_id;
  const tab = params.tab || "settings";
  if (!examId) redirect("/teacher");

  const { first, all } = getDb();
  const exam = await first<{
    id: string; title: string; description: string | null; status: string;
    time_limit_minutes: number | null; duration_mins: number | null;
    shuffle_questions: number; score_display: string; pass_mark_percent: number | null;
    allow_review: number; max_attempts: number; exam_password: string | null;
    starts_at: string | null; ends_at: string | null; course_id: string;
    results_published_at: string | null;
  }>("SELECT * FROM exams WHERE id=? AND tenant_id=?", [examId, active.tenant_id]);
  if (!exam) redirect("/teacher");

  // Verify teacher owns the course.
  if (active.role === "TEACHER") {
    const owns = await first("SELECT 1 FROM course_teachers WHERE course_id=? AND user_id=?", [exam.course_id, auth.user!.id]);
    if (!owns) redirect("/teacher");
  }

  const locked = exam.status === "PUBLISHED" || exam.status === "CLOSED";
  const base = `/exam-builder?exam_id=${examId}`;
  const tabs = [
    { label: "Settings", value: "settings", href: `${base}&tab=settings` },
    { label: "Questions", value: "questions", href: `${base}&tab=questions` },
    { label: "Publish", value: "publish", href: `${base}&tab=publish` },
    { label: "Access", value: "access", href: `${base}&tab=access` },
    { label: "Results", value: "results", href: `${base}&tab=results` },
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
                  <label className="block text-sm mb-1">Allow review after submit</label>
                  <select name="allow_review" defaultValue={String(exam.allow_review)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="1">Yes</option>
                    <option value="0">No</option>
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
              <label className="block text-sm mb-1">Exam password <span className="text-gray-400">(optional)</span></label>
              <input name="exam_password" defaultValue={exam.exam_password || ""} placeholder="Leave blank for no password" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />
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
      {tab === "questions" && <QuestionsTab examId={exam.id} locked={locked} />}

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
      {tab === "access" && <AccessTab examId={exam.id} courseId={exam.course_id} tenantId={active.tenant_id} examStatus={exam.status} />}

      {/* Results Tab */}
      {tab === "results" && <ResultsTab examId={exam.id} tenantId={active.tenant_id} resultsPublished={exam.results_published_at} />}
    </main>
  );
}

// ============================================================
// Questions Tab
// ============================================================

async function QuestionsTab({ examId, locked }: { examId: string; locked: boolean }) {
  const { all } = getDb();

  const questions = await all<{
    id: string; question_type: string; question_text: string;
    marks: number; sort_order: number; bank_question_id: string | null;
  }>("SELECT id, question_type, question_text, marks, sort_order, bank_question_id FROM exam_questions WHERE exam_id=? ORDER BY sort_order ASC", [examId]);

  const allOptions = questions.length > 0 ? await all<{
    question_id: string; option_text: string; is_correct: number;
  }>(
    `SELECT question_id, option_text, is_correct FROM exam_question_options
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

      {!locked && (
        <Card>
          <p className="text-sm text-gray-500">
            To add or edit questions, use the{" "}
            <a href={`/exam-bank-picker?exam_id=${examId}`} className="text-teal-700 hover:underline">Question Bank Picker</a>{" "}
            or the original exam builder interface.
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
