// src/app/school-courses/page.tsx
// Courses list page — clean table of courses with a Create button.
// Each row links to the course detail page.
// This is the restructured version from the admin plan — list only, no rosters.

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { SchoolLayout } from "@/components/layout/SchoolLayout";
import { Card } from "@/components/ui/Card";

// Server Action — creates a new course.
async function createCourseAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const title = (formData.get("title") as string || "").trim();
  if (!title) redirect("/school-courses");

  const { run } = getDb();
  const now = new Date().toISOString();
  await run(
    "INSERT INTO courses (id, tenant_id, title, status, created_at, updated_at) VALUES (?,?,?,'ACTIVE',?,?)",
    [crypto.randomUUID(), active.tenant_id, title, now, now]
  );

  redirect("/school-courses");
}

export default async function SchoolCoursesPage() {
  const auth = await requireAuth();
  if (auth.user!.is_system_admin === 1) redirect("/sys");
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const { all } = getDb();

  // Fetch courses with teacher and student counts.
  const courses = await all<{
    id: string;
    title: string;
    status: string;
    teacher_count: number;
    student_count: number;
  }>(
    `SELECT c.id, c.title, c.status,
       (SELECT COUNT(*) FROM course_teachers ct WHERE ct.course_id = c.id) AS teacher_count,
       (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS student_count
     FROM courses c
     WHERE c.tenant_id = ?
     ORDER BY c.title ASC`,
    [active.tenant_id]
  );

  return (
    <SchoolLayout auth={auth} active={active} currentPath="/school-courses">
      {/* Course list */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Courses</h2>
        </div>

        {courses.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No courses yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left text-xs text-gray-500 uppercase tracking-wide py-2 px-2">Title</th>
                  <th className="text-left text-xs text-gray-500 uppercase tracking-wide py-2 px-2">Status</th>
                  <th className="text-left text-xs text-gray-500 uppercase tracking-wide py-2 px-2">Teachers</th>
                  <th className="text-left text-xs text-gray-500 uppercase tracking-wide py-2 px-2">Students</th>
                  <th className="text-left text-xs text-gray-500 uppercase tracking-wide py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-2 font-medium">
                      <a href={`/school-course?course_id=${c.id}`} className="text-teal-700 hover:underline">
                        {c.title}
                      </a>
                    </td>
                    <td className="py-3 px-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                        c.status === "ACTIVE"
                          ? "bg-green-50 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-gray-600">{c.teacher_count}</td>
                    <td className="py-3 px-2 text-gray-600">{c.student_count}</td>
                    <td className="py-3 px-2">
                      <a href={`/school-course?course_id=${c.id}`} className="text-sm text-teal-700 hover:underline">
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

      {/* Create course form */}
      <Card title="Create Course">
        <form action={createCourseAction} className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-sm mb-1">Course title</label>
            <input
              name="title"
              required
              placeholder="e.g. Medical Nursing"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
            Create
          </button>
        </form>
      </Card>
    </SchoolLayout>
  );
}
