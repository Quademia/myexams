// src/app/student/page.tsx
// Student dashboard — shows available exams with status badges,
// attempt tracking, and sitting results.

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership, roleLabel, isIsoInPast } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card } from "@/components/Card";

export default async function StudentPage() {
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "STUDENT") redirect("/");

  const { all, first } = getDb();
  const userId = auth.user!.id;
  const tid = active.tenant_id;
  const now = Date.now();

  // Load exams this student has access to.
  const exams = await all<{
    exam_id: string; title: string; status: string; duration_mins: number | null;
    max_attempts: number; starts_at: string | null; ends_at: string | null;
    exam_password: string | null; results_published_at: string | null;
    course_title: string;
  }>(
    `SELECT e.id AS exam_id, e.title, e.status, e.duration_mins, e.max_attempts,
       e.starts_at, e.ends_at, e.exam_password, e.results_published_at,
       c.title AS course_title
     FROM exam_access ea
     JOIN exams e ON e.id = ea.exam_id
     JOIN courses c ON c.id = e.course_id
     WHERE ea.user_id=? AND e.tenant_id=?
     ORDER BY e.title ASC`,
    [userId, tid]
  );

  // Load all non-abandoned attempts.
  const allAttempts = await all<{
    id: string; exam_id: string; status: string; attempt_no: number;
  }>(
    `SELECT id, exam_id, status, attempt_no
     FROM exam_attempts
     WHERE user_id=? AND tenant_id=? AND status != 'ABANDONED'
     ORDER BY attempt_no ASC`,
    [userId, tid]
  );

  const attemptsByExam: Record<string, {
    all: typeof allAttempts;
    submitted: typeof allAttempts;
    inProgress: typeof allAttempts[0] | null;
  }> = {};
  for (const a of allAttempts) {
    if (!attemptsByExam[a.exam_id]) attemptsByExam[a.exam_id] = { all: [], submitted: [], inProgress: null };
    attemptsByExam[a.exam_id].all.push(a);
    if (a.status === "SUBMITTED") attemptsByExam[a.exam_id].submitted.push(a);
    if (a.status === "IN_PROGRESS") attemptsByExam[a.exam_id].inProgress = a;
  }

  // My sittings — sittings where student has at least one submitted attempt.
  const mySittings = await all<{ id: string; title: string; academic_year: string | null }>(
    `SELECT DISTINCT es.id, es.title, es.academic_year
     FROM exam_sittings es
     JOIN exam_sitting_papers esp ON esp.sitting_id = es.id
     JOIN exam_attempts ea ON ea.exam_id = esp.exam_id AND ea.user_id=? AND ea.status='SUBMITTED'
     WHERE es.tenant_id=?
     ORDER BY es.created_at DESC`,
    [userId, tid]
  );

  // For each sitting, count total papers and released results.
  const sittingData = [];
  for (const s of mySittings) {
    const total = await first<{ c: number }>("SELECT COUNT(*) AS c FROM exam_sitting_papers WHERE sitting_id=?", [s.id]);
    const released = await first<{ c: number }>(
      `SELECT COUNT(*) AS c FROM exam_sitting_papers esp
       JOIN exams e ON e.id = esp.exam_id
       WHERE esp.sitting_id=? AND e.results_published_at IS NOT NULL AND e.results_published_at <= ?`,
      [s.id, new Date().toISOString()]
    );
    sittingData.push({ ...s, total: Number(total?.c ?? 0), released: Number(released?.c ?? 0) });
  }

  // Badge helper.
  function getBadge(exam: typeof exams[0]) {
    const atts = attemptsByExam[exam.exam_id] || { all: [], submitted: [], inProgress: null };
    const startsInFuture = exam.starts_at && Date.parse(exam.starts_at) > now;
    const endsInPast = exam.ends_at && Date.parse(exam.ends_at) < now;
    const remaining = Math.max(0, exam.max_attempts - atts.all.length);

    if (exam.status === "PUBLISHED") {
      if (startsInFuture) return { label: "Upcoming", style: "bg-gray-100 text-gray-500" };
      if (endsInPast) return { label: "Closed", style: "bg-red-50 text-red-700" };
      if (atts.inProgress || remaining > 0) return { label: "Open", style: "bg-green-50 text-green-700" };
      return { label: "Completed", style: "bg-blue-50 text-blue-700" };
    }
    if (exam.status === "CLOSED") {
      return atts.all.length === 0
        ? { label: "Closed", style: "bg-red-50 text-red-700" }
        : { label: "Completed", style: "bg-blue-50 text-blue-700" };
    }
    return { label: exam.status, style: "bg-gray-100 text-gray-500" };
  }

  // Filter out drafts.
  const visibleExams = exams.filter((e) => e.status !== "DRAFT");

  return (
    <main className="max-w-5xl mx-auto p-4">
      {/* Header */}
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-bold">Student Dashboard</h1>
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

      {/* My Sittings */}
      {sittingData.length > 0 && (
        <>
          <h2 className="text-base font-semibold mt-6 mb-3">My Sittings</h2>
          {sittingData.map((s) => (
            <Card key={s.id}>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="text-lg font-bold">{s.title}</div>
                  {s.academic_year && <div className="text-xs text-gray-400">{s.academic_year}</div>}
                  <div className="text-sm text-gray-500 mt-1">
                    {s.released} of {s.total} result{s.total !== 1 ? "s" : ""} available
                  </div>
                </div>
                <a href={`/sitting-results?sitting_id=${s.id}`}
                  className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800 no-underline">
                  View Sitting Results
                </a>
              </div>
            </Card>
          ))}
        </>
      )}

      {/* My Exams */}
      <h2 className="text-base font-semibold mt-6 mb-3">My Exams</h2>
      {visibleExams.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-400 text-center py-6">No exams available yet. Check back later.</p>
        </Card>
      ) : (
        visibleExams.map((exam) => {
          const atts = attemptsByExam[exam.exam_id] || { all: [], submitted: [], inProgress: null };
          const remaining = Math.max(0, exam.max_attempts - atts.all.length);
          const badge = getBadge(exam);
          const resultsReleased = isIsoInPast(exam.results_published_at);

          return (
            <Card key={exam.exam_id}>
              <div className="flex justify-between items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h2 className="text-lg font-bold m-0">{exam.title}</h2>
                    {exam.exam_password && <span title="Password required">🔒</span>}
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${badge.style}`}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500 mb-2">{exam.course_title}</div>
                  <div className="flex gap-5 text-xs text-gray-500 flex-wrap">
                    <span>{exam.duration_mins || 60} mins</span>
                    <span>{remaining} of {exam.max_attempts} attempt{exam.max_attempts !== 1 ? "s" : ""} remaining</span>
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap flex-shrink-0">
                  {/* Resume in-progress attempt */}
                  {atts.inProgress && (
                    <a href={`/attempt-take?attempt_id=${atts.inProgress.id}`}
                      className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800 no-underline">
                      Resume Exam
                    </a>
                  )}

                  {/* Start new attempt */}
                  {!atts.inProgress && remaining > 0 && (
                    <a href={`/attempt-start?exam_id=${exam.exam_id}`}
                      className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800 no-underline">
                      Start Exam
                    </a>
                  )}

                  {/* View results */}
                  {atts.submitted.length > 0 && (
                    atts.submitted.length === 1 ? (
                      <a
                        href={resultsReleased ? `/attempt-results?attempt_id=${atts.submitted[0].id}` : "#"}
                        className={`px-4 py-2 text-sm font-semibold rounded-lg no-underline ${
                          resultsReleased
                            ? "bg-teal-700 text-white hover:bg-teal-800"
                            : "bg-gray-200 text-gray-400 cursor-not-allowed"
                        }`}
                      >
                        View Results
                      </a>
                    ) : (
                      atts.submitted.map((a) => (
                        <a
                          key={a.id}
                          href={resultsReleased ? `/attempt-results?attempt_id=${a.id}` : "#"}
                          className={`px-3 py-1 text-xs font-semibold rounded-lg no-underline ${
                            resultsReleased
                              ? "bg-teal-700 text-white hover:bg-teal-800"
                              : "bg-gray-200 text-gray-400 cursor-not-allowed"
                          }`}
                        >
                          Attempt {a.attempt_no}
                        </a>
                      ))
                    )
                  )}
                </div>
              </div>
            </Card>
          );
        })
      )}
    </main>
  );
}
