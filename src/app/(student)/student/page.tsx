// src/app/student/page.tsx
// Student dashboard — shows assigned exams, attempt status, and sitting results.

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership, roleLabel, fmtISO } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card } from "@/components/ui/Card";

// ── Badge helper ────────────────────────────────────────────────────────
// Returns a label + Tailwind colour classes for each exam state.
function examBadge(exam: ExamRow, inProgress: AttemptRow | null, attemptsRemaining: number, startsInFuture: boolean, endsInPast: boolean) {
  if (exam.status === "PUBLISHED" && startsInFuture)
    return { label: "Upcoming", cls: "bg-gray-100 text-gray-600" };
  if (exam.status === "PUBLISHED" && endsInPast)
    return { label: "Closed", cls: "bg-red-50 text-red-700" };
  if (exam.status === "PUBLISHED" && (inProgress || attemptsRemaining > 0))
    return { label: "Open", cls: "bg-green-50 text-green-700" };
  if (exam.status === "PUBLISHED")
    return { label: "Completed", cls: "bg-blue-50 text-blue-700" };
  if (exam.status === "CLOSED" && attemptsRemaining === exam.max_attempts)
    return { label: "Closed", cls: "bg-red-50 text-red-700" };
  if (exam.status === "CLOSED")
    return { label: "Completed", cls: "bg-blue-50 text-blue-700" };
  return { label: exam.status, cls: "bg-gray-100 text-gray-500" };
}

// ── Types ───────────────────────────────────────────────────────────────
interface ExamRow {
  exam_id: string;
  title: string;
  status: string;
  duration_mins: number | null;
  max_attempts: number;
  starts_at: string | null;
  ends_at: string | null;
  exam_password: string | null;
  results_published_at: string | null;
  course_title: string;
  cf_count: number;
}

interface AttemptRow {
  id: string;
  exam_id: string;
  status: string;
  attempt_no: number;
  submitted_at: string | null;
}

interface SittingRow {
  id: string;
  title: string;
  academic_year: string | null;
}

