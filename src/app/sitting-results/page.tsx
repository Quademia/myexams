// src/app/sitting-results/page.tsx
// Sitting Results — student's overview of all their exam papers in a sitting.
//
// WHY THIS EXISTS:
// A "sitting" is a formal exam event that groups multiple papers together
// (like a school's end-of-year exams). This page shows the student a summary
// card for each paper in the sitting: the exam title, their score, grade, and
// whether they passed or failed.
//
// Think of it like a report card for one sitting event.
//
// ROUTE: /sitting-results?sitting_id=<id>
// ACCESS: STUDENT only

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership, fmtISO } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card } from "@/components/Card";

export default async function SittingResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ sitting_id?: string }>;
}) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active) redirect("/");

  // This page is for students only.
  if (active.role !== "STUDENT") redirect("/");

  // ── Params ──────────────────────────────────────────────────────────────────
  const params = await searchParams;
  const sittingId = params.sitting_id;
  if (!sittingId) redirect("/student");

  // ── Data loading ─────────────────────────────────────────────────────────────
  const { first, all } = getDb();

  // Load the sitting — verify it belongs to this school.
  const sitting = await first<{
    id: string; title: string; academic_year: string | null; status: string;
  }>(
    "SELECT id, title, academic_year, status FROM exam_sittings WHERE id=? AND tenant_id=?",
    [sittingId, active.tenant_id]
  );
  if (!sitting) redirect("/student");

  // Load all papers (exams) that are part of this sitting.
  // exam_sitting_papers is the join table linking sittings → exams.
  const papers = await all<{
    sitting_paper_id: string; exam_id: string; sort_order: number;
    exam_title: string; duration_mins: number | null; results_published_at: string | null;
    pass_mark_percent: number | null;
  }>(
    `SELECT esp.id AS sitting_paper_id, esp.exam_id, esp.sort_order,
       e.title AS exam_title, e.duration_mins, e.results_published_at, e.pass_mark_percent
     FROM exam_sitting_papers esp
     JOIN exams e ON e.id = esp.exam_id
     WHERE esp.sitting_id=?
     ORDER BY esp.sort_order ASC`,
    [sittingId]
  );

  // For each exam paper, find this student's most recent SUBMITTED attempt.
  // We also check whether results have been published before showing scores.
  const paperResults = await Promise.all(
    papers.map(async (paper) => {
      const resultsReleased =
        paper.results_published_at &&
        Date.parse(paper.results_published_at) <= Date.now();

      // Only load the attempt if results are published.
      const attempt = resultsReleased
        ? await first<{
            id: string; score_raw: number | null; score_total: number | null;
            score_pct: number | null; grade: string | null;
            pass_mark_percent: number | null; grading_status: string;
            submitted_at: string | null; attempt_no: number;
          }>(
            `SELECT id, score_raw, score_total, score_pct, grade, pass_mark_percent,
               grading_status, submitted_at, attempt_no
             FROM exam_attempts
             WHERE exam_id=? AND user_id=? AND tenant_id=? AND status='SUBMITTED'
             ORDER BY attempt_no DESC LIMIT 1`,
            [paper.exam_id, auth.user!.id, active.tenant_id]
          )
        : null;

      return { ...paper, attempt, resultsReleased };
    })
  );

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <main className="max-w-2xl mx-auto p-4 mt-4">
      {/* Header */}
      <Card>
        <a href="/student" className="text-sm text-gray-400 hover:underline">
          ← Back to My Exams
        </a>
        <h1 className="text-lg font-bold mt-2">{sitting.title}</h1>
        {sitting.academic_year && (
          <div className="text-sm text-gray-500">{sitting.academic_year}</div>
        )}
        <div className="mt-1 flex items-center gap-2">
          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
            sitting.status === "ACTIVE" ? "bg-green-50 text-green-700" :
            sitting.status === "CLOSED" ? "bg-red-50 text-red-700" :
            "bg-gray-100 text-gray-500"
          }`}>
            {sitting.status}
          </span>
          <span className="text-xs text-gray-400">{papers.length} paper{papers.length !== 1 ? "s" : ""}</span>
        </div>
      </Card>

      {/* No papers */}
      {papers.length === 0 && (
        <Card>
          <p className="text-sm text-gray-400 text-center py-4">
            No exam papers have been added to this sitting yet.
          </p>
        </Card>
      )}

      {/* Paper result cards — one per exam in the sitting */}
      {paperResults.map((paper, index) => {
        const attempt = paper.attempt;
        const pct = attempt?.score_pct !== null && attempt?.score_pct !== undefined
          ? Math.round(Number(attempt.score_pct))
          : null;
        const passed =
          attempt?.pass_mark_percent !== null && attempt?.pass_mark_percent !== undefined && pct !== null
            ? pct >= Number(attempt.pass_mark_percent)
            : null;

        return (
          <Card key={paper.sitting_paper_id}>
            {/* Paper title row */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  {/* Paper number badge */}
                  <span className="inline-flex items-center justify-center w-6 h-6 bg-teal-700 text-white text-xs font-bold rounded-full shrink-0">
                    {index + 1}
                  </span>
                  <h2 className="text-sm font-semibold">{paper.exam_title}</h2>
                </div>
                {paper.duration_mins && (
                  <p className="text-xs text-gray-400 mt-1 ml-8">{paper.duration_mins} minutes</p>
                )}
              </div>

              {/* Pass/Fail badge */}
              {passed !== null && (
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ${
                  passed ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                }`}>
                  {passed ? "PASS" : "FAIL"}
                </span>
              )}
            </div>

            {/* Results — shown only when published */}
            {paper.resultsReleased && attempt ? (
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                {pct !== null && (
                  <div className="bg-gray-50 rounded-lg p-2">
                    <div className="text-xl font-bold text-teal-700">{pct}%</div>
                    <div className="text-xs text-gray-500 mt-0.5">Score</div>
                  </div>
                )}
                {attempt.score_raw !== null && (
                  <div className="bg-gray-50 rounded-lg p-2">
                    <div className="text-xl font-bold">{attempt.score_raw}/{attempt.score_total}</div>
                    <div className="text-xs text-gray-500 mt-0.5">Marks</div>
                  </div>
                )}
                {attempt.grade && (
                  <div className="bg-gray-50 rounded-lg p-2">
                    <div className="text-xl font-bold">{attempt.grade}</div>
                    <div className="text-xs text-gray-500 mt-0.5">Grade</div>
                  </div>
                )}
                <div className="bg-gray-50 rounded-lg p-2">
                  <div className={`text-xs font-semibold px-2 py-0.5 rounded-full inline-block mt-1 ${
                    attempt.grading_status === "FULLY_GRADED"
                      ? "bg-green-50 text-green-700"
                      : "bg-amber-50 text-amber-700"
                  }`}>
                    {attempt.grading_status === "FULLY_GRADED" ? "Graded" : "Pending"}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">Status</div>
                </div>
              </div>
            ) : paper.resultsReleased && !attempt ? (
              // Results published but this student has no submitted attempt.
              <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                No completed attempt found for this paper.
              </p>
            ) : (
              // Results not yet published.
              <p className="mt-2 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                Results not yet released.
              </p>
            )}

            {/* Link to full attempt results if available and released */}
            {paper.resultsReleased && attempt && (
              <div className="mt-3 text-right">
                <a
                  href={`/attempt-results?attempt_id=${attempt.id}`}
                  className="text-xs text-teal-700 hover:underline"
                >
                  View full results →
                </a>
              </div>
            )}
          </Card>
        );
      })}
    </main>
  );
}
