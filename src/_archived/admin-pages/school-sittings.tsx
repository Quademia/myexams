// DEPRECATED (2026-03-31): This page is superseded by the admin workspace at /school.
// Sittings list now lives in /school?section=sittings (inline in school/page.tsx).
// This file will be removed in a future cleanup pass.
// src/app/school-sittings/page.tsx
// Sittings list on the school admin nav — shows all sittings with paper counts.
// Links to the sitting builder for each one. Also has a "New Sitting" button.

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership, fmtISO } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { SchoolLayout } from "@/components/layout/SchoolLayout";
import { Card } from "@/components/ui/Card";

async function createSittingAction() {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const { run } = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await run(
    `INSERT INTO exam_sittings (id, tenant_id, title, description, academic_year, status, created_by, created_at, updated_at)
     VALUES (?,?,?,?,?,'DRAFT',?,?,?)`,
    [id, active.tenant_id, "New Sitting", null, null, auth.user!.id, now, now]
  );
  redirect(`/sitting-builder?sitting_id=${id}&toast=Sitting+created`);
}

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

export default async function SchoolSittingsPage() {
  const auth = await requireAuth();
  if (auth.user!.is_system_admin === 1) redirect("/sys");
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const { all } = getDb();

  const sittings = await all<{
    id: string; title: string; academic_year: string | null;
    status: string; paper_count: number; created_at: string;
  }>(
    `SELECT es.id, es.title, es.academic_year, es.status, es.created_at,
       (SELECT COUNT(*) FROM exam_sitting_papers esp WHERE esp.sitting_id = es.id) AS paper_count
     FROM exam_sittings es
     WHERE es.tenant_id=? ORDER BY es.created_at DESC`,
    [active.tenant_id]
  );

  return (
    <SchoolLayout auth={auth} active={active} currentPath="/school-sittings">
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Exam Sittings</h2>
          <form action={createSittingAction}>
            <button type="submit" className="px-3 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
              + New Sitting
            </button>
          </form>
        </div>

        {sittings.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">
            No sittings yet — create one to group exam papers into a formal sitting event.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left text-xs text-gray-500 uppercase tracking-wide py-2 px-2">Title</th>
                  <th className="text-left text-xs text-gray-500 uppercase tracking-wide py-2 px-2">Academic Year</th>
                  <th className="text-left text-xs text-gray-500 uppercase tracking-wide py-2 px-2">Status</th>
                  <th className="text-left text-xs text-gray-500 uppercase tracking-wide py-2 px-2">Papers</th>
                  <th className="text-left text-xs text-gray-500 uppercase tracking-wide py-2 px-2">Created</th>
                  <th className="text-left text-xs text-gray-500 uppercase tracking-wide py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {sittings.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-2 font-medium">{s.title}</td>
                    <td className="py-3 px-2 text-gray-500 text-sm">{s.academic_year || "—"}</td>
                    <td className="py-3 px-2"><StatusBadge status={s.status} /></td>
                    <td className="py-3 px-2 text-gray-600">{s.paper_count}</td>
                    <td className="py-3 px-2 text-gray-500 text-sm">{fmtISO(s.created_at)}</td>
                    <td className="py-3 px-2">
                      <a href={`/sitting-builder?sitting_id=${s.id}`} className="px-3 py-1 bg-teal-700 text-white text-xs font-semibold rounded-lg hover:bg-teal-800 no-underline">
                        Open
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </SchoolLayout>
  );
}