// ── Page component ──────────────────────────────────────────────────────
export default async function StudentPage() {
  // 1. Auth — must be a logged-in student
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "STUDENT") redirect("/");

  const { all, first } = getDb();
  const userId = auth.user!.id;
  const tid = active.tenant_id;
  const now = Date.now();
  const nowISO = new Date().toISOString();

  // 2. Data loading — run the three main queries in parallel
  const [exams, attempts, mySittings] = await Promise.all([
    // Query 1 — exams this student has access to
    all<ExamRow>(
      `SELECT e.id AS exam_id, e.title, e.status, e.duration_mins, e.max_attempts,
              e.starts_at, e.ends_at, e.exam_password, e.results_published_at,
              c.title AS course_title,
              (SELECT COUNT(*) FROM exam_custom_fields cf WHERE cf.exam_id = e.id) AS cf_count
       FROM exam_access ea
       JOIN exams e ON e.id = ea.exam_id
       JOIN courses c ON c.id = e.course_id
       WHERE ea.user_id = ? AND e.tenant_id = ?
       ORDER BY e.title ASC`,
      [userId, tid]
    ),

    // Query 2 — all non-abandoned attempts for this student
    all<AttemptRow>(
      `SELECT id, exam_id, status, attempt_no, submitted_at
       FROM exam_attempts
       WHERE user_id = ? AND tenant_id = ? AND status != 'ABANDONED'
       ORDER BY attempt_no ASC`,
      [userId, tid]
    ),

    // Query 3 — sittings where this student has at least one submitted attempt
    all<SittingRow>(
      `SELECT DISTINCT es.id, es.title, es.academic_year
       FROM exam_sittings es
       JOIN exam_sitting_papers esp ON esp.sitting_id = es.id
       JOIN exam_attempts ea ON ea.exam_id = esp.exam_id AND ea.user_id = ? AND ea.status = 'SUBMITTED'
       WHERE es.tenant_id = ?
       ORDER BY es.created_at DESC`,
      [userId, tid]
    ),
  ]);

  // 3. Group attempts by exam_id into a lookup map
  const attemptsByExam: Record<
    string,
    { all: AttemptRow[]; submitted: AttemptRow[]; inProgress: AttemptRow | null }
  > = {};

  for (const att of attempts) {
    if (!attemptsByExam[att.exam_id]) {
      attemptsByExam[att.exam_id] = { all: [], submitted: [], inProgress: null };
    }
    const bucket = attemptsByExam[att.exam_id];
    bucket.all.push(att);
    if (att.status === "SUBMITTED") bucket.submitted.push(att);
    if (att.status === "IN_PROGRESS") bucket.inProgress = att;
  }

  // 4. For each sitting, fetch total + released paper counts
  const sittingsWithCounts = await Promise.all(
    mySittings.map(async (s) => {
      const [totalRow, releasedRow] = await Promise.all([
        first<{ c: number }>(
          `SELECT COUNT(*) AS c FROM exam_sitting_papers WHERE sitting_id = ?`,
          [s.id]
        ),
        first<{ c: number }>(
          `SELECT COUNT(*) AS c FROM exam_sitting_papers esp
           JOIN exams e ON e.id = esp.exam_id
           WHERE esp.sitting_id = ? AND e.results_published_at IS NOT NULL AND e.results_published_at <= ?`,
          [s.id, nowISO]
        ),
      ]);
      return {
        ...s,
        total: Number(totalRow?.c ?? 0),
        released: Number(releasedRow?.c ?? 0),
      };
    })
  );

  // 5. Filter out DRAFT exams for rendering
  const visibleExams = exams.filter((e) => e.status !== "DRAFT");

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <main className="max-w-5xl mx-auto p-4">
      {/* Header card */}
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-bold">Student</h1>
            <div className="flex gap-2 mt-1">
              <span className="inline-block px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-xs font-semibold">
                {active.tenant_name}
              </span>
              <span className="inline-block px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-xs font-semibold">
                {roleLabel(active.role)}
              </span>
            </div>
          </div>
          <div className="flex gap-3 text-sm">
            {auth.memberships.length > 1 && (
              <a href="/choose-school" className="text-teal-700 hover:underline">Switch school</a>
            )}
            <a href="/profile" className="text-teal-700 hover:underline">Profile</a>
            <a href="/logout" className="text-teal-700 hover:underline">Logout</a>
          </div>
        </div>
      </Card>

      {/* My Sittings — only shown when the student has at least one */}
      {sittingsWithCounts.length > 0 && (
        <Card>
          <h2 className="text-base font-semibold mb-3">📋 My Sittings</h2>
          <div className="space-y-3">
            {sittingsWithCounts.map((s) => (
              <div key={s.id} className="border border-gray-200 rounded-lg p-3 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="font-medium text-sm">{s.title}</div>
                  {s.academic_year && (
                    <div className="text-xs text-gray-400">{s.academic_year}</div>
                  )}
                  <div className="text-xs text-gray-500 mt-0.5">
                    {s.released} of {s.total} result{s.total !== 1 ? "s" : ""} available
                  </div>
                </div>
                <a
                  href={`/sitting-results?sitting_id=${s.id}`}
                  className="px-4 py-2 bg-teal-700 text-white text-xs font-semibold rounded-lg hover:bg-teal-800 no-underline"
                >
                  View Sitting Results →
                </a>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Exam cards */}
      {visibleExams.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-400 py-4 text-center">
            No exams have been assigned to you yet.
          </p>
        </Card>
      ) : (
        <div className="space-y-0">
          {visibleExams.map((exam) => {
            const examAtts = attemptsByExam[exam.exam_id] || { all: [], submitted: [], inProgress: null };
            const attemptsUsed = examAtts.all.length;
            const attemptsRemaining = Math.max(0, exam.max_attempts - attemptsUsed);
            const inProgress = examAtts.inProgress;
            const submitted = examAtts.submitted;

            const startsInFuture = !!(exam.starts_at && Date.parse(exam.starts_at) > now);
            const endsInPast = !!(exam.ends_at && Date.parse(exam.ends_at) < now);
            const resultsReleased = !!(exam.results_published_at && Date.parse(exam.results_published_at) <= now);

            const badge = examBadge(exam, inProgress, attemptsRemaining, startsInFuture, endsInPast);

            return (
              <Card key={exam.exam_id}>
                <div className="flex items-start justify-between flex-wrap gap-2">
                  {/* Left — title, course, meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{exam.title}</span>
                      {exam.exam_password && <span title="Password protected">🔒</span>}
                      {Number(exam.cf_count) > 0 && <span title="Has custom fields">📋</span>}
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{exam.course_title}</div>

                    {/* Duration + date window */}
                    <div className="text-xs text-gray-500 mt-1 space-x-3">
                      {exam.duration_mins && <span>{exam.duration_mins} mins</span>}
                      {exam.starts_at && <span>Opens {fmtISO(exam.starts_at)}</span>}
                      {exam.ends_at && <span>Closes {fmtISO(exam.ends_at)}</span>}
                    </div>

                    {/* Attempts remaining hint */}
                    {attemptsRemaining > 0 && !inProgress && (
                      <div className="text-xs text-gray-500 mt-1">
                        {attemptsRemaining} attempt{attemptsRemaining !== 1 ? "s" : ""} remaining
                      </div>
                    )}
                  </div>

                  {/* Right — action button(s) */}
                  <div className="flex gap-2 flex-wrap items-center">
                    {(() => {
                      /* Helper — renders View Results buttons for submitted attempts */
                      const resultsButtons = () => {
                        if (submitted.length === 1) {
                          return resultsReleased ? (
                            <a
                              href={`/attempt-results?attempt_id=${submitted[0].id}`}
                              className="px-4 py-2 bg-teal-700 text-white text-xs font-semibold rounded-lg hover:bg-teal-800 no-underline"
                            >
                              View Results
                            </a>
                          ) : (
                            <span className="px-4 py-2 bg-gray-200 text-gray-500 text-xs font-semibold rounded-lg cursor-not-allowed">
                              Results Pending
                            </span>
                          );
                        }
                        if (submitted.length > 1) {
                          return (
                            <>
                              {submitted.map((att) =>
                                resultsReleased ? (
                                  <a
                                    key={att.id}
                                    href={`/attempt-results?attempt_id=${att.id}`}
                                    className="px-3 py-1.5 bg-teal-700 text-white text-xs font-semibold rounded-lg hover:bg-teal-800 no-underline"
                                  >
                                    Attempt {att.attempt_no}
                                  </a>
                                ) : (
                                  <span
                                    key={att.id}
                                    className="px-3 py-1.5 bg-gray-200 text-gray-500 text-xs font-semibold rounded-lg cursor-not-allowed"
                                  >
                                    Attempt {att.attempt_no}
                                  </span>
                                )
                              )}
                            </>
                          );
                        }
                        return null;
                      };

                      /* Case 1: In-progress attempt — Resume only */
                      if (inProgress) {
                        return (
                          <a
                            href={`/attempt-take?attempt_id=${inProgress.id}`}
                            className="px-4 py-2 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 no-underline"
                          >
                            Resume Exam →
                          </a>
                        );
                      }

                      /* Case 2: Attempts remaining — Start + prior results */
                      if (attemptsRemaining > 0) {
                        return (
                          <>
                            <a
                              href={`/attempt-start?exam_id=${exam.exam_id}`}
                              className="px-4 py-2 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 no-underline"
                            >
                              Start Exam →
                            </a>
                            {resultsButtons()}
                          </>
                        );
                      }

                      /* Cases 3 & 4: No attempts remaining — results only */
                      return resultsButtons();
                    })()}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
