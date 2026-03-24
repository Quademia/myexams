// src/app/attempt-take/page.tsx
// Attempt Take — placeholder for the interactive exam-taking interface.
//
// WHY THIS IS A PLACEHOLDER:
// The actual exam-taking interface needs significant client-side React:
//   - A live countdown timer that submits when it hits zero
//   - Per-question answer saving (so progress isn't lost on refresh)
//   - Navigation between questions
//   - Submission confirmation dialog
//   - Password field handling
//
// All of that requires "use client" components with hooks (useState, useEffect, etc.)
// which is a separate implementation pass. For now, this page confirms the attempt
// exists and gives the student a safe way back.
//
// ROUTE: /attempt-take?attempt_id=<id>
// ACCESS: STUDENT (must own the attempt), or TEACHER/ADMIN for review

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card } from "@/components/Card";

export default async function AttemptTakePage({
  searchParams,
}: {
  searchParams: Promise<{ attempt_id?: string }>;
}) {
  // ── Auth ──────────────────────────────────────────────────────────────────────
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active) redirect("/");

  // ── Params ────────────────────────────────────────────────────────────────────
  const params = await searchParams;
  const attemptId = params.attempt_id;
  if (!attemptId) redirect("/student");

  // ── Data loading ──────────────────────────────────────────────────────────────
  const { first } = getDb();

  // Students can only access their own attempts.
  // Teachers/admins can access any attempt in their school.
  let attempt;
  if (active.role === "STUDENT") {
    attempt = await first<{
      id: string; exam_id: string; status: string;
      attempt_no: number; started_at: string | null;
    }>(
      "SELECT id, exam_id, status, attempt_no, started_at FROM exam_attempts WHERE id=? AND user_id=? AND tenant_id=?",
      [attemptId, auth.user!.id, active.tenant_id]
    );
  } else {
    attempt = await first<{
      id: string; exam_id: string; status: string;
      attempt_no: number; started_at: string | null;
    }>(
      "SELECT id, exam_id, status, attempt_no, started_at FROM exam_attempts WHERE id=? AND tenant_id=?",
      [attemptId, active.tenant_id]
    );
  }

  if (!attempt) redirect("/student");

  // If the attempt is already submitted, redirect to results.
  if (attempt.status === "SUBMITTED") {
    redirect(`/attempt-results?attempt_id=${attemptId}`);
  }

  const exam = await first<{ id: string; title: string; duration_mins: number | null }>(
    "SELECT id, title, duration_mins FROM exams WHERE id=? AND tenant_id=?",
    [attempt.exam_id, active.tenant_id]
  );

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <main className="max-w-lg mx-auto p-4 mt-12">
      <Card>
        <div className="text-center py-6">
          {/* Status indicator */}
          <div className="inline-flex items-center justify-center w-16 h-16 bg-teal-50 text-teal-700 rounded-full mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
            </svg>
          </div>

          <h1 className="text-lg font-bold text-gray-800">Exam in progress</h1>
          {exam && <p className="text-sm text-gray-500 mt-1">{exam.title}</p>}
          <p className="text-xs text-gray-400 mt-1">Attempt {attempt.attempt_no}</p>

          {/* Developer note visible in the UI so the team knows this is a placeholder */}
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-left">
            <p className="text-xs font-semibold text-amber-700 mb-1">Coming Soon</p>
            <p className="text-xs text-amber-700">
              The interactive exam-taking interface is being built. It will include a
              live timer, per-question navigation, and auto-save. For now, your attempt
              has been started and will be waiting here when it's ready.
            </p>
          </div>

          {/* Attempt metadata */}
          {attempt.started_at && (
            <p className="text-xs text-gray-400 mt-3">
              Started at {new Date(attempt.started_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
          {exam?.duration_mins && (
            <p className="text-xs text-gray-400">
              Duration: {exam.duration_mins} minutes
            </p>
          )}

          {/* Navigation */}
          <div className="mt-5 flex flex-col gap-2">
            <a
              href="/student"
              className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 no-underline"
            >
              ← Back to My Exams
            </a>
            {exam && (
              <a
                href={`/attempt-start?exam_id=${exam.id}`}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 no-underline"
              >
                Back to Exam Info
              </a>
            )}
          </div>
        </div>
      </Card>
    </main>
  );
}
