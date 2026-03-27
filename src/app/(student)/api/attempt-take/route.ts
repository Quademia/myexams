// src/app/api/attempt-take/route.ts
// POST-only API route for the exam-taking client component.
// Handles two actions:
//   save   — autosave answers without submitting
//   submit — final submission with auto-grading

import { NextResponse } from "next/server";
import { requireAuth, pickActiveMembership } from "@/lib/auth";
import { getDb } from "@/lib/db";

// ── Types ───────────────────────────────────────────────────────────────

interface RequestBody {
  attempt_id: string;
  action: "save" | "submit";
  auto: boolean;
  answers: Record<string, string | string[] | null>;
  flags: Record<string, boolean>;
}

interface AttemptRow {
  id: string;
  tenant_id: string;
  exam_id: string;
  user_id: string;
  status: string;
  started_at: string;
  effective_duration_secs: number;
  grade_bands_json: string | null;
}

interface ExamRow {
  ends_at: string | null;
}

interface AnswerRow {
  id: string;
  question_id: string;
  question_type: string;
  marks: number;
  partial_marking: number;
  answer_json: string | null;
  score_awarded: number | null;
}

interface OptionRow {
  id: string;
  question_id: string;
  is_correct: number;
}

interface GradedRow {
  score_awarded: number | null;
  marks: number;
  question_type: string;
}

