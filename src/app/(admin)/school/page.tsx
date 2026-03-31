// src/app/school/page.tsx
// School Admin Workspace — Phase 4 of the workspace restructure.
// Single entry point for all school admin functionality.
// Uses WorkspaceShell with sidebar. URL state drives which section is shown.

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { WorkspaceHeader } from "@/components/layout/WorkspaceHeader";
import { SidebarNav } from "@/components/layout/SidebarNav";
import { getAdminNavItems } from "@/lib/admin-nav";
import { changePasswordAction } from "@/lib/change-password";

// ============================================================
// Small UI helpers
// ============================================================

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 text-center flex-1 min-w-[120px]">
      <div className="text-3xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}

// ============================================================
// Section: Overview
// ============================================================

async function OverviewSection({ tenantId, userId }: { tenantId: string; userId: string }) {
  const { first } = getDb();

  const [students, teachers, courses, classes, sittings, pendingJR, pendingApprovals] = await Promise.all([
    first<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM memberships WHERE tenant_id=? AND status='ACTIVE' AND role='STUDENT'", [tenantId]),
    first<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM memberships WHERE tenant_id=? AND status='ACTIVE' AND role='TEACHER'", [tenantId]),
    first<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM courses WHERE tenant_id=?", [tenantId]),
    first<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM classes WHERE tenant_id=?", [tenantId]),
    first<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM exam_sittings WHERE tenant_id=?", [tenantId]),
    first<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM join_requests WHERE tenant_id=? AND status='PENDING'", [tenantId]),
    first<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM sitting_approval_gates sag
       JOIN sitting_approval_responses sar
         ON sar.exam_id=sag.exam_id AND sar.gate_type=sag.gate_type
        AND sar.approver_id=sag.user_id AND sar.tenant_id=sag.tenant_id
       WHERE sag.user_id=? AND sag.tenant_id=? AND sar.status='PENDING'`,
      [userId, tenantId]
    ),
  ]);

  const pendingCount = Number(pendingJR?.cnt ?? 0);
  const approvalCount = Number(pendingApprovals?.cnt ?? 0);

  return (
    <>
      {/* Stats grid */}
      <div className="flex flex-wrap gap-3">
        <StatCard label="Students" value={Number(students?.cnt ?? 0)} />
        <StatCard label="Teachers" value={Number(teachers?.cnt ?? 0)} />
        <StatCard label="Courses" value={Number(courses?.cnt ?? 0)} />
        <StatCard label="Classes" value={Number(classes?.cnt ?? 0)} />
        <StatCard label="Sittings" value={Number(sittings?.cnt ?? 0)} />
      </div>

      {/* Pending approvals banner */}
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
            href="/school?section=join-codes"
            className="inline-block px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800 no-underline"
          >
            View Requests →
          </a>
        </div>
      )}
    </>
  );
}

// ============================================================
// Placeholder for sections not yet migrated
// ============================================================

function SectionPlaceholder({ title, oldRoute }: { title: string; oldRoute: string }) {
  return (
    <Card>
      <div className="text-center py-8">
        <h2 className="text-lg font-bold text-gray-400">{title}</h2>
        <p className="text-sm text-gray-400 mt-2">This section is being migrated to the workspace.</p>
        <a href={oldRoute} className="inline-block mt-3 text-sm text-teal-700 hover:underline">
          Open in current view →
        </a>
      </div>
    </Card>
  );
}

// ============================================================
// Section titles and headers
// ============================================================

const SECTION_META: Record<string, { title: string; subtitle: string }> = {
  "": { title: "Overview", subtitle: "School dashboard" },
  courses: { title: "Courses", subtitle: "Manage courses and enrolments" },
  classes: { title: "Classes", subtitle: "Manage student groups" },
  people: { title: "People", subtitle: "Manage school members" },
  "join-codes": { title: "Join Codes", subtitle: "Manage join codes and requests" },
  sittings: { title: "Sittings", subtitle: "Manage exam sittings" },
};

// ============================================================
// Page Component
// ============================================================

export default async function SchoolWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; [key: string]: string | undefined }>;
}) {
  const auth = await requireAuth();
  if (auth.user!.is_system_admin === 1) redirect("/sys");
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const params = await searchParams;
  const section = params.section || "";
  const tid = active.tenant_id;
  const userId = auth.user!.id;

  // Counts for sidebar badges.
  const { first } = getDb();
  const [pendingApprovalRow, pendingJoinRow] = await Promise.all([
    first<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM sitting_approval_gates sag
       JOIN sitting_approval_responses sar
         ON sar.exam_id=sag.exam_id AND sar.gate_type=sag.gate_type
        AND sar.approver_id=sag.user_id AND sar.tenant_id=sag.tenant_id
       WHERE sag.user_id=? AND sag.tenant_id=? AND sar.status='PENDING'`,
      [userId, tid]
    ),
    first<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM join_requests WHERE tenant_id=? AND status='PENDING'", [tid]),
  ]);
  const pendingApprovals = Number(pendingApprovalRow?.cnt ?? 0);
  const pendingJoinRequests = Number(pendingJoinRow?.cnt ?? 0);

  const meta = SECTION_META[section] || SECTION_META[""];
  const currentPath = section ? `/school?section=${section}` : "/school";

  return (
    <WorkspaceShell
      sidebar={
        <SidebarNav
          items={getAdminNavItems(pendingApprovals, pendingJoinRequests)}
          schoolName={active.tenant_name}
          roleName="School Admin"
          currentPath={currentPath}
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
          title={meta.title}
          subtitle={meta.subtitle}
        />
      }
    >
      {/* Overview */}
      {section === "" && <OverviewSection tenantId={tid} userId={userId} />}

      {/* Placeholder sections — will be migrated one by one */}
      {section === "courses" && <SectionPlaceholder title="Courses" oldRoute="/school-courses" />}
      {section === "classes" && <SectionPlaceholder title="Classes" oldRoute="/school-classes" />}
      {section === "people" && <SectionPlaceholder title="People" oldRoute="/school-people" />}
      {section === "join-codes" && <SectionPlaceholder title="Join Codes" oldRoute="/school-join-codes" />}
      {section === "sittings" && <SectionPlaceholder title="Sittings" oldRoute="/school-sittings" />}
    </WorkspaceShell>
  );
}
