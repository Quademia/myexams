// src/app/sitting-results/page.tsx
// Sitting results page — shows a student their results across all papers in a sitting.

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card } from "@/components/ui/Card";

// ── Types ───────────────────────────────────────────────────────────────

interface SittingRow {
  id: string;
  title: string;
  academic_year: string | null;
  status: string;
}

interface PaperRow {
  exam_id: string;
  sort_order: number;
  title: string;
  score_display: string;
  results_published_at: string | null;
  exam_status: string;
  course_title: string;
}

interface AttemptRow {
  id: string;
  score_raw: number | null;
  score_total: number | null;
  score_pct: number | null;
  grade: string | null;
  pass_mark_percent: number | null;
  grading_status: string;
  submitted_at: string | null;
  attempt_no: number;
}

interface PaperResult {
  paper: PaperRow;
  attempt: AttemptRow | null;
  resultsReleased: boolean;
}

// ── Page component ──────────────────────────────────────────────────────

export default async function SittingResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ sitting_id?: string }>;
}) {
  const params = await searchParams;
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "STUDENT") redirect("/");

  const { first, all } = getDb();
  const userId = auth.user!.id;
  const tid = active.tenant_id;
  const sittingId = params.sitting_id || "";

  // Load sitting
  const sitting = await first<SittingRow>(
    `SELECT * FROM exam_sittings WHERE id=? AND tenant_id=?`,
    [sittingId, tid]
  );
  if (!sitting) redirect("/student");

  // Guard — student must have at least one submitted attempt in this sitting
  const guardRow = await first<{ c: number }>(
    `SELECT COUNT(*) AS c FROM exam_attempts ea
     JOIN exam_sitting_papers esp ON esp.exam_id = ea.exam_id
     WHERE esp.sitting_id=? AND ea.user_id=? AND ea.tenant_id=? AND ea.status='SUBMITTED'`,
    [sittingId, userId, tid]
  );
  if (Number(guardRow?.c ?? 0) === 0) redirect("/student");

  // Load papers in sort order
  const papers = await all<PaperRow>(
    `SELECT esp.exam_id, esp.sort_order,
            e.title, e.score_display, e.results_published_at,
            e.status AS exam_status, c.title AS course_title
     FROM exam_sitting_papers esp
     JOIN exams e ON e.id = esp.exam_id
     JOIN courses c ON c.id = e.course_id
     WHERE esp.sitting_id=?
     ORDER BY esp.sort_order ASC`,
    [sittingId]
  );
  if (papers.length === 0) redirect("/student");

  // For each paper, load the student's most recent submitted attempt (if results released)
  const paperResults: PaperResult[] = await Promise.all(
    papers.map(async (paper) => {
      const resultsReleased = !!(
        paper.results_published_at &&
        Date.parse(paper.results_published_at) <= Date.now()
      );

      const attempt = resultsReleased
        ? await first<AttemptRow>(
            `SELECT id, score_raw, score_total, score_pct, grade,
                    pass_mark_percent, grading_status, submitted_at, attempt_no
             FROM exam_attempts
             WHERE exam_id=? AND user_id=? AND tenant_id=? AND status='SUBMITTED'
             ORDER BY attempt_no DESC LIMIT 1`,
            [paper.exam_id, userId, tid]
          )
        : null;

      return { paper, attempt, resultsReleased };
    })
  );

  // Sitting status badge
  const statusStyles: Record<string, string> = {
    ACTIVE: "bg-green-50 text-green-700",
    CLOSED: "bg-red-50 text-red-700",
    DRAFT: "bg-gray-100 text-gray-500",
  };

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <main className="max-w-2xl mx-auto p-4">
      {/* Header card */}
      <Card>
        <a href="/student" className="text-teal-700 text-sm hover:underline">
          ← Back to My Exams
        </a>
        <h1 className="text-lg font-bold mt-2">{sitting.title}</h1>
        {sitting.academic_year && (
          <div className="text-sm text-gray-400 mt-0.5">{sitting.academic_year}</div>
        )}
        <div className="flex items-center gap-2 mt-2">
          <span
            className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
              statusStyles[sitting.status] || statusStyles.DRAFT
            }`}
          >
            {sitting.status}
          </span>
          <span className="text-xs text-gray-500">
            {papers.length} paper{papers.length !== 1 ? "s" : ""}
          </span>
        </div>
      </Card>

      {/* Paper cards */}
      {paperResults.map((pr, idx) => {
        const { paper, attempt, resultsReleased } = pr;
        const sd = paper.score_display || "BOTH";
        const scoreHidden = sd === "NONE" || sd === "HIDDEN";

        const scorePct = attempt?.score_pct != null ? Number(attempt.score_pct) : null;
        const scoreRaw = attempt?.score_raw != null ? Number(attempt.score_raw) : null;
        const scoreTotal = attempt?.score_total != null ? Number(attempt.score_total) : null;

        const hasPassMark =
          attempt?.pass_mark_percent !== null &&
          attempt?.pass_mark_percent !== undefined &&
          scorePct !== null;
        const passed = hasPassMark && scorePct! >= Number(attempt!.pass_mark_percent);

        return (
          <Card key={paper.exam_id}>
            {/* Paper header */}
            <div className="mb-3">
              <div className="font-medium text-sm">
                Paper {idx + 1} — {paper.title}
              </div>
              <div className="text-xs text-gray-400">{paper.course_title}</div>
            </div>

            {/* State 1 — Results not yet released */}
            {!resultsReleased && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-sm text-gray-400">Results not yet released.</p>
              </div>
            )}

            {/* State 2 — Released but no submitted attempt */}
            {resultsReleased && !attempt && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm text-amber-700">
                  No completed attempt found for this paper.
                </p>
              </div>
            )}

            {/* State 3 — Released and attempt exists */}
            {resultsReleased && attempt && (
              <>
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  {/* Score boxes based on score_display */}
                  {!scoreHidden && (
                    <>
                      {(sd === "BOTH" || sd === "PERCENT") && scorePct !== null && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-center">
                          <div className="text-xs text-gray-400 uppercase font-semibold">Score</div>
                          <div className="text-lg font-bold">{scorePct}%</div>
                        </div>
                      )}
                      {(sd === "BOTH" || sd === "MARKS") &&
                        scoreRaw !== null &&
                        scoreTotal !== null && (
                          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-center">
                            <div className="text-xs text-gray-400 uppercase font-semibold">Marks</div>
                            <div className="text-lg font-bold">
                              {scoreRaw}/{scoreTotal}
                            </div>
                          </div>
                        )}
                    </>
                  )}

                  {scoreHidden && (
                    <div className="text-sm text-gray-400 italic">Score hidden</div>
                  )}

                  {/* Grade box */}
                  {attempt.grade && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-center">
                      <div className="text-xs text-gray-400 uppercase font-semibold">Grade</div>
                      <div className="text-lg font-bold text-teal-700">{attempt.grade}</div>
                    </div>
                  )}

                  {/* Grading status */}
                  {attempt.grading_status === "FULLY_GRADED" && (
                    <span className="inline-block px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-xs font-semibold">
                      Graded
                    </span>
                  )}
                  {attempt.grading_status === "AUTO_GRADED" && (
                    <span className="inline-block px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold">
                      Pending
                    </span>
                  )}

                  {/* Pass / fail badge */}
                  {hasPassMark &&
                    (passed ? (
                      <span className="inline-block px-3 py-0.5 rounded-full bg-green-50 text-green-700 text-xs font-bold">
                        ✓ PASS
                      </span>
                    ) : (
                      <span className="inline-block px-3 py-0.5 rounded-full bg-red-50 text-red-700 text-xs font-bold">
                        ✗ FAIL
                      </span>
                    ))}
                </div>

                {/* Full results link */}
                <div className="text-right">
                  <a
                    href={`/attempt-results?attempt_id=${attempt.id}`}
                    className="text-sm text-teal-700 hover:underline"
                  >
                    View full results →
                  </a>
                </div>
              </>
            )}
          </Card>
        );
      })}
    </main>
  );
}
