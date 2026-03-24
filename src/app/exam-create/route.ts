// src/app/exam-create/route.ts
// Exam Create — a POST route handler that creates a new exam row.
//
// WHY THIS IS A ROUTE HANDLER (not a page):
// This endpoint doesn't render any HTML. Its only job is to:
//   1. Read form data (course_id and title)
//   2. Insert a new exam row in the database
//   3. Redirect the teacher to the exam builder for the new exam
//
// Route Handlers in Next.js are like traditional API endpoints — they respond
// to HTTP methods (GET, POST, etc.) without rendering a page.
//
// HOW IT'S USED:
// Any form in the app can POST to /exam-create with course_id and title fields.
// For example, the course detail page has a "New Exam" button that posts here.
//
// SECURITY:
// - Requires the user to be logged in (requireAuth)
// - Only TEACHER or SCHOOL_ADMIN can create exams
// - The new exam is scoped to the active school (tenant_id)
// - New exams start as DRAFT status so nothing is visible to students yet

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function POST(request: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  // Must be a teacher or admin to create exams.
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || (active.role !== "TEACHER" && active.role !== "SCHOOL_ADMIN")) {
    redirect("/");
  }

  // ── Parse form data ─────────────────────────────────────────────────────────
  // request.formData() parses an HTML form submission (Content-Type: application/x-www-form-urlencoded).
  const formData = await request.formData();
  const courseId = (formData.get("course_id") as string || "").trim();
  const title = (formData.get("title") as string || "New Exam").trim() || "New Exam";

  if (!courseId) {
    // If no course_id was provided, redirect back.
    // In a future improvement this could show an error message.
    redirect("/teacher");
  }

  // ── Verify the course ───────────────────────────────────────────────────────
  const { first, run } = getDb();

  // Make sure the course belongs to this school — prevents a teacher from
  // attaching an exam to another school's course.
  const course = await first<{ id: string }>(
    "SELECT id FROM courses WHERE id=? AND tenant_id=?",
    [courseId, active.tenant_id]
  );
  if (!course) redirect("/teacher");

  // ── Create the exam ─────────────────────────────────────────────────────────
  const examId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Default values chosen to be safe and sensible:
  //   status = DRAFT        → invisible to students until published
  //   duration_mins = 60    → one hour, teacher can change in builder
  //   pass_mark_percent = 50 → standard pass mark, teacher can change
  //   max_attempts = 1      → students get one shot by default
  //   allow_review = 0      → review disabled by default
  //   shuffle_questions = 0 → questions in teacher-defined order by default
  //   score_display = BOTH  → show both percentage and raw score
  await run(
    `INSERT INTO exams
       (id, tenant_id, course_id, title, description,
        status, duration_mins, time_limit_minutes,
        shuffle_questions, score_display, pass_mark_percent,
        allow_review, max_attempts, exam_password,
        starts_at, ends_at, results_published_at,
        created_by, created_at, updated_at)
     VALUES (?,?,?,?,NULL,
             'DRAFT', 60, 60,
             0, 'BOTH', 50,
             0, 1, NULL,
             NULL, NULL, NULL,
             ?,?,?)`,
    [examId, active.tenant_id, courseId, title, auth.user!.id, now, now]
  );

  // ── Redirect to the exam builder ────────────────────────────────────────────
  // The teacher lands on the Settings tab of the builder so they can configure
  // the exam details before adding questions.
  redirect(`/exam-builder?exam_id=${examId}`);
}
