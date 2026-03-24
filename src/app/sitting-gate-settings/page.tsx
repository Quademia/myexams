// src/app/sitting-gate-settings/page.tsx
// Gate settings page — assign approvers to QUESTIONS, GRADING, RESULTS gates
// for a specific paper in a sitting.

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership, roleLabel } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card } from "@/components/Card";

// ============================================================
// Server Actions
// ============================================================

async function addApproverAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const sittingId = formData.get("sitting_id") as string;
  const examId = formData.get("exam_id") as string;
  const gateType = formData.get("gate_type") as string;
  const userId = formData.get("user_id") as string;

  if (!sittingId || !examId || !["QUESTIONS", "GRADING", "RESULTS"].includes(gateType) || !userId) {
    redirect("/sittings");
  }

  const { first, run } = getDb();
  const now = new Date().toISOString();

  // Verify sitting belongs to tenant.
  const sitting = await first("SELECT id FROM exam_sittings WHERE id=? AND tenant_id=?", [sittingId, active.tenant_id]);
  if (!sitting) redirect("/sittings");

  // Verify user is active member.
  const member = await first("SELECT id FROM memberships WHERE user_id=? AND tenant_id=? AND status='ACTIVE'", [userId, active.tenant_id]);
  if (!member) redirect(`/sitting-gate-settings?sitting_id=${sittingId}&exam_id=${examId}`);

  // Don't add duplicates.
  const already = await first(
    "SELECT id FROM sitting_approval_gates WHERE exam_id=? AND gate_type=? AND user_id=? AND tenant_id=?",
    [examId, gateType, userId, active.tenant_id]
  );
  if (!already) {
    await run(
      `INSERT INTO sitting_approval_gates (id, sitting_id, exam_id, gate_type, user_id, tenant_id, created_at)
       VALUES (?,?,?,?,?,?,?)`,
      [crypto.randomUUID(), sittingId, examId, gateType, userId, active.tenant_id, now]
    );
  }

  redirect(`/sitting-gate-settings?sitting_id=${sittingId}&exam_id=${examId}`);
}

async function disableGateAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const sittingId = formData.get("sitting_id") as string;
  const examId = formData.get("exam_id") as string;
  const gateType = formData.get("gate_type") as string;

  if (!sittingId || !examId || !["QUESTIONS", "GRADING", "RESULTS"].includes(gateType)) {
    redirect("/sittings");
  }

  const { run } = getDb();

  // Delete all approvers for this gate.
  await run(
    "DELETE FROM sitting_approval_gates WHERE exam_id=? AND gate_type=? AND tenant_id=?",
    [examId, gateType, active.tenant_id]
  );
  // Delete all pending responses for this gate.
  await run(
    "DELETE FROM sitting_approval_responses WHERE exam_id=? AND gate_type=? AND status='PENDING' AND tenant_id=?",
    [examId, gateType, active.tenant_id]
  );

  redirect(`/sitting-gate-settings?sitting_id=${sittingId}&exam_id=${examId}`);
}

async function removeApproverAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const sittingId = formData.get("sitting_id") as string;
  const examId = formData.get("exam_id") as string;
  const gateType = formData.get("gate_type") as string;
  const userId = formData.get("user_id") as string;

  const { run } = getDb();

  // Remove from gates.
  await run(
    "DELETE FROM sitting_approval_gates WHERE exam_id=? AND gate_type=? AND user_id=? AND tenant_id=?",
    [examId, gateType, userId, active.tenant_id]
  );
  // Delete pending response if exists.
  await run(
    "DELETE FROM sitting_approval_responses WHERE exam_id=? AND gate_type=? AND approver_id=? AND status='PENDING' AND tenant_id=?",
    [examId, gateType, userId, active.tenant_id]
  );

  redirect(`/sitting-gate-settings?sitting_id=${sittingId}&exam_id=${examId}`);
}

// ============================================================
// Page Component
// ============================================================

const GATE_DEFS = [
  { type: "QUESTIONS", label: "Questions Gate", desc: "Must be approved before the exam can be published" },
  { type: "GRADING", label: "Grading Gate", desc: "Must be approved before results can be released" },
  { type: "RESULTS", label: "Results Gate", desc: "Final sign-off before results go live to students" },
];

