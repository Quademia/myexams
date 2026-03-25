// src/app/attempt-results/page.tsx
// Student result slip — 5 sections, full score_display logic, print support.

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership, fmtISO } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card } from "@/components/Card";

// ── Types ───────────────────────────────────────────────────────────────

interface AttemptRow {
  id: string;
  exam_id: string;
  user_id: string;
  tenant_id: string;
  attempt_no: number;
  status: string;
  submitted_at: string | null;
  time_taken_secs: number | null;
  score_raw: number | null;
  score_total: number | null;
  score_pct: number | null;
  grade: string | null;
  score_display: string;
  pass_mark_percent: number | null;
  grade_bands_json: string | null;
  custom_fields_json: string | null;
}

interface ExamRow {
  id: string;
  title: string;
  tenant_id: string;
  duration_mins: number;
  max_attempts: number;
  allow_review: number;
  results_published_at: string | null;
  tenant_name: string;
  course_title: string;
}

interface CustomFieldDef {
  id: string;
  field_label: string;
}

// ── Inline helpers ──────────────────────────────────────────────────────

function fmtDuration(mins: number | null): string {
  const m = Number(mins) || 0;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h > 0 && rem > 0) return `${h} hr ${rem} min`;
  if (h > 0) return `${h} hr`;
  return `${rem} min`;
}