// ── POST handler ────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    const active = pickActiveMembership(auth);
    if (!active || active.role !== "STUDENT") {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body: RequestBody = await request.json();
    const { attempt_id: attemptId, action, auto, answers, flags } = body;
    const userId = auth.user!.id;
    const tid = active.tenant_id;

    const { first, all, run } = getDb();

    // ── Load and validate attempt ─────────────────────────────────────

    const attempt = await first<AttemptRow>(
      `SELECT * FROM exam_attempts WHERE id = ? AND user_id = ? AND tenant_id = ?`,
      [attemptId, userId, tid]
    );

    if (!attempt) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    if (attempt.status !== "IN_PROGRESS") {
      if (action === "save") {
        return NextResponse.json({ ok: false, error: "Not in progress" });
      }
      // submit on an already-submitted attempt — just redirect
      return NextResponse.json({ ok: true, redirect: `/attempt-complete?attempt_id=${attemptId}` });
    }

    // ── doAutoSubmit helper (no grading) ──────────────────────────────

    async function doAutoSubmit(attId: string) {
      const ts = new Date().toISOString();
      const att = await first<{ started_at: string; exam_id: string }>(
        `SELECT started_at, exam_id FROM exam_attempts WHERE id = ? AND status = 'IN_PROGRESS'`,
        [attId]
      );
      if (!att) return;
      const timeTakenSecs = Math.round((Date.parse(ts) - Date.parse(att.started_at)) / 1000);
      const ex = await first<{ ends_at: string | null }>(
        `SELECT ends_at FROM exams WHERE id = ?`,
        [att.exam_id]
      );
      const isLate = ex?.ends_at && Date.parse(ts) > Date.parse(ex.ends_at) ? 1 : 0;
      await run(
        `UPDATE exam_attempts SET status='SUBMITTED', submitted_at=?, time_taken_secs=?, auto_submitted=1, is_late=?, updated_at=? WHERE id=?`,
        [ts, timeTakenSecs, isLate, ts, attId]
      );
    }

    // ── HARD_CUT check ────────────────────────────────────────────────

    const exam = await first<ExamRow>(
      `SELECT ends_at FROM exams WHERE id = ?`,
      [attempt.exam_id]
    );

    if (exam?.ends_at && Date.now() > Date.parse(exam.ends_at)) {
      await doAutoSubmit(attemptId);
      return NextResponse.json({ ok: true, redirect: `/attempt-complete?attempt_id=${attemptId}` });
    }

    // ── Timer expiry check ────────────────────────────────────────────

    const deadlineMs = Date.parse(attempt.started_at) + attempt.effective_duration_secs * 1000;
    if (Date.now() >= deadlineMs) {
      await doAutoSubmit(attemptId);
      return NextResponse.json({ ok: true, redirect: `/attempt-complete?attempt_id=${attemptId}` });
    }

    // ── Save answers ──────────────────────────────────────────────────

    const now = new Date().toISOString();

    if (answers) {
      for (const [questionId, value] of Object.entries(answers)) {
        let answerJson: string | null = null;
        if (value === null || value === "" || (Array.isArray(value) && value.length === 0)) {
          answerJson = null;
        } else {
          answerJson = JSON.stringify(value);
        }
        const isFlagged = flags?.[questionId] ? 1 : 0;

        await run(
          `UPDATE exam_answers SET answer_json=?, is_flagged=?, updated_at=? WHERE attempt_id=? AND question_id=?`,
          [answerJson, isFlagged, now, attemptId, questionId]
        );
      }
    }

    // ── action = save ─────────────────────────────────────────────────

    if (action === "save") {
      await run(`UPDATE exam_attempts SET updated_at=? WHERE id=?`, [now, attemptId]);
      return NextResponse.json({ ok: true });
    }

    // ── action = submit ───────────────────────────────────────────────

    const submittedAt = new Date().toISOString();
    const timeTakenSecs = Math.round((Date.parse(submittedAt) - Date.parse(attempt.started_at)) / 1000);
    const isAutoSubmit = auto === true ? 1 : 0;
    const isLate = exam?.ends_at && Date.parse(submittedAt) > Date.parse(exam.ends_at) ? 1 : 0;

    await run(
      `UPDATE exam_attempts SET status='SUBMITTED', submitted_at=?, time_taken_secs=?, auto_submitted=?, is_late=?, updated_at=? WHERE id=?`,
      [submittedAt, timeTakenSecs, isAutoSubmit, isLate, submittedAt, attemptId]
    );

    // ── Auto-grading ──────────────────────────────────────────────────

    // Load answers with question details
    const allAnswers = await all<AnswerRow>(
      `SELECT ea.*, eq.question_type, eq.marks, eq.partial_marking
       FROM exam_answers ea
       JOIN exam_questions eq ON eq.id = ea.question_id
       WHERE ea.attempt_id = ?`,
      [attemptId]
    );

    // Load correct options for all questions
    const questionIds = allAnswers.map((a) => a.question_id);
    const allOpts =
      questionIds.length > 0
        ? await all<OptionRow>(
            `SELECT * FROM exam_question_options WHERE question_id IN (${questionIds.map(() => "?").join(",")})`,
            questionIds
          )
        : [];

    const optsByQ: Record<string, OptionRow[]> = {};
    for (const o of allOpts) {
      if (!optsByQ[o.question_id]) optsByQ[o.question_id] = [];
      optsByQ[o.question_id].push(o);
    }

    // Grade each answer
    const gradeNow = new Date().toISOString();
    for (const ans of allAnswers) {
      let scoreAwarded: number | null = null;
      const opts = optsByQ[ans.question_id] || [];
      let parsed: string | string[] | null = null;
      try {
        if (ans.answer_json) parsed = JSON.parse(ans.answer_json);
      } catch {
        /* ignore bad JSON */
      }

      if (ans.question_type === "MCQ" || ans.question_type === "TRUE_FALSE") {
        const correctOpt = opts.find((o) => o.is_correct === 1);
        if (correctOpt && parsed === correctOpt.id) {
          scoreAwarded = Number(ans.marks);
        } else {
          scoreAwarded = 0;
        }
      } else if (ans.question_type === "MULTIPLE_SELECT") {
        const correctIds = opts.filter((o) => o.is_correct === 1).map((o) => o.id);
        const selectedIds: string[] = Array.isArray(parsed) ? parsed : [];

        if (ans.partial_marking === 1) {
          // Proportional: +1 per correct selected, −1 per incorrect selected, floor 0
          let score = 0;
          const perMark = correctIds.length > 0 ? Number(ans.marks) / correctIds.length : 0;
          for (const id of selectedIds) {
            if (correctIds.includes(id)) score += perMark;
            else score -= perMark;
          }
          scoreAwarded = Math.max(0, Math.round(score * 100) / 100);
        } else {
          // All or nothing
          const allCorrect =
            correctIds.length === selectedIds.length &&
            correctIds.every((id) => selectedIds.includes(id));
          scoreAwarded = allCorrect ? Number(ans.marks) : 0;
        }
      } else if (ans.question_type === "SHORT_ANSWER" || ans.question_type === "ESSAY") {
        // Manual grading — skip, leave score_awarded as null
        continue;
      }

      if (scoreAwarded !== null) {
        await run(
          `UPDATE exam_answers SET score_awarded=?, updated_at=? WHERE id=?`,
          [scoreAwarded, gradeNow, ans.id]
        );
      }
    }

    // Recalculate attempt totals
    const gradedRows = await all<GradedRow>(
      `SELECT ea.score_awarded, eq.marks, eq.question_type
       FROM exam_answers ea
       JOIN exam_questions eq ON eq.id = ea.question_id
       WHERE ea.attempt_id = ?`,
      [attemptId]
    );

    const scoreTotal = gradedRows.reduce((sum, r) => sum + Number(r.marks || 0), 0);
    const scoreRaw = gradedRows.reduce(
      (sum, r) =>
        sum + (r.score_awarded !== null && r.score_awarded !== undefined ? Number(r.score_awarded) : 0),
      0
    );
    const scorePct = scoreTotal > 0 ? Math.round((scoreRaw / scoreTotal) * 10000) / 100 : 0;

    // Calculate grade from snapshotted grade_bands_json
    let grade: string | null = null;
    try {
      const bands = JSON.parse(attempt.grade_bands_json || "[]") as {
        label: string;
        min_percent: number;
      }[];
      for (const band of bands) {
        if (scorePct >= Number(band.min_percent)) {
          grade = band.label;
          break;
        }
      }
    } catch {
      /* ignore bad JSON */
    }

    // grading_status: FULLY_GRADED if no manual questions, AUTO_GRADED if any exist
    const needsManual = gradedRows.some(
      (r) =>
        (r.question_type === "SHORT_ANSWER" || r.question_type === "ESSAY") &&
        r.score_awarded === null
    );
    const gradingStatus = needsManual ? "AUTO_GRADED" : "FULLY_GRADED";

    await run(
      `UPDATE exam_attempts SET score_raw=?, score_total=?, score_pct=?, grade=?, grading_status=?, updated_at=? WHERE id=?`,
      [scoreRaw, scoreTotal, scorePct, grade, gradingStatus, gradeNow, attemptId]
    );

    return NextResponse.json({ ok: true, redirect: `/attempt-complete?attempt_id=${attemptId}` });
  } catch (err) {
    console.error("attempt-take POST error:", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
