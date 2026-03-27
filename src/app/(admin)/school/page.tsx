// src/app/school/page.tsx
// School Admin Overview — shows stats (students, teachers, courses, etc.)
// and notification banners (pending approvals, join requests).

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { SchoolLayout } from "@/components/layout/SchoolLayout";

// A small stat card component — used only on this page.
function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 text-center flex-1 min-w-[120px]">
      <div className="text-3xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}

export default async function SchoolOverviewPage() {
  const auth = await requireAuth();
  // #11 — System admins should go to /sys, not school pages (matches old code).
  if (auth.user!.is_system_admin === 1) redirect("/sys");
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const { first } = getDb();
  const tid = active.tenant_id;

  // Fetch all stats in parallel — each query runs at the same time, much faster.
  // #10 — Also fetch pending approvals count (matches old code's yellow banner).
  const [students, teachers, courses, classes, sittings, pendingJR, pendingApprovals] = await Promise.all([
    first<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM memberships WHERE tenant_id=? AND status='ACTIVE' AND role='STUDENT'", [tid]),
    first<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM memberships WHERE tenant_id=? AND status='ACTIVE' AND role='TEACHER'", [tid]),
    first<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM courses WHERE tenant_id=?", [tid]),
    first<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM classes WHERE tenant_id=?", [tid]),
    first<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM exam_sittings WHERE tenant_id=?", [tid]),
    first<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM join_requests WHERE tenant_id=? AND status='PENDING'", [tid]),
    first<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM sitting_approval_gates sag
       JOIN sitting_approval_responses sar
         ON sar.exam_id=sag.exam_id AND sar.gate_type=sag.gate_type
        AND sar.approver_id=sag.user_id AND sar.tenant_id=sag.tenant_id
       WHERE sag.user_id=? AND sag.tenant_id=? AND sar.status='PENDING'`,
      [auth.user!.id, tid]
    ),
  ]);

  const pendingCount = Number(pendingJR?.cnt ?? 0);
  const approvalCount = Number(pendingApprovals?.cnt ?? 0);

  return (
    <SchoolLayout auth={auth} active={active} currentPath="/school">
      {/* Stats grid */}
      <div className="flex flex-wrap gap-3">
        <StatCard label="Students" value={Number(students?.cnt ?? 0)} />
        <StatCard label="Teachers" value={Number(teachers?.cnt ?? 0)} />
        <StatCard label="Courses" value={Number(courses?.cnt ?? 0)} />
        <StatCard label="Classes" value={Number(classes?.cnt ?? 0)} />
        <StatCard label="Sittings" value={Number(sittings?.cnt ?? 0)} />
      </div>

      {/* #10 — Pending approvals banner (matches old code's yellow banner) */}
      {approvalCount > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 mt-3 flex items-center justify-between flex-wrap gap-3">
          <span className="text-sm font-semibold text-amber-800">
            You have {approvalCount} pending approval{approvalCount !== 1 ? "s" : ""}
          </span>
          <a
            href="/approvals"
            className="inline-block px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800 no-underline"
          >
            View Inbox →
          </a>
        </div>
      )}

      {/* Pending join requests banner */}
      {pendingCount > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-3 mt-3 flex items-center justify-between flex-wrap gap-3">
          <span className="text-sm">
            {pendingCount} pending join request{pendingCount !== 1 ? "s" : ""}
          </span>
          <a
            href="/school-join-codes"
            className="inline-block px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800 no-underline"
          >
            View Requests →
          </a>
        </div>
      )}
    </SchoolLayout>
  );
}
