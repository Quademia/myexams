// src/app/sittings/page.tsx
// Standalone sittings management page — same data as /school-sittings but
// with its own header (not inside SchoolLayout nav).

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership, fmtISO } from "@/lib/auth";
import { getDb } from "@/lib/db";
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
  redirect(`/sitting-builder?sitting_id=${id}`);
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

export default async function SittingsPage() {
  const auth = await requireAuth();
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
    <main className="max-w-5xl mx-auto p-4">
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-bold">Exam Sittings</h1>
            <span className="inline-block px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-xs font-semibold mt-1">
              {active.tenant_name}
            </span>
          </div>
          <a href="/school" className="text-sm text-teal-700 hover:underline">← School Admin</a>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">All Sittings</h2>
          <form action={createSittingAction}>
            <button type="submit" className="px-3 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
              + New Sitting
            </button>
          </form>
        </div>

        {sittings.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">
            No sittings yet — click &quot;New Sitting&quot; to get started
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left text-xs text-gray-500 uppercase tracking-wide py-2 px-2">Title</th>
                  <th className="text-left text-xs text-gray-500 uppercase tracking-wide py-2 px-2">Status</th>
                  <th className="text-left text-xs text-gray-500 uppercase tracking-wide py-2 px-2">Papers</th>
                  <th className="text-left text-xs text-gray-500 uppercase tracking-wide py-2 px-2">Created</th>
                  <th className="text-left text-xs text-gray-500 uppercase tracking-wide py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {sittings.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-2">
                      <span className="font-medium">{s.title}</span>
                      {s.academic_year && (
                        <span className="text-xs text-gray-400 ml-2">{s.academic_year}</span>
                      )}
                    </td>
                    <td className="py-3 px-2"><StatusBadge status={s.status} /></td>
                    <td className="py-3 px-2 text-gray-600">
                      {s.paper_count} paper{s.paper_count !== 1 ? "s" : ""}
                    </td>
                    <td className="py-3 px-2 text-gray-400 text-xs">{fmtISO(s.created_at)}</td>
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
    </main>
  );
}
