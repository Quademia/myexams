// src/app/school-classes/page.tsx
// Classes list page — table of classes with student counts + Create form.

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { SchoolLayout } from "@/components/layout/SchoolLayout";
import { Card } from "@/components/ui/Card";

async function createClassAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const name = (formData.get("name") as string || "").trim();
  if (!name) redirect("/school-classes");

  const yearGroup = (formData.get("year_group") as string || "").trim();
  const academicYear = (formData.get("academic_year") as string || "").trim();
  const description = (formData.get("description") as string || "").trim();

  const { run } = getDb();
  const now = new Date().toISOString();
  await run(
    `INSERT INTO classes (id, tenant_id, name, year_group, academic_year, description, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,'ACTIVE',?,?)`,
    [crypto.randomUUID(), active.tenant_id, name, yearGroup || null, academicYear || null, description || null, now, now]
  );

  redirect("/school-classes?toast=Class+created");
}

export default async function SchoolClassesPage() {
  const auth = await requireAuth();
  if (auth.user!.is_system_admin === 1) redirect("/sys");
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const { all } = getDb();

  const classes = await all<{
    id: string; name: string; year_group: string | null;
    academic_year: string | null; status: string; student_count: number;
  }>(
    `SELECT c.id, c.name, c.year_group, c.academic_year, c.status,
       COUNT(cs.id) AS student_count
     FROM classes c
     LEFT JOIN class_students cs ON cs.class_id = c.id
     WHERE c.tenant_id=? GROUP BY c.id ORDER BY c.name ASC`,
    [active.tenant_id]
  );

  return (
    <SchoolLayout auth={auth} active={active} currentPath="/school-classes">
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Classes</h2>
        </div>

        {classes.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No classes yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left text-xs text-gray-500 uppercase tracking-wide py-2 px-2">Name</th>
                  <th className="text-left text-xs text-gray-500 uppercase tracking-wide py-2 px-2">Academic Year</th>
                  <th className="text-left text-xs text-gray-500 uppercase tracking-wide py-2 px-2">Status</th>
                  <th className="text-left text-xs text-gray-500 uppercase tracking-wide py-2 px-2">Students</th>
                  <th className="text-left text-xs text-gray-500 uppercase tracking-wide py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {classes.map((cl) => (
                  <tr key={cl.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-2">
                      <a href={`/school-class?class_id=${cl.id}`} className="text-teal-700 hover:underline font-medium">
                        {cl.name}
                      </a>
                      {cl.year_group && (
                        <span className="text-xs text-gray-400 ml-2">{cl.year_group}</span>
                      )}
                    </td>
                    <td className="py-3 px-2 text-gray-600 text-sm">{cl.academic_year || "—"}</td>
                    <td className="py-3 px-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                        cl.status === "ACTIVE" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}>
                        {cl.status}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-gray-600">{cl.student_count}</td>
                    <td className="py-3 px-2">
                      <a href={`/school-class?class_id=${cl.id}`} className="text-sm text-teal-700 hover:underline">
                        Manage →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Create Class">
        <form action={createClassAction}>
          <label className="block text-sm mb-1">Class name *</label>
          <input name="name" required placeholder="e.g. Year 10 Alpha" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-sm mb-1">Year group <span className="text-gray-400">(optional)</span></label>
              <input name="year_group" placeholder="e.g. Year 10" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm mb-1">Academic year <span className="text-gray-400">(optional)</span></label>
              <input name="academic_year" placeholder="e.g. 2024/25" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>

          <label className="block text-sm mb-1">Description <span className="text-gray-400">(optional)</span></label>
          <textarea name="description" rows={2} placeholder="e.g. Top-set Maths group" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />

          <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
            Create class
          </button>
        </form>
      </Card>
    </SchoolLayout>
  );
}
