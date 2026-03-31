// src/app/exam-builder/page.tsx
// Thin wrapper — auth guards and layout only.
// All exam builder logic lives in ExamBuilderContent.

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ExamBuilderContent } from "@/components/exam/ExamBuilderContent";

export default async function ExamBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ exam_id?: string; tab?: string; edit_q?: string; type?: string; search?: string; vis?: string }>;
}) {
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  const isSystemAdmin = auth.user!.is_system_admin === 1;
  if (!active && !isSystemAdmin) redirect("/");
  if (active && active.role !== "TEACHER" && active.role !== "SCHOOL_ADMIN") redirect("/");

  const params = await searchParams;
  const examId = params.exam_id;
  const tab = params.tab || "settings";
  const editQId = params.edit_q || null;
  const bankFilterType = params.type || "";
  const bankSearch = params.search || "";
  const bankVis = params.vis || "";
  if (!examId) redirect("/teacher");

  // Verify exam exists and user has access.
  const { first } = getDb();
  const tenantId = active?.tenant_id;
  const exam = await first<{ id: string; course_id: string }>(
    tenantId
      ? "SELECT id, course_id FROM exams WHERE id=? AND tenant_id=?"
      : "SELECT id, course_id FROM exams WHERE id=?",
    tenantId ? [examId, tenantId] : [examId]
  );
  if (!exam) redirect("/teacher");

  // Verify teacher owns the course.
  if (active?.role === "TEACHER") {
    const owns = await first("SELECT 1 FROM course_teachers WHERE course_id=? AND user_id=?", [exam.course_id, auth.user!.id]);
    if (!owns) redirect("/teacher");
  }

  return (
    <main className="max-w-5xl mx-auto p-4">
      <ExamBuilderContent
        examId={examId}
        tab={tab}
        editQId={editQId}
        auth={auth}
        active={active}
        returnPath="/exam-builder"
        bankFilterType={bankFilterType}
        bankSearch={bankSearch}
        bankVis={bankVis}
      />
    </main>
  );
}
