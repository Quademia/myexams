// src/app/attempt-start/page.tsx
// Pre-flight wizard before starting an exam.
// Steps: password (if exam has one) → custom_fields (if exam has them) → instructions → start.

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership, fmtISO } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card } from "@/components/Card";

// ── Types ───────────────────────────────────────────────────────────────

interface ExamRow {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  status: string;
  duration_mins: number;
  max_attempts: number;
  starts_at: string | null;
  ends_at: string | null;
  exam_password: string | null;
  shuffle_questions: number;
  score_display: string;
  pass_mark_percent: number | null;
  results_published_at: string | null;
}

interface CustomFieldRow {
  id: string;
  field_label: string;
  field_type: string;
  field_options: string | null;
  is_required: number;
}

interface QuestionRow {
  id: string;
  question_type: string;
}

interface GradeBandRow {
  label: string;
  min_percent: number;
}

// ── Security helper ─────────────────────────────────────────────────────
// Loads an exam only if it's PUBLISHED and the student has access.

async function loadExamForStudent(
  examId: string,
  tenantId: string,
  userId: string
): Promise<ExamRow | null> {
  const { first } = getDb();

  const exam = await first<ExamRow>(
    `SELECT * FROM exams WHERE id = ? AND tenant_id = ?`,
    [examId, tenantId]
  );
  if (!exam || exam.status !== "PUBLISHED") return null;

  const access = await first<{ "1": number }>(
    `SELECT 1 FROM exam_access WHERE exam_id = ? AND user_id = ? LIMIT 1`,
    [examId, userId]
  );
  if (!access) return null;

  return exam;
}

// ── Fisher-Yates shuffle ────────────────────────────────────────────────
// Shuffles an array in-place and returns it.

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Server Actions ──────────────────────────────────────────────────────

// Action 1 — password step
async function passwordAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "STUDENT") redirect("/");

  const examId = formData.get("exam_id") as string;
  const userId = auth.user!.id;
  const tid = active.tenant_id;

  const exam = await loadExamForStudent(examId, tid, userId);
  if (!exam) redirect("/student");

  // Check if exam has closed
  if (exam.ends_at && Date.parse(exam.ends_at) < Date.now()) {
    redirect(`/attempt-start?exam_id=${examId}&error=closed`);
  }

  const { first, all } = getDb();

  // Check for in-progress attempt
  const inProgress = await first<{ id: string }>(
    `SELECT id FROM exam_attempts WHERE exam_id = ? AND user_id = ? AND tenant_id = ? AND status = 'IN_PROGRESS' LIMIT 1`,
    [examId, userId, tid]
  );
  if (inProgress) redirect(`/attempt-take?attempt_id=${inProgress.id}`);

  // Check attempts used
  const usedRow = await first<{ c: number }>(
    `SELECT COUNT(*) AS c FROM exam_attempts WHERE exam_id = ? AND user_id = ? AND tenant_id = ? AND status != 'ABANDONED'`,
    [examId, userId, tid]
  );
  const used = Number(usedRow?.c ?? 0);
  if (used >= exam.max_attempts) {
    redirect(`/attempt-start?exam_id=${examId}&error=attempts`);
  }

  // Validate password
  const submitted = (formData.get("password") as string || "").trim();
  if (submitted !== exam.exam_password) {
    redirect(`/attempt-start?exam_id=${examId}&error=password`);
  }

  // Check for custom fields
  const cfCount = await first<{ c: number }>(
    `SELECT COUNT(*) AS c FROM exam_custom_fields WHERE exam_id = ?`,
    [examId]
  );
  const encoded = encodeURIComponent(submitted);

  if (Number(cfCount?.c ?? 0) > 0) {
    redirect(`/attempt-start?exam_id=${examId}&step=custom_fields&confirmed_password=${encoded}`);
  } else {
    redirect(`/attempt-start?exam_id=${examId}&step=instructions&confirmed_password=${encoded}`);
  }
}

// Action 2 — custom fields step
async function customFieldsAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "STUDENT") redirect("/");

  const examId = formData.get("exam_id") as string;
  const userId = auth.user!.id;
  const tid = active.tenant_id;

  const exam = await loadExamForStudent(examId, tid, userId);
  if (!exam) redirect("/student");

  // Re-validate password if exam has one
  if (exam.exam_password) {
    const confirmed = (formData.get("confirmed_password") as string || "").trim();
    if (confirmed !== exam.exam_password) {
      redirect(`/attempt-start?exam_id=${examId}&error=session`);
    }
  }

  // Collect cf_ fields
  const cfParams: string[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("cf_")) {
      cfParams.push(`${key}=${encodeURIComponent(value as string)}`);
    }
  }

  const confirmedPw = encodeURIComponent(formData.get("confirmed_password") as string || "");
  const cfQuery = cfParams.length > 0 ? `&${cfParams.join("&")}` : "";
  redirect(`/attempt-start?exam_id=${examId}&step=instructions&confirmed_password=${confirmedPw}${cfQuery}`);
}

