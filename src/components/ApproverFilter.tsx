"use client";

// Client component for the "Add approver" form with course + role filters.
// Used on the sitting-gate-settings page. Filters the approver dropdown
// dynamically as the user selects a course or role — no page reload needed.

import { useState } from "react";

type Member = { id: string; name: string; role: string };
type Course = { id: string; title: string };

const ROLE_LABELS: Record<string, string> = {
  STUDENT: "Student",
  TEACHER: "Teacher",
  SCHOOL_ADMIN: "School Admin",
};

export function ApproverFilter({
  sittingId,
  examId,
  gateType,
  members,
  courses,
  courseTeacherMap,
  distinctRoles,
  addAction,
}: {
  sittingId: string;
  examId: string;
  gateType: string;
  members: Member[];
  courses: Course[];
  courseTeacherMap: Record<string, string[]>;
  distinctRoles: string[];
  addAction: (formData: FormData) => void;
}) {
  const [courseFilter, setCourseFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  // Filter members based on course + role selections.
  let filtered = members;
  if (courseFilter) {
    const teacherIds = new Set(courseTeacherMap[courseFilter] || []);
    filtered = filtered.filter((m) => teacherIds.has(m.id));
  }
  if (roleFilter) {
    filtered = filtered.filter((m) => m.role === roleFilter);
  }

  return (
    <div className="border-t border-gray-100 pt-3">
      <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">Add approver</div>
      <form action={addAction} className="space-y-2">
        <input type="hidden" name="sitting_id" value={sittingId} />
        <input type="hidden" name="exam_id" value={examId} />
        <input type="hidden" name="gate_type" value={gateType} />

        <div className="flex gap-2 flex-wrap">
          {/* Course filter */}
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs text-gray-500 mb-1">Course filter</label>
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">All courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>

          {/* Role filter */}
          <div className="flex-1 min-w-[130px]">
            <label className="block text-xs text-gray-500 mb-1">Role filter</label>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">All roles</option>
              {distinctRoles.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Approver dropdown + add button */}
        <div className="flex gap-2 items-end flex-wrap">
          <select name="user_id" required className="flex-1 min-w-[180px] px-3 py-2 border border-gray-300 rounded-lg text-sm">
            {filtered.length === 0 ? (
              <option value="">No eligible approvers available</option>
            ) : (
              <>
                <option value="">— select approver —</option>
                {filtered.map((m) => (
                  <option key={m.id} value={m.id}>{m.name} ({ROLE_LABELS[m.role] || m.role})</option>
                ))}
              </>
            )}
          </select>
          <button
            type="submit"
            disabled={filtered.length === 0}
            className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Add
          </button>
        </div>
      </form>
    </div>
  );
}
