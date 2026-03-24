// src/app/sitting-builder/page.tsx
// Sitting Builder — the main page for managing an exam sitting.
// 3 tabs: Settings, Papers (with merged approval gates), Results.
//
// This is the most complex page in the app. Each tab is broken into
// its own async component for readability.

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership, fmtISO } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card } from "@/components/Card";
import { TabNav } from "@/components/TabNav";

// ============================================================
// Server Actions
// ============================================================

async function saveSettingsAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const sittingId = formData.get("sitting_id") as string;
  const title = (formData.get("title") as string || "").trim();
  if (!sittingId || !title) redirect("/sittings");

  const description = (formData.get("description") as string || "").trim() || null;
  const academicYear = (formData.get("academic_year") as string || "").trim() || null;
  const status = ["DRAFT", "ACTIVE", "CLOSED"].includes(formData.get("status") as string)
    ? formData.get("status") as string : "DRAFT";

  const { run } = getDb();
  await run(
    `UPDATE exam_sittings SET title=?, description=?, academic_year=?, status=?, updated_at=?
     WHERE id=? AND tenant_id=?`,
    [title, description, academicYear, status, new Date().toISOString(), sittingId, active.tenant_id]
  );
  redirect(`/sitting-builder?sitting_id=${sittingId}&tab=settings`);
}

async function addExistingPaperAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const sittingId = formData.get("sitting_id") as string;
  const examId = (formData.get("exam_id") as string || "").trim();
  if (!sittingId || !examId) redirect("/sittings");

  const { first, run } = getDb();
  const now = new Date().toISOString();

  // Verify exam exists in this school.
  const exam = await first("SELECT id FROM exams WHERE id=? AND tenant_id=?", [examId, active.tenant_id]);
  if (!exam) redirect(`/sitting-builder?sitting_id=${sittingId}&tab=papers`);

  // Don't add duplicates.
  const already = await first("SELECT id FROM exam_sitting_papers WHERE sitting_id=? AND exam_id=?", [sittingId, examId]);
  if (!already) {
    const maxRow = await first<{ mx: number | null }>("SELECT MAX(sort_order) AS mx FROM exam_sitting_papers WHERE sitting_id=?", [sittingId]);
    const sortOrder = (maxRow?.mx !== null && maxRow?.mx !== undefined) ? maxRow.mx + 1 : 1;
    await run(
      "INSERT INTO exam_sitting_papers (id, sitting_id, exam_id, sort_order, created_at) VALUES (?,?,?,?,?)",
      [crypto.randomUUID(), sittingId, examId, sortOrder, now]
    );
  }
  redirect(`/sitting-builder?sitting_id=${sittingId}&tab=papers`);
}

async function createPaperAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const sittingId = formData.get("sitting_id") as string;
  const title = (formData.get("title") as string || "").trim();
  const courseId = (formData.get("course_id") as string || "").trim();
  const teacherId = (formData.get("teacher_id") as string || "").trim();
  if (!sittingId || !title || !courseId || !teacherId) {
    redirect(`/sitting-builder?sitting_id=${sittingId}&tab=papers`);
  }

  const { first, run } = getDb();
  const now = new Date().toISOString();
  const examId = crypto.randomUUID();

  // #ST-8 — Validate course is ACTIVE and belongs to tenant.
  const course = await first("SELECT id FROM courses WHERE id=? AND tenant_id=? AND status='ACTIVE'", [courseId, active.tenant_id]);
  if (!course) redirect(`/sitting-builder?sitting_id=${sittingId}&tab=papers`);

  // #ST-9 — Re-validate teacher has TEACHER role and ACTIVE membership.
  const teacher = await first(
    "SELECT id FROM memberships WHERE user_id=? AND tenant_id=? AND role='TEACHER' AND status='ACTIVE'",
    [teacherId, active.tenant_id]
  );
  if (!teacher) redirect(`/sitting-builder?sitting_id=${sittingId}&tab=papers`);

  // #ST-1 — Create the exam (fixed: use correct column name duration_mins, not time_limit_minutes).
  await run(
    `INSERT INTO exams (id, tenant_id, course_id, title, status, created_by, created_at, updated_at)
     VALUES (?,?,?,?,'DRAFT',?,?,?)`,
    [examId, active.tenant_id, courseId, title, teacherId, now, now]
  );

  // #ST-6 — Auto-assign teacher to course_teachers if not already there.
  const alreadyTeaching = await first(
    "SELECT course_id FROM course_teachers WHERE course_id=? AND user_id=?",
    [courseId, teacherId]
  );
  if (!alreadyTeaching) {
    await run(
      "INSERT INTO course_teachers (course_id, user_id, created_at) VALUES (?,?,?)",
      [courseId, teacherId, now]
    );
  }

  // Add to sitting.
  const maxRow = await first<{ mx: number | null }>("SELECT MAX(sort_order) AS mx FROM exam_sitting_papers WHERE sitting_id=?", [sittingId]);
  const sortOrder = (maxRow?.mx !== null && maxRow?.mx !== undefined) ? maxRow.mx + 1 : 1;
  await run(
    "INSERT INTO exam_sitting_papers (id, sitting_id, exam_id, sort_order, created_at) VALUES (?,?,?,?,?)",
    [crypto.randomUUID(), sittingId, examId, sortOrder, now]
  );

  redirect(`/sitting-builder?sitting_id=${sittingId}&tab=papers`);
}