// Action 3 — start exam (final step — creates the attempt)
async function startExamAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "STUDENT") redirect("/");

  const examId = formData.get("exam_id") as string;
  const userId = auth.user!.id;
  const tid = active.tenant_id;

  const exam = await loadExamForStudent(examId, tid, userId);
  if (!exam) redirect("/student");

  // Check if exam has closed
  if (exam.ends_at && Date.parse(exam.ends_at) < Date.now()) {
    redirect(`/attempt-start?exam_id=${examId}&error=closed`);
  }

  // Re-validate password if exam has one
  if (exam.exam_password) {
    const confirmed = (formData.get("confirmed_password") as string || "").trim();
    if (confirmed !== exam.exam_password) {
      redirect(`/attempt-start?exam_id=${examId}&error=session`);
    }
  }

  const { first, all, run } = getDb();

  // Check for in-progress attempt
  const inProgress = await first<{ id: string }>(
    `SELECT id FROM exam_attempts WHERE exam_id = ? AND user_id = ? AND tenant_id = ? AND status = 'IN_PROGRESS' LIMIT 1`,
    [examId, userId, tid]
  );
  if (inProgress) redirect(`/attempt-take?attempt_id=${inProgress.id}`);

  // Count non-abandoned attempts
  const usedRow = await first<{ c: number }>(
    `SELECT COUNT(*) AS c FROM exam_attempts WHERE exam_id = ? AND user_id = ? AND tenant_id = ? AND status != 'ABANDONED'`,
    [examId, userId, tid]
  );
  const used = Number(usedRow?.c ?? 0);
  if (used >= exam.max_attempts) {
    redirect(`/attempt-start?exam_id=${examId}&error=attempts`);
  }

  // Load questions
  const questions = await all<QuestionRow>(
    `SELECT id, question_type FROM exam_questions WHERE exam_id = ? AND tenant_id = ? ORDER BY sort_order ASC`,
    [examId, tid]
  );
  if (questions.length === 0) {
    redirect(`/attempt-start?exam_id=${examId}&error=noquestions`);
  }

  // Build question order — shuffle if exam requires it
  let questionIds = questions.map((q) => q.id);
  if (exam.shuffle_questions === 1) {
    questionIds = shuffle([...questionIds]);
  }

  // Calculate effective duration
  let effectiveDurationSecs = exam.duration_mins * 60;
  if (exam.ends_at) {
    const secsUntilClose = Math.max(0, Math.floor((Date.parse(exam.ends_at) - Date.now()) / 1000));
    effectiveDurationSecs = Math.min(effectiveDurationSecs, secsUntilClose);
  }

  // Load grade bands
  const gradeBands = await all<GradeBandRow>(
    `SELECT label, min_percent FROM exam_grade_bands WHERE exam_id = ? ORDER BY min_percent DESC`,
    [examId]
  );

  // Collect custom field answers from form data
  const cfAnswers: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("cf_")) {
      cfAnswers[key] = value as string;
    }
  }
  const customFieldsJson = Object.keys(cfAnswers).length > 0 ? JSON.stringify(cfAnswers) : null;
  const gradeBandsJson = gradeBands.length > 0 ? JSON.stringify(gradeBands) : null;

  // Create the attempt
  const attemptId = crypto.randomUUID();
  const now = new Date().toISOString();
  const attemptNo = used + 1;

  await run(
    `INSERT INTO exam_attempts (
       id, tenant_id, exam_id, user_id, attempt_no, status, started_at,
       effective_duration_secs, question_order_json, custom_fields_json,
       score_display, pass_mark_percent, grade_bands_json,
       grading_status, created_at, updated_at
     ) VALUES (?,?,?,?,?,
       'IN_PROGRESS',?,
       ?,?,?,
       ?,?,?,
       'PENDING',?,?)`,
    [
      attemptId, tid, examId, userId, attemptNo,
      now,
      effectiveDurationSecs, JSON.stringify(questionIds), customFieldsJson,
      exam.score_display, exam.pass_mark_percent, gradeBandsJson,
      now, now,
    ]
  );

  // Pre-create blank answer rows for every question
  for (const q of questions) {
    await run(
      `INSERT INTO exam_answers (id, attempt_id, question_id, question_type, answer_json, is_flagged, created_at, updated_at)
       VALUES (?,?,?,?,null,0,?,?)`,
      [crypto.randomUUID(), attemptId, q.id, q.question_type, now, now]
    );
  }

  redirect(`/attempt-take?attempt_id=${attemptId}`);
}

