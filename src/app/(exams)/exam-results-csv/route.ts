// src/app/exam-results-csv/route.ts
// GET route handler — exports exam results as a CSV download.
// Auth: TEACHER (must own the course) or SCHOOL_ADMIN (tenant check sufficient).

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, pickActiveMembership, fmtISO } from "@/lib/auth";
import { getDb } from "@/lib/db";

// ---------- Helpers ----------

/** Format seconds into a human-readable duration like '1h 23m', '45m 12s', '30s'. */
function formatTime(secs: number | null): string {
  if (secs === null || secs === undefined) return "";
  const s = Math.round(secs);
  if (s < 0) return "";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

/** Escape a value for CSV — wraps in quotes if it contains commas, quotes, or newlines. */
const csvEsc = (v: unknown): string => {
  const s = v === null || v === undefined ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n"))
    return '"' + s.replaceAll('"', '""') + '"';
  return s;
};

// ---------- Route ----------

export async function GET(request: NextRequest) {
  // Auth
  let auth;
  try {
    auth = await requireAuth();
  } catch {
    return NextResponse.redirect(new URL("/teacher", request.url));
  }
  const active = pickActiveMembership(auth);
  if (!active || (active.role !== "TEACHER" && active.role !== "SCHOOL_ADMIN")) {
    return NextResponse.redirect(new URL("/teacher", request.url));
  }

  const examId = request.nextUrl.searchParams.get("exam_id");
  if (!examId) return NextResponse.redirect(new URL("/teacher", request.url));

  const { all, first } = getDb();
  const tid = active.tenant_id;

  // Fetch exam
  const exam = await first<{
    id: string; title: string; max_attempts: number;
    pass_mark_percent: number | null; course_id: string;
  }>(
    "SELECT id, title, max_attempts, pass_mark_percent, course_id FROM exams WHERE id=? AND tenant_id=?",
    [examId, tid]
  );
  if (!exam) return NextResponse.redirect(new URL("/teacher", request.url));

  // For TEACHER, verify they own the course
  if (active.role === "TEACHER") {
    const owns = await first(
      "SELECT 1 FROM course_teachers WHERE course_id=? AND user_id=?",
      [exam.course_id, auth.user!.id]
    );
    if (!owns) return NextResponse.redirect(new URL("/teacher", request.url));
  }

  // Fetch custom field definitions
  const customFieldDefs = await all<{ id: string; field_label: string }>(
    "SELECT id, field_label FROM exam_custom_fields WHERE exam_id=? ORDER BY sort_order ASC",
    [examId]
  );

  // Fetch submitted attempts
  const attempts = await all<{
    id: string; student_name: string; attempt_no: number;
    grading_status: string; score_raw: number | null; score_total: number | null;
    score_pct: number | null; grade: string | null; pass_mark_percent: number | null;
    time_taken_secs: number | null; submitted_at: string | null;
    custom_fields_json: string | null;
  }>(
    `SELECT ea.id, u.name AS student_name, ea.attempt_no,
       ea.grading_status, ea.score_raw, ea.score_total, ea.score_pct,
       ea.grade, ea.pass_mark_percent, ea.time_taken_secs, ea.submitted_at,
       ea.custom_fields_json
     FROM exam_attempts ea
     JOIN qa_users u ON u.id = ea.user_id
     WHERE ea.exam_id=? AND ea.tenant_id=? AND ea.status='SUBMITTED'
     ORDER BY u.name ASC, ea.attempt_no ASC`,
    [examId, tid]
  );

  // Build headers (conditional columns)
  const headers: string[] = ["Student Name"];
  for (const def of customFieldDefs) {
    headers.push(def.field_label);
  }
  if (exam.max_attempts > 1) headers.push("Attempt #");
  headers.push("Grading Status", "Score", "Total", "%", "Grade");
  if (exam.pass_mark_percent !== null) headers.push("Pass/Fail");
  headers.push("Time Taken", "Submitted At");

  // Build rows
  const csvRows = attempts.map((a) => {
    let customFields: Record<string, string> = {};
    if (a.custom_fields_json) {
      try { customFields = JSON.parse(a.custom_fields_json); } catch { /* ignore */ }
    }

    const vals: (string | number)[] = [a.student_name];
    for (const def of customFieldDefs) {
      vals.push(customFields[def.id] || "");
    }
    if (exam.max_attempts > 1) vals.push(a.attempt_no);
    vals.push(a.grading_status === "AUTO_GRADED" ? "Needs Grading" : "Fully Graded");
    vals.push(a.score_raw !== null ? a.score_raw : "");
    vals.push(a.score_total !== null ? a.score_total : "");
    vals.push(a.score_pct !== null ? a.score_pct : "");
    vals.push(a.grade || "");
    if (exam.pass_mark_percent !== null) {
      if (a.score_pct !== null && a.pass_mark_percent !== null) {
        vals.push(a.score_pct >= a.pass_mark_percent ? "Pass" : "Fail");
      } else {
        vals.push("");
      }
    }
    vals.push(formatTime(a.time_taken_secs));
    vals.push(a.submitted_at ? fmtISO(a.submitted_at) : "");

    return vals.map(csvEsc).join(",");
  });

  const csv = [headers.map(csvEsc).join(","), ...csvRows].join("\n");

  const safeTitle = (exam.title || "results").replace(/[^a-z0-9-]/gi, "_").slice(0, 50);
  const filename = `${safeTitle}-${examId.slice(0, 8)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