async function removePaperAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const sittingId = formData.get("sitting_id") as string;
  const paperId = formData.get("paper_id") as string;
  const { run } = getDb();
  await run("DELETE FROM exam_sitting_papers WHERE id=? AND sitting_id=?", [paperId, sittingId]);
  redirect(`/sitting-builder?sitting_id=${sittingId}&tab=papers`);
}

// ============================================================
// Page Component
// ============================================================

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ACTIVE: "bg-green-50 text-green-700",
    CLOSED: "bg-red-50 text-red-700",
    DRAFT: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${styles[status] || styles.DRAFT}`}>
      {status}
    </span>
  );
}

export default async function SittingBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ sitting_id?: string; tab?: string }>;
}) {
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const params = await searchParams;
  const sittingId = params.sitting_id;
  const tab = params.tab || "settings";
  if (!sittingId) redirect("/sittings");

  const { first } = getDb();
  const sitting = await first<{
    id: string; title: string; description: string | null;
    academic_year: string | null; status: string;
  }>("SELECT id, title, description, academic_year, status FROM exam_sittings WHERE id=? AND tenant_id=?",
    [sittingId, active.tenant_id]);
  if (!sitting) redirect("/sittings");

  const base = `/sitting-builder?sitting_id=${sittingId}`;
  const tabs = [
    { label: "Settings", value: "settings", href: `${base}&tab=settings` },
    { label: "Papers", value: "papers", href: `${base}&tab=papers` },
    { label: "Results", value: "results", href: `${base}&tab=results` },
  ];

  return (
    <main className="max-w-5xl mx-auto p-4">
      {/* Header */}
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <a href="/sittings" className="text-sm text-gray-400 hover:underline">← Sittings</a>
            <h1 className="text-lg font-bold mt-1">{sitting.title}</h1>
            <div className="flex gap-2 mt-1">
              <StatusBadge status={sitting.status} />
              {sitting.academic_year && (
                <span className="text-xs text-gray-400">{sitting.academic_year}</span>
              )}
            </div>
          </div>
          <div className="flex gap-3 text-sm">
            <a href="/sittings" className="text-teal-700 hover:underline">All Sittings</a>
            <a href="/school" className="text-teal-700 hover:underline">School Admin</a>
          </div>
        </div>
      </Card>

      <TabNav tabs={tabs} activeTab={tab} />

      {tab === "settings" && (
        <Card title="Settings">
          <form action={saveSettingsAction}>
            <input type="hidden" name="sitting_id" value={sitting.id} />
            <label className="block text-sm mb-1">Title *</label>
            <input name="title" defaultValue={sitting.title} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />
            <label className="block text-sm mb-1">Description <span className="text-gray-400">(optional)</span></label>
            <textarea name="description" rows={3} defaultValue={sitting.description || ""} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />
            <label className="block text-sm mb-1">Academic year <span className="text-gray-400">(optional)</span></label>
            <input name="academic_year" defaultValue={sitting.academic_year || ""} placeholder="e.g. 2025/26" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />
            <label className="block text-sm mb-1">Status</label>
            <select name="status" defaultValue={sitting.status} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3">
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="CLOSED">Closed</option>
            </select>
            <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
              Save Settings
            </button>
          </form>
        </Card>
      )}

      {tab === "papers" && <PapersTab sittingId={sitting.id} tenantId={active.tenant_id} />}
      {tab === "results" && <ResultsTab sittingId={sitting.id} tenantId={active.tenant_id} />}
    </main>
  );
}

// ============================================================
// Papers Tab
// ============================================================

async function PapersTab({ sittingId, tenantId }: { sittingId: string; tenantId: string }) {
  const { all, first } = getDb();

  const papers = await all<{
    paper_id: string; exam_id: string; sort_order: number;
    exam_title: string; exam_status: string;
    course_title: string; teacher_name: string | null;
  }>(
    `SELECT esp.id AS paper_id, esp.exam_id, esp.sort_order,
       e.title AS exam_title, e.status AS exam_status,
       c.title AS course_title,
       u.name AS teacher_name
     FROM exam_sitting_papers esp
     JOIN exams e ON e.id = esp.exam_id
     JOIN courses c ON c.id = e.course_id
     LEFT JOIN users u ON u.id = e.created_by
     WHERE esp.sitting_id=?
     ORDER BY esp.sort_order ASC`,
    [sittingId]
  );

  // Load gate counts per paper.
  const gateCountMap: Record<string, Record<string, number>> = {};
  if (papers.length > 0) {
    const examIds = papers.map((p) => p.exam_id);
    const ph = examIds.map(() => "?").join(",");
    const gateCounts = await all<{ exam_id: string; gate_type: string; cnt: number }>(
      `SELECT exam_id, gate_type, COUNT(*) AS cnt
       FROM sitting_approval_gates
       WHERE tenant_id=? AND exam_id IN (${ph})
       GROUP BY exam_id, gate_type`,
      [tenantId, ...examIds]
    );
    for (const row of gateCounts) {
      if (!gateCountMap[row.exam_id]) gateCountMap[row.exam_id] = {};
      gateCountMap[row.exam_id][row.gate_type] = Number(row.cnt);
    }
  }

  // Available exams not in this sitting.
  const existingIds = papers.map((p) => p.exam_id);
  let availableExams: { id: string; title: string; course_title: string; status: string }[] = [];
  if (existingIds.length > 0) {
    const notIn = existingIds.map(() => "?").join(",");
    availableExams = await all(
      `SELECT e.id, e.title, e.status, c.title AS course_title
       FROM exams e JOIN courses c ON c.id = e.course_id
       WHERE e.tenant_id=? AND e.id NOT IN (${notIn})
       ORDER BY c.title ASC, e.title ASC`,
      [tenantId, ...existingIds]
    );
  } else {
    availableExams = await all(
      `SELECT e.id, e.title, e.status, c.title AS course_title
       FROM exams e JOIN courses c ON c.id = e.course_id
       WHERE e.tenant_id=? ORDER BY c.title ASC, e.title ASC`,
      [tenantId]
    );
  }

  // Courses + teachers for create new paper form.
  const courses = await all<{ id: string; title: string }>(
    "SELECT id, title FROM courses WHERE tenant_id=? AND status='ACTIVE' ORDER BY title ASC", [tenantId]
  );
  // #ST-2 — Fixed: query unique teachers (not per-course duplicates).
  const teachers = await all<{ id: string; name: string }>(
    `SELECT DISTINCT u.id, u.name
     FROM memberships m
     JOIN users u ON u.id = m.user_id
     WHERE m.tenant_id=? AND m.role='TEACHER' AND m.status='ACTIVE'
     ORDER BY u.name ASC`,
    [tenantId]
  );

  function GateBadge({ label, count }: { label: string; count: number }) {
    return count > 0
      ? <span className="inline-block bg-green-50 text-green-700 px-2 py-0.5 rounded-full text-[11px] font-bold">{label}:{count}</span>
      : <span className="text-xs text-gray-300">{label}:0</span>;
  }

  return (
    <>
      <Card title="Papers in this Sitting">
        {papers.length === 0 ? (
          <p className="text-sm text-gray-400">No papers added yet. Add a paper below.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2 w-7">#</th>
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Paper</th>
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Course</th>
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Teacher</th>
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Status</th>
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Gates</th>
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {papers.map((p, i) => {
                  const cnts = gateCountMap[p.exam_id] || {};
                  return (
                    <tr key={p.paper_id} className="border-b border-gray-100">
                      <td className="py-3 px-2 font-bold text-gray-300 text-xs">{i + 1}</td>
                      <td className="py-3 px-2 font-medium">{p.exam_title}</td>
                      <td className="py-3 px-2 text-gray-500 text-xs">{p.course_title}</td>
                      <td className="py-3 px-2 text-gray-500 text-xs">{p.teacher_name || "—"}</td>
                      <td className="py-3 px-2">
                        <StatusBadge status={p.exam_status} />
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex gap-1">
                          <GateBadge label="Q" count={cnts["QUESTIONS"] || 0} />
                          <GateBadge label="G" count={cnts["GRADING"] || 0} />
                          <GateBadge label="R" count={cnts["RESULTS"] || 0} />
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex gap-1 flex-wrap">
                          <a href={`/sitting-gate-settings?sitting_id=${sittingId}&exam_id=${p.exam_id}`}
                            className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-200 no-underline">
                            Set Approvals
                          </a>
                          <a href={`/exam-builder?exam_id=${p.exam_id}`}
                            className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-200 no-underline">
                            Edit
                          </a>
                          <form action={removePaperAction}>
                            <input type="hidden" name="sitting_id" value={sittingId} />
                            <input type="hidden" name="paper_id" value={p.paper_id} />
                            <button type="submit" className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-200">
                              Remove
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Link existing exam */}
        <Card title="Link Existing Exam">
          {availableExams.length > 0 ? (
            <form action={addExistingPaperAction}>
              <input type="hidden" name="sitting_id" value={sittingId} />
              <label className="block text-sm mb-1">Exam</label>
              <select name="exam_id" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3">
                <option value="">— select exam —</option>
                {availableExams.map((e) => (
                  <option key={e.id} value={e.id}>{e.title} — {e.course_title} [{e.status}]</option>
                ))}
              </select>
              <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
                Add Paper
              </button>
            </form>
          ) : (
            <p className="text-sm text-gray-400">All school exams are already in this sitting, or no exams exist yet.</p>
          )}
        </Card>

        {/* Create new paper */}
        <Card title="Create New Paper">
          {courses.length > 0 ? (
            <form action={createPaperAction}>
              <input type="hidden" name="sitting_id" value={sittingId} />
              <label className="block text-sm mb-1">Paper title *</label>
              <input name="title" required placeholder="e.g. Mathematics Paper 1" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />
              <label className="block text-sm mb-1">Course *</label>
              <select name="course_id" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3">
                <option value="">— select course —</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
              <label className="block text-sm mb-1">Assigned teacher *</label>
              <select name="teacher_id" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3">
                <option value="">— select teacher —</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
                Create &amp; Add Paper
              </button>
            </form>
          ) : (
            <p className="text-sm text-gray-400">Create at least one active course before adding a new paper.</p>
          )}
        </Card>
      </div>
    </>
  );
}

function StatusBadgeInline({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ACTIVE: "bg-green-50 text-green-700", PUBLISHED: "bg-green-50 text-green-700",
    CLOSED: "bg-red-50 text-red-700", DRAFT: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${styles[status] || styles.DRAFT}`}>
      {status}
    </span>
  );
}

