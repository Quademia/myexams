// src/app/attempt-complete/page.tsx
// Post-submission confirmation screen — shown immediately after a student submits an exam.

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card } from "@/components/ui/Card";

// ── Types ───────────────────────────────────────────────────────────────

interface AttemptRow {
  id: string;
  exam_id: string;
  status: string;
}

interface ExamRow {
  title: string;
  results_release_policy: string;
  results_published_at: string | null;
}

// ── Page component ──────────────────────────────────────────────────────

export default async function AttemptCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ attempt_id?: string }>;
}) {
  const params = await searchParams;
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "STUDENT") redirect("/");

  const { first } = getDb();
  const userId = auth.user!.id;
  const tid = active.tenant_id;
  const attemptId = params.attempt_id || "";

  // Load attempt
  const attempt = await first<AttemptRow>(
    `SELECT * FROM exam_attempts WHERE id=? AND user_id=? AND tenant_id=?`,
    [attemptId, userId, tid]
  );
  if (!attempt) redirect("/student");
  if (attempt.status === "IN_PROGRESS") redirect(`/attempt-take?attempt_id=${attemptId}`);
  if (attempt.status !== "SUBMITTED") redirect("/student");

  // Load exam
  const exam = await first<ExamRow>(
    `SELECT title, results_release_policy, results_published_at FROM exams WHERE id=?`,
    [attempt.exam_id]
  );
  if (!exam) redirect("/student");

  // Determine results availability
  const resultsReleased =
    exam.results_published_at &&
    Date.parse(exam.results_published_at) <= Date.now();

  // Choose the appropriate message
  let resultsMessage: string;
  if (resultsReleased) {
    resultsMessage = "Your results are available now.";
  } else if (exam.results_release_policy === "AFTER_CLOSE") {
    resultsMessage = "Results will be available once the exam closes for all students.";
  } else if (exam.results_release_policy === "IMMEDIATE") {
    resultsMessage = "Your results are being processed.";
  } else {
    resultsMessage = "Your results will be released by your teacher.";
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-lg">
        <Card>
          <div className="text-center">
            {/* Checkmark */}
            <div className="text-5xl mb-4">✅</div>

            {/* Heading */}
            <h1 className="text-xl font-bold">Exam Submitted</h1>
            <p className="text-sm text-gray-500 mt-1">{exam.title}</p>

            {/* Divider */}
            <hr className="my-4 border-gray-200" />

            {/* Results message */}
            <p className="text-sm text-gray-700">{resultsMessage}</p>

            {/* Action buttons */}
            <div className="mt-6 space-y-3">
              {resultsReleased && (
                <a
                  href={`/attempt-results?attempt_id=${attemptId}`}
                  className="block w-full px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700 text-center no-underline"
                >
                  View My Results →
                </a>
              )}
              <a
                href="/student"
                className="block text-sm text-teal-700 hover:underline"
              >
                ← Back to My Exams
              </a>
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}
