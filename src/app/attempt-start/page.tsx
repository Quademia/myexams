// src/app/attempt-start/page.tsx
// Attempt Start — the "lobby" screen a student sees before beginning an exam.
//
// WHY THIS EXISTS:
// We don't want students jumping straight into the exam. This page shows them:
//   - The exam title and course
//   - How long they have (duration)
//   - Any instructions from the teacher
//   - How many attempts they are allowed
//   - A "Start Exam" button that creates the attempt record and redirects them
//
// The "Start Exam" button is a server action — when the student clicks it, the
// server creates an exam_attempts row with status=IN_PROGRESS, stamps the
// started_at time, then redirects to /attempt-take?attempt_id=<new_id>.
//
// ROUTE: /attempt-start?exam_id=<id>
// ACCESS: STUDENT only

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership, fmtISO } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card } from "@/components/Card";

// ── Server Action: create the attempt ──────────────────────────────────────────
// "use server" means this function only runs on the server, never in the browser.
// When the student submits the form, Next.js calls this function server-side.
async function startExamAction(formData: FormData) {
  "use server";

  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "STUDENT") redirect("/");

  const examId = formData.get("exam_id") as string;
  if (!examId) redirect("/student");

  const { first, run } = getDb();

  // Security check: verify the exam exists and belongs to this school.
  const exam = await first<{
    id: string; max_attempts: number | null; status: string;
    pass_mark_percent: number | null; starts_at: string | null; ends_at: string | null;
  }>(
    "SELECT id, max_attempts, status, pass_mark_percent, starts_at, ends_at FROM exams WHERE id=? AND tenant_id=?",
    [examId, active.tenant_id]
  );
  if (!exam) redirect("/student");

  // Don't allow attempts on unpublished exams.
  if (exam.status !== "PUBLISHED") redirect(`/attempt-start?exam_id=${examId}`);

  // Don't allow attempts outside the exam window.
  const now = Date.now();
  if (exam.starts_at && Date.parse(exam.starts_at) > now) redirect(`/attempt-start?exam_id=${examId}`);
  if (exam.ends_at && Date.parse(exam.ends_at) < now) redirect(`/attempt-start?exam_id=${examId}`);

  // Count how many attempts this student has already made on this exam.
  const existingCount = await first<{ cnt: number }>(
    "SELECT COUNT(*) AS cnt FROM exam_attempts WHERE exam_id=? AND user_id=? AND tenant_id=?",
    [examId, auth.user!.id, active.tenant_id]
  );
  const attemptNo = (existingCount?.cnt ?? 0) + 1;

  // Enforce max_attempts limit.
  if (exam.max_attempts !== null && attemptNo > exam.max_attempts) {
    redirect(`/attempt-start?exam_id=${examId}`);
  }

  // Create the exam_attempts row.
  // status=IN_PROGRESS means the clock is now ticking.
  const attemptId = crypto.randomUUID();
  const nowISO = new Date().toISOString();

  await run(
    `INSERT INTO exam_attempts
       (id, exam_id, user_id, tenant_id, status, attempt_no, started_at,
        pass_mark_percent, grading_status, created_at, updated_at)
     VALUES (?,?,?,?,'IN_PROGRESS',?,?,?,  'PENDING',?,?)`,
    [
      attemptId, examId, auth.user!.id, active.tenant_id,
      attemptNo, nowISO,
      exam.pass_mark_percent,
      nowISO, nowISO,
    ]
  );

  // Send the student to the exam-taking interface.
  redirect(`/attempt-take?attempt_id=${attemptId}`);
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default async function AttemptStartPage({
  searchParams,
}: {
  searchParams: Promise<{ exam_id?: string }>;
}) {
  // ── Auth ──────────────────────────────────────────────────────────────────────
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active) redirect("/");

  if (active.role !== "STUDENT") redirect("/");

  // ── Params ────────────────────────────────────────────────────────────────────
  const params = await searchParams;
  const examId = params.exam_id;
  if (!examId) redirect("/student");

  // ── Data loading ──────────────────────────────────────────────────────────────
  const { first, all } = getDb();

  const exam = await first<{
    id: string; title: string; description: string | null; course_id: string;
    duration_mins: number | null; time_limit_minutes: number | null;
    max_attempts: number | null; pass_mark_percent: number | null;
    status: string; allow_review: number; shuffle_questions: number;
    starts_at: string | null; ends_at: string | null;
  }>(
    `SELECT id, title, description, course_id, duration_mins, time_limit_minutes,
       max_attempts, pass_mark_percent, status, allow_review, shuffle_questions,
       starts_at, ends_at
     FROM exams WHERE id=? AND tenant_id=?`,
    [examId, active.tenant_id]
  );
  if (!exam) redirect("/student");

  const course = await first<{ title: string }>(
    "SELECT title FROM courses WHERE id=?", [exam.course_id]
  );

  // Count questions and total marks so the student knows what to expect.
  const questionStats = await first<{ count: number; total_marks: number }>(
    "SELECT COUNT(*) AS count, COALESCE(SUM(marks), 0) AS total_marks FROM exam_questions WHERE exam_id=? AND tenant_id=?",
    [examId, active.tenant_id]
  );

  // How many attempts has this student already made?
  const existingAttempts = await first<{ cnt: number }>(
    "SELECT COUNT(*) AS cnt FROM exam_attempts WHERE exam_id=? AND user_id=? AND tenant_id=?",
    [examId, auth.user!.id, active.tenant_id]
  );
  const attemptsMade = existingAttempts?.cnt ?? 0;
  const attemptsRemaining =
    exam.max_attempts !== null ? exam.max_attempts - attemptsMade : null;

  // Determine if the exam is currently available.
  const now = Date.now();
  const notStartedYet = exam.starts_at ? Date.parse(exam.starts_at) > now : false;
  const hasEnded = exam.ends_at ? Date.parse(exam.ends_at) < now : false;
  const maxReached = exam.max_attempts !== null && attemptsMade >= exam.max_attempts;
  const canStart = exam.status === "PUBLISHED" && !notStartedYet && !hasEnded && !maxReached;

  // Duration to display (duration_mins is the newer field, time_limit_minutes is legacy).
  const durationMins = exam.duration_mins ?? exam.time_limit_minutes;

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <main className="max-w-lg mx-auto p-4 mt-8">
      {/* Header */}
      <Card>
        <a href="/student" className="text-sm text-gray-400 hover:underline">
          ← Back to My Exams
        </a>
        <h1 className="text-xl font-bold mt-2">{exam.title}</h1>
        {course && <div className="text-sm text-gray-500 mt-0.5">{course.title}</div>}
      </Card>

      {/* Exam info grid */}
      <Card title="Exam Details">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-500">Questions:</span>
            <span className="ml-2 font-medium">{questionStats?.count ?? 0}</span>
          </div>
          <div>
            <span className="text-gray-500">Total marks:</span>
            <span className="ml-2 font-medium">{questionStats?.total_marks ?? 0}</span>
          </div>
          {durationMins && (
            <div>
              <span className="text-gray-500">Duration:</span>
              <span className="ml-2 font-medium">{durationMins} minutes</span>
            </div>
          )}
          {exam.pass_mark_percent !== null && (
            <div>
              <span className="text-gray-500">Pass mark:</span>
              <span className="ml-2 font-medium">{exam.pass_mark_percent}%</span>
            </div>
          )}
          {exam.max_attempts !== null && (
            <div>
              <span className="text-gray-500">Max attempts:</span>
              <span className="ml-2 font-medium">{exam.max_attempts}</span>
            </div>
          )}
          <div>
            <span className="text-gray-500">Attempts made:</span>
            <span className="ml-2 font-medium">{attemptsMade}</span>
          </div>
          {exam.starts_at && (
            <div>
              <span className="text-gray-500">Opens:</span>
              <span className="ml-2 font-medium">{fmtISO(exam.starts_at)}</span>
            </div>
          )}
          {exam.ends_at && (
            <div>
              <span className="text-gray-500">Closes:</span>
              <span className="ml-2 font-medium">{fmtISO(exam.ends_at)}</span>
            </div>
          )}
          <div>
            <span className="text-gray-500">Review allowed:</span>
            <span className="ml-2 font-medium">{exam.allow_review ? "Yes" : "No"}</span>
          </div>
          <div>
            <span className="text-gray-500">Shuffled:</span>
            <span className="ml-2 font-medium">{exam.shuffle_questions ? "Yes" : "No"}</span>
          </div>
        </div>
      </Card>

      {/* Description / instructions */}
      {exam.description && (
        <Card title="Instructions">
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {exam.description}
          </p>
        </Card>
      )}

      {/* Start button or blocked message */}
      <Card>
        {notStartedYet && (
          <div className="text-center py-4">
            <div className="text-3xl mb-2">⏳</div>
            <p className="text-sm font-semibold text-gray-700">This exam hasn't opened yet.</p>
            <p className="text-xs text-gray-400 mt-1">Opens {fmtISO(exam.starts_at)}</p>
          </div>
        )}

        {hasEnded && (
          <div className="text-center py-4">
            <div className="text-3xl mb-2">🔒</div>
            <p className="text-sm font-semibold text-gray-700">This exam has closed.</p>
            <p className="text-xs text-gray-400 mt-1">Closed {fmtISO(exam.ends_at)}</p>
          </div>
        )}

        {maxReached && !hasEnded && !notStartedYet && (
          <div className="text-center py-4">
            <p className="text-sm font-semibold text-gray-700">You have used all your attempts.</p>
            <p className="text-xs text-gray-400 mt-1">
              {exam.max_attempts} attempt{exam.max_attempts !== 1 ? "s" : ""} allowed.
            </p>
          </div>
        )}

        {exam.status !== "PUBLISHED" && (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500">This exam is not currently available.</p>
          </div>
        )}

        {canStart && (
          <div>
            {/* Warning to the student before they start */}
            <p className="text-sm text-gray-600 mb-4 text-center">
              {durationMins
                ? `Once you start, you will have ${durationMins} minutes to complete this exam.`
                : "Once you start, complete the exam without leaving the page."}
              {" "}Make sure you are ready before clicking Start.
            </p>

            {attemptsRemaining !== null && (
              <p className="text-xs text-gray-400 text-center mb-4">
                You have {attemptsRemaining} attempt{attemptsRemaining !== 1 ? "s" : ""} remaining.
              </p>
            )}

            {/* The form submits to startExamAction, which creates the attempt row. */}
            <form action={startExamAction}>
              {/* We pass the exam_id as a hidden field — the server action reads it. */}
              <input type="hidden" name="exam_id" value={examId} />
              <button
                type="submit"
                className="w-full py-3 bg-teal-700 text-white text-base font-semibold rounded-lg hover:bg-teal-800 transition-colors"
              >
                Start Exam
              </button>
            </form>
          </div>
        )}
      </Card>
    </main>
  );
}