// ============================================================
// Results Tab
// ============================================================

async function ResultsTab({ sittingId, tenantId }: { sittingId: string; tenantId: string }) {
  const { all } = getDb();

  const paperList = await all<{
    exam_id: string; exam_title: string; score_display: string | null; results_published_at: string | null;
  }>(
    `SELECT esp.exam_id, e.title AS exam_title, e.score_display, e.results_published_at
     FROM exam_sitting_papers esp
     JOIN exams e ON e.id = esp.exam_id
     WHERE esp.sitting_id=?
     ORDER BY esp.sort_order ASC`,
    [sittingId]
  );

  if (paperList.length === 0) {
    return (
      <Card title="Results Overview">
        <p className="text-sm text-gray-400">No papers in this sitting yet. Add papers in the Papers tab.</p>
      </Card>
    );
  }

  const pIds = paperList.map((p) => p.exam_id);
  const ph = pIds.map(() => "?").join(",");

  const studentList = await all<{ id: string; name: string }>(
    `SELECT DISTINCT u.id, u.name
     FROM exam_attempts ea JOIN users u ON u.id = ea.user_id
     WHERE ea.exam_id IN (${ph}) AND ea.tenant_id=? AND ea.status='SUBMITTED'
     ORDER BY u.name ASC`,
    [...pIds, tenantId]
  );

  if (studentList.length === 0) {
    return (
      <Card title="Results Overview">
        <p className="text-sm text-gray-400">No submitted attempts found for any paper in this sitting.</p>
      </Card>
    );
  }

  const attempts = await all<{
    id: string; exam_id: string; user_id: string;
    score_display: string | null; score_pct: number | null;
    score_raw: number | null; score_total: number | null;
    grade: string | null; pass_mark_percent: number | null;
  }>(
    `SELECT ea.id, ea.exam_id, ea.user_id, ea.score_display,
       ea.score_pct, ea.score_raw, ea.score_total,
       ea.grade, ea.pass_mark_percent
     FROM exam_attempts ea
     WHERE ea.exam_id IN (${ph}) AND ea.tenant_id=? AND ea.status='SUBMITTED'
     ORDER BY ea.attempt_no DESC`,
    [...pIds, tenantId]
  );

  // Build grid: most recent attempt per student per exam.
  const grid: Record<string, Record<string, typeof attempts[0]>> = {};
  for (const a of attempts) {
    if (!grid[a.user_id]) grid[a.user_id] = {};
    if (!grid[a.user_id][a.exam_id]) grid[a.user_id][a.exam_id] = a;
  }

  function CellContent({ att, paper }: { att: typeof attempts[0] | undefined; paper: typeof paperList[0] }) {
    if (!att) return <span className="text-gray-300">—</span>;
    const released = paper.results_published_at && Date.parse(paper.results_published_at) <= Date.now();
    if (!released) return <span className="text-gray-400 text-xs">Pending</span>;

    const sd = att.score_display || paper.score_display || "BOTH";
    const pct = att.score_pct != null ? Number(att.score_pct) : null;
    const raw = att.score_raw != null ? Number(att.score_raw) : null;
    const tot = att.score_total != null ? Number(att.score_total) : null;

    const parts: string[] = [];
    if (sd === "BOTH" && pct !== null && raw !== null) parts.push(`${Math.round(pct)}% (${raw}/${tot})`);
    else if (sd === "PERCENT" && pct !== null) parts.push(`${Math.round(pct)}%`);
    else if (sd === "MARKS" && raw !== null) parts.push(`${raw}/${tot}`);
    if (att.grade) parts.push(String(att.grade));

    const passed = att.pass_mark_percent != null && pct !== null ? pct >= Number(att.pass_mark_percent) : null;

    return (
      <div className="text-xs">
        <span>{parts.length > 0 ? parts.join(" · ") : "Recorded"}</span>
        {passed !== null && (
          <span className={`ml-1 font-bold ${passed ? "text-green-700" : "text-red-600"}`}>
            {passed ? "PASS" : "FAIL"}
          </span>
        )}
        <br />
        <a href={`/attempt-results?attempt_id=${att.id}`} className="text-teal-700 hover:underline text-[11px]">View</a>
      </div>
    );
  }

  return (
    <Card title="Results Overview">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Student</th>
              {paperList.map((p) => (
                <th key={p.exam_id} className="text-center text-xs text-gray-500 uppercase py-2 px-2 max-w-[150px]">
                  {p.exam_title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {studentList.map((s) => (
              <tr key={s.id} className="border-b border-gray-100">
                <td className="py-2 px-2 font-medium">{s.name}</td>
                {paperList.map((p) => (
                  <td key={p.exam_id} className="py-2 px-2 text-center">
                    <CellContent att={grid[s.id]?.[p.exam_id]} paper={p} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
