// src/app/approvals/page.tsx
// Approval inbox — shows pending gate approvals and recent responses.
// Used by both teachers and school admins who are assigned as approvers.

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership, roleLabel, fmtISO } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { SidebarNav } from "@/components/layout/SidebarNav";
import { WorkspaceHeader } from "@/components/layout/WorkspaceHeader";
import { getTeacherNavItems } from "@/lib/teacher-nav";
import { changePasswordAction } from "@/lib/change-password";

async function respondAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active) redirect("/choose-school");

  const examId = (formData.get("exam_id") as string || "").trim();
  const gateType = (formData.get("gate_type") as string || "").trim();
  const response = (formData.get("response") as string || "").trim();
  const note = (formData.get("note") as string || "").trim() || null;

  if (!examId || !["QUESTIONS", "GRADING", "RESULTS"].includes(gateType)) redirect("/approvals");
  if (!["APPROVED", "REJECTED"].includes(response)) redirect("/approvals");

  const { first, run } = getDb();
  const userId = auth.user!.id;
  const now = new Date().toISOString();

  // Verify user is assigned.
  const gate = await first(
    "SELECT id FROM sitting_approval_gates WHERE exam_id=? AND gate_type=? AND user_id=? AND tenant_id=?",
    [examId, gateType, userId, active.tenant_id]
  );
  if (!gate) redirect("/approvals");

  // Upsert response.
  const existing = await first<{ id: string }>(
    "SELECT id FROM sitting_approval_responses WHERE exam_id=? AND gate_type=? AND approver_id=? AND tenant_id=?",
    [examId, gateType, userId, active.tenant_id]
  );
  if (existing) {
    await run("UPDATE sitting_approval_responses SET status=?, note=?, updated_at=? WHERE id=?",
      [response, note, now, existing.id]);
  } else {
    await run(
      `INSERT INTO sitting_approval_responses (id, exam_id, gate_type, approver_id, status, note, tenant_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [crypto.randomUUID(), examId, gateType, userId, response, note, active.tenant_id, now, now]
    );
  }

  if (response === "APPROVED") {
    redirect("/approvals?toast=Approved");
  } else {
    redirect("/approvals?toast=Rejected&toast_type=error");
  }
}

const gateLabel = (t: string) => {
  if (t === "QUESTIONS") return "Questions Gate";
  if (t === "GRADING") return "Grading Gate";
  if (t === "RESULTS") return "Results Gate";
  return t;
};

export default async function ApprovalsPage() {
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active) redirect("/choose-school");

  const isTeacher = active.role === "TEACHER";
  const { all } = getDb();
  const userId = auth.user!.id;
  const tid = active.tenant_id;

  const [pendingItems, allAssignments, recentItems] = await Promise.all([
    all<{
      exam_id: string; gate_type: string; sitting_id: string | null;
      exam_title: string; sitting_title: string | null; submitter_name: string | null;
      first_submitted_attempt: string | null;
    }>(
      `SELECT sag.exam_id, sag.gate_type, sag.sitting_id,
         e.title AS exam_title, es.title AS sitting_title, u.name AS submitter_name,
         (SELECT ea.id FROM exam_attempts ea
          WHERE ea.exam_id=sag.exam_id AND ea.tenant_id=sag.tenant_id AND ea.status='SUBMITTED'
          ORDER BY ea.submitted_at ASC LIMIT 1) AS first_submitted_attempt
       FROM sitting_approval_gates sag
       JOIN sitting_approval_responses sar
         ON sar.exam_id=sag.exam_id AND sar.gate_type=sag.gate_type
        AND sar.approver_id=sag.user_id AND sar.tenant_id=sag.tenant_id
       JOIN exams e ON e.id=sag.exam_id
       LEFT JOIN exam_sittings es ON es.id=sag.sitting_id
       LEFT JOIN qa_users u ON u.id=e.created_by
       WHERE sag.user_id=? AND sag.tenant_id=? AND sar.status='PENDING'
       ORDER BY sar.created_at ASC`,
      [userId, tid]
    ),
    all<{
      exam_id: string; exam_title: string; sitting_title: string | null;
      gate_type: string; my_status: string | null;
      my_note: string | null; my_responded_at: string | null;
    }>(
      `SELECT
         e.id AS exam_id, e.title AS exam_title, es.title AS sitting_title,
         sag.gate_type,
         sar.status AS my_status, sar.note AS my_note,
         sar.updated_at AS my_responded_at
       FROM sitting_approval_gates sag
       JOIN exams e ON e.id = sag.exam_id
       LEFT JOIN exam_sitting_papers esp ON esp.exam_id = e.id
       LEFT JOIN exam_sittings es ON es.id = esp.sitting_id
       LEFT JOIN sitting_approval_responses sar
         ON sar.exam_id = sag.exam_id
         AND sar.gate_type = sag.gate_type
         AND sar.approver_id = sag.user_id
         AND sar.tenant_id = sag.tenant_id
       WHERE sag.user_id=? AND sag.tenant_id=?
       ORDER BY e.title ASC, sag.gate_type ASC`,
      [userId, tid]
    ),
    all<{
      exam_id: string; gate_type: string; exam_title: string;
      sitting_title: string | null; my_status: string;
      my_note: string | null; responded_at: string | null;
    }>(
      `SELECT sag.exam_id, sag.gate_type, e.title AS exam_title,
         es.title AS sitting_title, sar.status AS my_status,
         sar.note AS my_note, sar.updated_at AS responded_at
       FROM sitting_approval_gates sag
       JOIN sitting_approval_responses sar
         ON sar.exam_id=sag.exam_id AND sar.gate_type=sag.gate_type
        AND sar.approver_id=sag.user_id AND sar.tenant_id=sag.tenant_id
       JOIN exams e ON e.id=sag.exam_id
       LEFT JOIN exam_sittings es ON es.id=sag.sitting_id
       WHERE sag.user_id=? AND sag.tenant_id=? AND sar.status IN ('APPROVED','REJECTED')
       ORDER BY sar.updated_at DESC LIMIT 10`,
      [userId, tid]
    ),
  ]);

  const content = (
    <>
      <Card title={`Pending (${pendingItems.length})`}>
        {pendingItems.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">All clear — no pending approvals.</p>
        ) : (
          <div className="space-y-3">
            {pendingItems.map((item, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-4">
                <div className="flex gap-4 flex-wrap items-start">
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-bold text-base mb-1">{item.exam_title}</div>
                    {item.sitting_title && (
                      <div className="text-xs text-gray-400 mb-1">{item.sitting_title}</div>
                    )}
                    <div className="flex gap-2 items-center mb-2">
                      <span className="inline-block px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold">
                        {gateLabel(item.gate_type)}
                      </span>
                      {item.submitter_name && (
                        <span className="text-xs text-gray-400">by {item.submitter_name}</span>
                      )}
                    </div>
                    <a
                      href={item.gate_type === "GRADING" && item.first_submitted_attempt
                        ? `/exam-grade?attempt_id=${item.first_submitted_attempt}&view=1`
                        : `/exam-preview?exam_id=${item.exam_id}`}
                      className="text-teal-700 hover:underline text-sm"
                    >
                      View exam →
                    </a>
                  </div>
                  <div className="min-w-[240px] flex-shrink-0">
                    <form action={respondAction}>
                      <input type="hidden" name="exam_id" value={item.exam_id} />
                      <input type="hidden" name="gate_type" value={item.gate_type} />
                      <label className="block text-xs text-gray-500 mb-1">Note (optional)</label>
                      <textarea name="note" rows={2} placeholder="Add a note..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2" />
                      <div className="flex gap-2">
                        <button name="response" value="APPROVED" type="submit"
                          className="flex-1 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
                          Approve
                        </button>
                        <button name="response" value="REJECTED" type="submit"
                          className="flex-1 py-2 bg-red-50 text-red-700 text-sm font-semibold rounded-lg hover:bg-red-100">
                          Reject
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* All my approvals */}
      <Card title="All my approvals">
        {allAssignments.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">You have not been assigned to any approval gates.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {allAssignments.map((item, i) => (
              <div key={i} className="py-3 flex items-start justify-between gap-4 flex-wrap">
                {/* Left — exam info */}
                <div className="flex-1 min-w-[200px]">
                  <div className="font-medium text-sm">{item.exam_title}</div>
                  {item.sitting_title && (
                    <div className="text-xs text-gray-400 mt-0.5">{item.sitting_title}</div>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="inline-block px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold">
                      {gateLabel(item.gate_type)}
                    </span>
                    <a
                      href={item.gate_type === "GRADING"
                        ? `/exam-grade?exam_id=${item.exam_id}&view=1`
                        : `/exam-preview?exam_id=${item.exam_id}`}
                      className="text-xs text-teal-700 hover:underline"
                    >
                      View exam &rarr;
                    </a>
                  </div>
                </div>

                {/* Right — status */}
                <div className="text-right shrink-0">
                  {item.my_status === "APPROVED" && (
                    <>
                      <span className="inline-block px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-xs font-semibold">
                        ✓ Approved
                      </span>
                      {item.my_responded_at && (
                        <div className="text-xs text-gray-400 mt-1">{fmtISO(item.my_responded_at)}</div>
                      )}
                      {item.my_note && (
                        <div className="text-xs text-gray-500 mt-1 max-w-[200px] text-right italic">&ldquo;{item.my_note}&rdquo;</div>
                      )}
                    </>
                  )}
                  {item.my_status === "REJECTED" && (
                    <>
                      <span className="inline-block px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-xs font-semibold">
                        ✗ Rejected
                      </span>
                      {item.my_responded_at && (
                        <div className="text-xs text-gray-400 mt-1">{fmtISO(item.my_responded_at)}</div>
                      )}
                      {item.my_note && (
                        <div className="text-xs text-gray-500 mt-1 max-w-[200px] text-right italic">&ldquo;{item.my_note}&rdquo;</div>
                      )}
                    </>
                  )}
                  {!item.my_status && (
                    <span className="inline-block px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold">
                      ⏳ Awaiting response
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Recent activity */}
      {recentItems.length > 0 && (
        <Card title="Recent activity">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Exam</th>
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Gate</th>
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Response</th>
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Date</th>
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {recentItems.map((item, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2 px-2">
                      <div className="font-medium">{item.exam_title}</div>
                      {item.sitting_title && <div className="text-xs text-gray-400">{item.sitting_title}</div>}
                    </td>
                    <td className="py-2 px-2 text-xs">{gateLabel(item.gate_type)}</td>
                    <td className="py-2 px-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                        item.my_status === "APPROVED" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                      }`}>
                        {item.my_status}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-xs text-gray-400">{fmtISO(item.responded_at)}</td>
                    <td className="py-2 px-2 text-xs text-gray-400">{item.my_note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );

  if (isTeacher) {
    return (
      <WorkspaceShell
        sidebar={
          <SidebarNav
            items={getTeacherNavItems(pendingItems.length)}
            schoolName={active.tenant_name}
            roleName="Teacher"
            currentPath="/approvals"
            switchSchool={auth.memberships.length > 1}
            profile={{
              user: { id: auth.user!.id, name: auth.user!.name, email: auth.user!.email, is_system_admin: auth.user!.is_system_admin },
              memberships: auth.memberships.map(m => ({ tenant_id: m.tenant_id, tenant_name: m.tenant_name, role: m.role, status: "ACTIVE" })),
              changePasswordAction,
            }}
          />
        }
        header={
          <WorkspaceHeader
            title="Approvals"
            subtitle="Your pending gate approvals"
          />
        }
      >
        {content}
      </WorkspaceShell>
    );
  }

  return (
    <main className="max-w-4xl mx-auto p-4">
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-bold">Approval Inbox</h1>
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
            <a href="/" className="text-teal-700 hover:underline">Home</a>
          </div>
        </div>
      </Card>
      {content}
    </main>
  );
}