export default async function SittingGateSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ sitting_id?: string; exam_id?: string }>;
}) {
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const params = await searchParams;
  const sittingId = params.sitting_id;
  const examId = params.exam_id;
  if (!sittingId || !examId) redirect("/sittings");

  const { first, all } = getDb();

  const sitting = await first<{ id: string; title: string }>(
    "SELECT id, title FROM exam_sittings WHERE id=? AND tenant_id=?", [sittingId, active.tenant_id]
  );
  if (!sitting) redirect("/sittings");

  const paper = await first<{
    exam_id: string; exam_title: string; course_title: string; teacher_name: string | null;
  }>(
    `SELECT e.id AS exam_id, e.title AS exam_title, c.title AS course_title, u.name AS teacher_name
     FROM exam_sitting_papers esp
     JOIN exams e ON e.id = esp.exam_id
     JOIN courses c ON c.id = e.course_id
     LEFT JOIN users u ON u.id = e.created_by
     WHERE esp.sitting_id=? AND esp.exam_id=?`,
    [sittingId, examId]
  );
  if (!paper) redirect(`/sitting-builder?sitting_id=${sittingId}&tab=papers`);

  // Load assigned gates.
  const assignedGates = await all<{ gate_type: string; user_id: string; approver_name: string }>(
    `SELECT sag.gate_type, sag.user_id, u.name AS approver_name
     FROM sitting_approval_gates sag JOIN users u ON u.id = sag.user_id
     WHERE sag.exam_id=? AND sag.tenant_id=?
     ORDER BY sag.gate_type, u.name ASC`,
    [examId, active.tenant_id]
  );

  const assignedByGate: Record<string, typeof assignedGates> = { QUESTIONS: [], GRADING: [], RESULTS: [] };
  for (const g of assignedGates) {
    if (assignedByGate[g.gate_type]) assignedByGate[g.gate_type].push(g);
  }

  // All school members for the "add approver" dropdowns.
  const allMembers = await all<{ id: string; name: string; role: string }>(
    `SELECT u.id, u.name, m.role FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.tenant_id=? AND m.status='ACTIVE' AND u.status='ACTIVE'
     ORDER BY u.name ASC`,
    [active.tenant_id]
  );

  return (
    <main className="max-w-4xl mx-auto p-4">
      {/* Header */}
      <Card>
        <a href={`/sitting-builder?sitting_id=${sittingId}&tab=papers`} className="text-sm text-gray-400 hover:underline">
          ← {sitting.title}
        </a>
        <h1 className="text-lg font-bold mt-1">{paper.exam_title}</h1>
        <div className="text-sm text-gray-500 mt-1">
          {paper.course_title}{paper.teacher_name ? ` · ${paper.teacher_name}` : ""}
        </div>
      </Card>

      {/* Gate cards */}
      {GATE_DEFS.map((def) => {
        const assignees = assignedByGate[def.type] || [];
        const isActive = assignees.length > 0;
        const assignedIds = new Set(assignees.map((a) => a.user_id));
        const availableMembers = allMembers.filter((m) => !assignedIds.has(m.id));

        return (
          <Card key={def.type}>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
              <span className="font-bold text-base">{def.label}</span>
              <div className="flex gap-2 items-center">
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                  isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-400"
                }`}>
                  {isActive ? "Active" : "Inactive"}
                </span>
                {isActive && (
                  <form action={disableGateAction}>
                    <input type="hidden" name="sitting_id" value={sittingId} />
                    <input type="hidden" name="exam_id" value={examId} />
                    <input type="hidden" name="gate_type" value={def.type} />
                    <button type="submit" className="px-2 py-0.5 bg-red-50 text-red-700 text-[11px] font-semibold rounded-lg hover:bg-red-100">
                      Disable Gate
                    </button>
                  </form>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-3">{def.desc}</p>

            {/* Assigned approvers */}
            {isActive ? (
              <div className="mb-3">
                {assignees.map((a) => {
                  const member = allMembers.find((m) => m.id === a.user_id);
                  return (
                    <div key={a.user_id} className="flex items-center justify-between py-2 border-b border-gray-100">
                      <div>
                        <span className="text-sm font-semibold">{a.approver_name}</span>
                        {member && (
                          <span className="text-xs text-gray-400 ml-2">{roleLabel(member.role)}</span>
                        )}
                      </div>
                      <form action={removeApproverAction}>
                        <input type="hidden" name="sitting_id" value={sittingId} />
                        <input type="hidden" name="exam_id" value={examId} />
                        <input type="hidden" name="gate_type" value={def.type} />
                        <input type="hidden" name="user_id" value={a.user_id} />
                        <button type="submit" className="px-2 py-0.5 bg-gray-100 text-gray-700 text-[11px] font-semibold rounded-lg hover:bg-gray-200">
                          Remove
                        </button>
                      </form>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic mb-3">No approvers assigned — gate inactive</p>
            )}

            {/* Add approver form */}
            <div className="border-t border-gray-100 pt-3">
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">Add approver</div>
              <form action={addApproverAction} className="flex gap-2 items-end flex-wrap">
                <input type="hidden" name="sitting_id" value={sittingId} />
                <input type="hidden" name="exam_id" value={examId} />
                <input type="hidden" name="gate_type" value={def.type} />
                <select name="user_id" required className="flex-1 min-w-[180px] px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="">— select member —</option>
                  {availableMembers.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} ({roleLabel(m.role)})</option>
                  ))}
                </select>
                <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
                  + Add
                </button>
              </form>
            </div>
          </Card>
        );
      })}
    </main>
  );
}