function fmtTimeTaken(secs: number | null): string {
  if (!secs) return "less than a second";
  const s = Math.round(Number(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} hour${h !== 1 ? "s" : ""}`);
  if (m > 0) parts.push(`${m} minute${m !== 1 ? "s" : ""}`);
  if (sec > 0 && h === 0) parts.push(`${sec} second${sec !== 1 ? "s" : ""}`);
  return parts.join(", ") || "less than a second";
}

// ── Page component ──────────────────────────────────────────────────────

export default async function AttemptResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ attempt_id?: string }>;
}) {
  const params = await searchParams;
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active) redirect("/");

  const { first, all } = getDb();
  const userId = auth.user!.id;
  const tid = active.tenant_id;
  const attemptId = params.attempt_id || "";

  // Load attempt — students can only see their own; teachers/admins can see any in tenant
  let attempt: AttemptRow | null;
  if (active.role === "STUDENT") {
    attempt = await first<AttemptRow>(
      `SELECT * FROM exam_attempts WHERE id=? AND user_id=? AND tenant_id=? AND status='SUBMITTED'`,
      [attemptId, userId, tid]
    );
  } else {
    attempt = await first<AttemptRow>(
      `SELECT * FROM exam_attempts WHERE id=? AND tenant_id=? AND status='SUBMITTED'`,
      [attemptId, tid]
    );
  }
  if (!attempt) redirect("/student");

  // Load exam with tenant + course info
  const exam = await first<ExamRow>(
    `SELECT e.*, t.name AS tenant_name, c.title AS course_title
     FROM exams e
     JOIN tenants t ON t.id = e.tenant_id
     JOIN courses c ON c.id = e.course_id
     WHERE e.id=? AND e.tenant_id=?`,
    [attempt.exam_id, tid]
  );
  if (!exam) redirect("/student");

  // Results released check (students only)
  const resultsReleased =
    exam.results_published_at &&
    Date.parse(exam.results_published_at) <= Date.now();

  if (active.role === "STUDENT" && !resultsReleased) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="w-full max-w-lg">
          <Card>
            <div className="text-center">
              <div className="text-4xl mb-3">🔒</div>
              <h1 className="text-lg font-bold">Results not yet released</h1>
              <p className="text-sm text-gray-500 mt-2">
                Your teacher has not yet released the results for this exam.
                Please check back later.
              </p>
              <a
                href="/student"
                className="inline-block mt-4 text-sm text-teal-700 hover:underline"
              >
                ← Back to My Exams
              </a>
            </div>
          </Card>
        </div>
      </main>
    );
  }

  // Load student name
  const studentRow = await first<{ name: string }>(
    `SELECT name FROM users WHERE id=?`,
    [attempt.user_id]
  );
  const studentName = studentRow?.name || "Unknown";

  // Load class (optional)
  const classRow = await first<{ class_name: string }>(
    `SELECT cl.name AS class_name FROM class_students cs
     JOIN classes cl ON cl.id = cs.class_id
     WHERE cs.user_id=? AND cl.tenant_id=? LIMIT 1`,
    [attempt.user_id, tid]
  );

  // Custom field definitions + parsed answers
  const cfDefs = await all<CustomFieldDef>(
    `SELECT id, field_label FROM exam_custom_fields WHERE exam_id=? ORDER BY sort_order ASC`,
    [attempt.exam_id]
  );
  let cfAnswers: Record<string, string> = {};
  try {
    if (attempt.custom_fields_json)
      cfAnswers = JSON.parse(attempt.custom_fields_json);
  } catch {
    /* ignore */
  }

  // Grade bands from attempt snapshot
  let gradeBands: { label: string; min_percent: number }[] = [];
  try {
    gradeBands = JSON.parse(attempt.grade_bands_json || "[]");
    gradeBands.sort((a, b) => Number(b.min_percent) - Number(a.min_percent));
  } catch {
    /* ignore */
  }

  // Score display variables
  const sd = attempt.score_display || "BOTH";
  const scorePct =
    attempt.score_pct != null ? Number(attempt.score_pct) : null;
  const scoreRaw =
    attempt.score_raw != null ? Number(attempt.score_raw) : null;
  const scoreTotal =
    attempt.score_total != null ? Number(attempt.score_total) : null;

  // Question count + total marks
  const qStats = await first<{ c: number; total_marks: number }>(
    `SELECT COUNT(*) AS c, COALESCE(SUM(marks), 0) AS total_marks
     FROM exam_questions WHERE exam_id=? AND tenant_id=?`,
    [attempt.exam_id, tid]
  );
  const questionCount = Number(qStats?.c ?? 0);
  const totalMarks = Number(qStats?.total_marks ?? 0);

  // Pass / fail logic
  const hasPassMark = attempt.pass_mark_percent !== null && scorePct !== null;
  const passed = hasPassMark && scorePct! >= Number(attempt.pass_mark_percent);

  // Score hidden?
  const scoreHidden = sd === "NONE" || sd === "HIDDEN";
  const showNothing = scoreHidden && !attempt.grade && !hasPassMark;

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <>
      {/* Print styles */}
      <style
        dangerouslySetInnerHTML={{
          __html: `@media print { .no-print { display: none !important; } body { background: white !important; } }`,
        }}
      />
      {/* Print helper */}
      <script
        dangerouslySetInnerHTML={{
          __html: `function doPrint(){window.print()}`,
        }}
      />

      <main className="max-w-2xl mx-auto p-4">
        {/* ── Section 1 — Header ───────────────────────────────── */}
        <Card>
          <div className="text-center">
            <div className="text-xs text-gray-400 uppercase tracking-wide font-semibold">
              {exam.tenant_name}
            </div>
            <h1 className="text-xl font-bold mt-1">{exam.title}</h1>
            <div className="text-sm text-gray-500 mt-1">{exam.course_title}</div>
            {classRow?.class_name && (
              <div className="text-sm text-gray-400 mt-0.5">{classRow.class_name}</div>
            )}
          </div>
        </Card>

        {/* ── Section 2 — Student details ──────────────────────── */}
        <Card>
          <h2 className="text-base font-semibold mb-3">Student Details</h2>
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <span className="text-gray-500">Name</span>
            <span className="font-medium">{studentName}</span>

            {cfDefs.map((cf) => {
              const val = cfAnswers[`cf_${cf.id}`] || cfAnswers[cf.id] || "—";
              return (
                <span key={cf.id} className="contents">
                  <span className="text-gray-500">{cf.field_label}</span>
                  <span>{val}</span>
                </span>
              );
            })}

            {exam.max_attempts > 1 && (
              <>
                <span className="text-gray-500">Attempt</span>
                <span>Attempt {attempt.attempt_no}</span>
              </>
            )}

            <span className="text-gray-500">Submitted</span>
            <span>{attempt.submitted_at ? fmtISO(attempt.submitted_at) : "—"}</span>

            <span className="text-gray-500">Time taken</span>
            <span>{fmtTimeTaken(attempt.time_taken_secs)}</span>
          </div>
        </Card>

        {/* ── Section 3 — Exam details ─────────────────────────── */}
        <Card>
          <h2 className="text-base font-semibold mb-3">Exam Details</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-xs text-gray-400 uppercase font-semibold">Total Marks</div>
              <div className="text-lg font-bold mt-1">{totalMarks}</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-xs text-gray-400 uppercase font-semibold">Questions</div>
              <div className="text-lg font-bold mt-1">{questionCount}</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-xs text-gray-400 uppercase font-semibold">Duration</div>
              <div className="text-lg font-bold mt-1">{fmtDuration(exam.duration_mins)}</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-xs text-gray-400 uppercase font-semibold">Pass Mark</div>
              <div className="text-lg font-bold mt-1">
                {attempt.pass_mark_percent !== null
                  ? `${attempt.pass_mark_percent}%`
                  : "—"}
              </div>
              {attempt.pass_mark_percent !== null && (
                <div className="text-xs text-gray-400">required to pass</div>
              )}
              {attempt.pass_mark_percent === null && (
                <div className="text-xs text-gray-400">No pass mark set</div>
              )}
            </div>
          </div>

          {gradeBands.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold mb-2">Grade Bands</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left text-xs text-gray-500 uppercase py-1 px-2">Grade</th>
                    <th className="text-left text-xs text-gray-500 uppercase py-1 px-2">Min %</th>
                  </tr>
                </thead>
                <tbody>
                  {gradeBands.map((b, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-1 px-2 font-medium">{b.label}</td>
                      <td className="py-1 px-2">{b.min_percent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* ── Section 4 — Result ───────────────────────────────── */}
        <Card>
          <div className="text-center py-2">
            {/* Score display */}
            {!scoreHidden && scorePct !== null && (
              <div className="mb-2">
                {sd === "BOTH" && (
                  <div className="text-3xl font-bold">
                    {scorePct}%
                    {scoreRaw !== null && scoreTotal !== null && (
                      <span className="text-lg text-gray-400 ml-2">
                        · {scoreRaw}/{scoreTotal}
                      </span>
                    )}
                  </div>
                )}
                {sd === "PERCENT" && (
                  <div className="text-3xl font-bold">{scorePct}%</div>
                )}
                {sd === "MARKS" && scoreRaw !== null && scoreTotal !== null && (
                  <div className="text-3xl font-bold">
                    {scoreRaw}/{scoreTotal}
                  </div>
                )}
              </div>
            )}

            {/* Grade */}
            {attempt.grade && (
              <div className="text-2xl font-bold text-teal-700 mb-2">
                {attempt.grade}
              </div>
            )}

            {/* Pass / fail badge */}
            {hasPassMark && (
              <div className="mb-2">
                {passed ? (
                  <span className="inline-block px-4 py-1.5 rounded-full bg-green-50 text-green-700 text-sm font-bold">
                    ✓ PASS
                  </span>
                ) : (
                  <span className="inline-block px-4 py-1.5 rounded-full bg-red-50 text-red-700 text-sm font-bold">
                    ✗ FAIL
                  </span>
                )}
              </div>
            )}

            {/* Fallback when nothing to show */}
            {showNothing && (
              <p className="text-sm text-gray-500">Your result has been recorded.</p>
            )}
          </div>
        </Card>

        {/* ── Section 5 — Actions (no-print) ──────────────────── */}
        <Card>
          <div className="no-print flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-3">
              {exam.allow_review === 1 && (
                <a
                  href={`/attempt-review?attempt_id=${attemptId}`}
                  className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800 no-underline"
                >
                  Review My Answers
                </a>
              )}
              <a
                href="/student"
                className="px-4 py-2 text-sm text-teal-700 hover:underline"
              >
                ← Back to My Exams
              </a>
            </div>
            <span
              dangerouslySetInnerHTML={{
                __html: `<a href="#" onclick="doPrint();return false;" class="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-300 no-underline inline-block cursor-pointer">🖨 Print</a>`,
              }}
            />
          </div>
        </Card>
      </main>
    </>
  );
}