// ── Helper: format duration for display ─────────────────────────────────

function formatDuration(mins: number): string {
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
  }
  return `${mins} min`;
}

// ── Page component ──────────────────────────────────────────────────────

export default async function AttemptStartPage({
  searchParams,
}: {
  searchParams: Promise<{
    exam_id?: string;
    step?: string;
    error?: string;
    confirmed_password?: string;
    [key: string]: string | undefined;
  }>;
}) {
  const params = await searchParams;
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "STUDENT") redirect("/");

  const userId = auth.user!.id;
  const tid = active.tenant_id;
  const examId = params.exam_id || "";

  // Load exam with security check
  const exam = await loadExamForStudent(examId, tid, userId);

  if (!exam) {
    return (
      <main className="max-w-2xl mx-auto p-4">
        <Card>
          <p className="text-sm text-red-600 mb-3">Exam not found or you don&apos;t have access.</p>
          <a href="/student" className="text-teal-700 text-sm hover:underline">← Back to dashboard</a>
        </Card>
      </main>
    );
  }

  // Error messages
  const errorMessages: Record<string, string> = {
    password: "Incorrect password. Please try again.",
    session: "Session expired. Please re-enter the password.",
    attempts: "You have used all your attempts for this exam.",
    closed: "This exam is no longer available.",
    noquestions: "This exam has no questions yet.",
  };
  const errorMsg = params.error ? errorMessages[params.error] || null : null;

  const { first, all } = getDb();

  // ── Determine which step to show ──────────────────────────────────────
  let step = params.step || null;

  // Default visit (no step param) — figure out which step to render
  if (!step) {
    // Has exam ended?
    if (exam.ends_at && Date.parse(exam.ends_at) < Date.now()) {
      return (
        <main className="max-w-2xl mx-auto p-4">
          <Card>
            <a href="/student" className="text-teal-700 text-sm hover:underline">← Back to dashboard</a>
            <h2 className="text-lg font-bold mt-3">{exam.title}</h2>
            <p className="text-sm text-red-600 mt-3">This exam is no longer available.</p>
          </Card>
        </main>
      );
    }

    // In-progress attempt?
    const inProgress = await first<{ id: string }>(
      `SELECT id FROM exam_attempts WHERE exam_id = ? AND user_id = ? AND tenant_id = ? AND status = 'IN_PROGRESS' LIMIT 1`,
      [examId, userId, tid]
    );
    if (inProgress) redirect(`/attempt-take?attempt_id=${inProgress.id}`);

    // All attempts used?
    const usedRow = await first<{ c: number }>(
      `SELECT COUNT(*) AS c FROM exam_attempts WHERE exam_id = ? AND user_id = ? AND tenant_id = ? AND status != 'ABANDONED'`,
      [examId, userId, tid]
    );
    const used = Number(usedRow?.c ?? 0);
    if (used >= exam.max_attempts) {
      return (
        <main className="max-w-2xl mx-auto p-4">
          <Card>
            <a href="/student" className="text-teal-700 text-sm hover:underline">← Back to dashboard</a>
            <h2 className="text-lg font-bold mt-3">{exam.title}</h2>
            <p className="text-sm text-red-600 mt-3">You have used all your attempts for this exam.</p>
          </Card>
        </main>
      );
    }

    // Custom fields count
    const cfCount = await first<{ c: number }>(
      `SELECT COUNT(*) AS c FROM exam_custom_fields WHERE exam_id = ?`,
      [examId]
    );
    const hasCf = Number(cfCount?.c ?? 0) > 0;

    if (exam.exam_password) {
      step = "password";
    } else if (hasCf) {
      step = "custom_fields";
    } else {
      step = "instructions";
    }
  }

  // ── Step: password ────────────────────────────────────────────────────
  if (step === "password") {
    return (
      <main className="max-w-2xl mx-auto p-4">
        <Card>
          <a href="/student" className="text-teal-700 text-sm hover:underline">← Back to dashboard</a>
          <h2 className="text-lg font-bold mt-3">{exam.title}</h2>

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-3">
              <p className="text-sm text-red-700">{errorMsg}</p>
            </div>
          )}

          <form action={passwordAction} className="mt-4 space-y-4">
            <input type="hidden" name="exam_id" value={examId} />
            <input type="hidden" name="step" value="password" />

            <div>
              <label className="block text-sm font-medium mb-1">Exam password</label>
              <input
                type="password"
                name="password"
                required
                autoFocus
                autoComplete="off"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="Enter the password provided by your teacher"
              />
            </div>

            <button
              type="submit"
              className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800"
            >
              Continue →
            </button>
          </form>
        </Card>
      </main>
    );
  }

  // ── Step: custom_fields ───────────────────────────────────────────────
  if (step === "custom_fields") {
    const customFields = await all<CustomFieldRow>(
      `SELECT id, field_label, field_type, field_options, is_required
       FROM exam_custom_fields WHERE exam_id = ? ORDER BY sort_order ASC`,
      [examId]
    );

    return (
      <main className="max-w-2xl mx-auto p-4">
        <Card>
          <a href="/student" className="text-teal-700 text-sm hover:underline">← Back to dashboard</a>
          <h2 className="text-lg font-bold mt-3">{exam.title}</h2>
          <p className="text-sm text-gray-500 mt-1">Additional information required</p>

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-3">
              <p className="text-sm text-red-700">{errorMsg}</p>
            </div>
          )}

          <form action={customFieldsAction} className="mt-4 space-y-4">
            <input type="hidden" name="exam_id" value={examId} />
            <input type="hidden" name="step" value="custom_fields" />
            <input type="hidden" name="confirmed_password" value={params.confirmed_password || ""} />

            {customFields.map((cf) => (
              <div key={cf.id}>
                <label className="block text-sm font-medium mb-1">
                  {cf.field_label}
                  {cf.is_required === 1 && <span className="text-red-500 ml-0.5">*</span>}
                </label>

                {cf.field_type === "DROPDOWN" ? (
                  <select
                    name={`cf_${cf.id}`}
                    required={cf.is_required === 1}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">Select…</option>
                    {(cf.field_options || "").split(",").map((opt) => (
                      <option key={opt.trim()} value={opt.trim()}>{opt.trim()}</option>
                    ))}
                  </select>
                ) : cf.field_type === "NUMBER" ? (
                  <input
                    type="number"
                    name={`cf_${cf.id}`}
                    required={cf.is_required === 1}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                ) : (
                  <input
                    type="text"
                    name={`cf_${cf.id}`}
                    required={cf.is_required === 1}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                )}
              </div>
            ))}

            <button
              type="submit"
              className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800"
            >
              Continue →
            </button>
          </form>
        </Card>
      </main>
    );
  }

  // ── Step: instructions (final step before starting) ───────────────────
  if (step === "instructions") {
    const qCountRow = await first<{ c: number }>(
      `SELECT COUNT(*) AS c FROM exam_questions WHERE exam_id = ? AND tenant_id = ?`,
      [examId, tid]
    );
    const questionCount = Number(qCountRow?.c ?? 0);

    // Load custom fields so we can carry cf_ values forward as hidden inputs
    const customFields = await all<{ id: string }>(
      `SELECT id FROM exam_custom_fields WHERE exam_id = ?`,
      [examId]
    );

    return (
      <main className="max-w-2xl mx-auto p-4">
        <Card>
          <a href="/student" className="text-teal-700 text-sm hover:underline">← Back to dashboard</a>
          <h2 className="text-lg font-bold mt-3">{exam.title}</h2>
          <p className="text-sm text-gray-500 mt-1">Exam instructions</p>

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-3">
              <p className="text-sm text-red-700">{errorMsg}</p>
            </div>
          )}

          {exam.description && (
            <p className="text-sm text-gray-700 mt-3">{exam.description}</p>
          )}

          {/* Stat boxes */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500 uppercase font-semibold">Duration</div>
              <div className="text-lg font-bold mt-1">{formatDuration(exam.duration_mins)}</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500 uppercase font-semibold">Questions</div>
              <div className="text-lg font-bold mt-1">{questionCount}</div>
            </div>
          </div>

          {/* Warning box */}
          <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 mt-4">
            <p className="text-sm text-amber-800 font-medium">
              ⚠️ Important: Once you start, the timer begins. Do not close this tab — your progress is saved automatically.
            </p>
          </div>

          <form action={startExamAction} className="mt-4">
            <input type="hidden" name="exam_id" value={examId} />
            <input type="hidden" name="step" value="instructions" />
            <input type="hidden" name="confirmed_password" value={params.confirmed_password || ""} />

            {/* Carry custom field answers from URL params */}
            {customFields.map((cf) => (
              <input key={cf.id} type="hidden" name={`cf_${cf.id}`} value={params[`cf_${cf.id}`] || ""} />
            ))}

            <button
              type="submit"
              className="w-full px-6 py-3 bg-green-600 text-white text-base font-bold rounded-lg hover:bg-green-700"
            >
              Start Exam →
            </button>
          </form>
        </Card>
      </main>
    );
  }

  // Fallback — shouldn't happen
  redirect(`/attempt-start?exam_id=${examId}`);
}
