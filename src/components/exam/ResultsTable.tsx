// src/components/ResultsTable.tsx
// Client component for the Results tab — handles filtering, sorting, and rendering
// the attempts table. Receives only plain serialisable data from the server.

"use client";

import { useState, useMemo } from "react";

// ---------- Types ----------

interface AttemptRow {
  id: string;
  studentName: string;
  attemptNo: number;
  gradingStatus: string;       // 'AUTO_GRADED' | 'FULLY_GRADED'
  scoreRaw: number | null;
  scoreTotal: number | null;
  scorePct: number | null;
  grade: string | null;
  passMark: number | null;
  timeSecs: number | null;
  submittedAt: string | null;
  customFields: Record<string, string>;
}

interface CustomFieldDef {
  id: string;
  label: string;
}

interface ResultsTableProps {
  rows: AttemptRow[];
  customFieldDefs: CustomFieldDef[];
  hasMultipleAttempts: boolean;
  hasPassMark: boolean;
  hasGradeBands: boolean;
  examId: string;
  csvUrl: string;
  returnTo?: string; // passed to /exam-grade so it knows where to redirect back
}

// ---------- Helpers ----------

/** Format seconds into a human-readable duration like '1h 23m', '45m 12s', '30s'. */
export function formatTime(secs: number | null): string {
  if (secs === null || secs === undefined) return "—";
  const s = Math.round(secs);
  if (s < 0) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

/** Format an ISO date string for display. */
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ---------- Component ----------

export function ResultsTable({
  rows,
  customFieldDefs,
  hasMultipleAttempts,
  hasPassMark,
  hasGradeBands,
  examId,
  csvUrl,
  returnTo,
}: ResultsTableProps) {
  const returnSuffix = returnTo ? `&return_to=${encodeURIComponent(returnTo)}` : "";
  const [filterGrading, setFilterGrading] = useState<"" | "FULLY_GRADED" | "AUTO_GRADED">("");
  const [filterPass, setFilterPass] = useState<"" | "pass" | "fail">("");
  const [sortCol, setSortCol] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Toggle sort — if same column, flip direction; otherwise set new column ascending.
  function sortResults(col: string) {
    if (col === sortCol) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  // Apply filters then sort.
  const filtered = useMemo(() => {
    let result = rows;

    // Grading status filter
    if (filterGrading) {
      result = result.filter((r) => r.gradingStatus === filterGrading);
    }

    // Pass/Fail filter
    if (filterPass && hasPassMark) {
      result = result.filter((r) => {
        if (r.scorePct === null || r.passMark === null) return false;
        if (filterPass === "pass") return r.scorePct >= r.passMark;
        return r.scorePct < r.passMark;
      });
    }

    // Sort
    const dir = sortDir === "asc" ? 1 : -1;
    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortCol) {
        case "name":
          cmp = a.studentName.localeCompare(b.studentName);
          break;
        case "attemptNo":
          cmp = (a.attemptNo ?? 0) - (b.attemptNo ?? 0);
          break;
        case "gradingStatus":
          cmp = a.gradingStatus.localeCompare(b.gradingStatus);
          break;
        case "scorePct":
          cmp = (a.scorePct ?? -1) - (b.scorePct ?? -1);
          break;
        case "timeSecs":
          cmp = (a.timeSecs ?? -1) - (b.timeSecs ?? -1);
          break;
        case "submittedAt":
          cmp = (a.submittedAt ?? "").localeCompare(b.submittedAt ?? "");
          break;
        default:
          cmp = 0;
      }
      return cmp * dir;
    });

    return result;
  }, [rows, filterGrading, filterPass, hasPassMark, sortCol, sortDir]);

  // Column header helper — renders a clickable header with sort indicator.
  const SortHeader = ({ col, children }: { col: string; children: React.ReactNode }) => (
    <th
      className="text-left text-xs text-gray-500 uppercase py-2 px-2 cursor-pointer select-none whitespace-nowrap"
      onClick={() => sortResults(col)}
    >
      {children} <span className="text-gray-300">↕</span>
    </th>
  );

  const thClass = "text-left text-xs text-gray-500 uppercase py-2 px-2";

  // Empty states
  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">
        No submissions yet.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 p-3 border-b border-gray-200">
        <select
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
          value={filterGrading}
          onChange={(e) => setFilterGrading(e.target.value as typeof filterGrading)}
        >
          <option value="">All statuses</option>
          <option value="FULLY_GRADED">Fully Graded</option>
          <option value="AUTO_GRADED">Needs Grading</option>
        </select>

        {hasPassMark && (
          <select
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            value={filterPass}
            onChange={(e) => setFilterPass(e.target.value as typeof filterPass)}
          >
            <option value="">All results</option>
            <option value="pass">Pass</option>
            <option value="fail">Fail</option>
          </select>
        )}

        <div className="flex-1" />

        <a
          href={csvUrl}
          className="px-3 py-1.5 text-sm text-teal-700 hover:underline no-underline"
        >
          ⬇ Export CSV
        </a>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">No results match your filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <SortHeader col="name">Student</SortHeader>
                {customFieldDefs.map((def) => (
                  <th key={def.id} className={thClass}>{def.label}</th>
                ))}
                {hasMultipleAttempts && <SortHeader col="attemptNo">Attempt #</SortHeader>}
                <SortHeader col="gradingStatus">Status</SortHeader>
                <SortHeader col="scorePct">Score</SortHeader>
                <SortHeader col="scorePct">%</SortHeader>
                {hasGradeBands && <th className={thClass}>Grade</th>}
                {hasPassMark && <th className={thClass}>Pass/Fail</th>}
                <SortHeader col="timeSecs">Time</SortHeader>
                <SortHeader col="submittedAt">Submitted</SortHeader>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                  {/* Student */}
                  <td className="py-2 px-2 font-medium">{r.studentName}</td>

                  {/* Custom fields */}
                  {customFieldDefs.map((def) => (
                    <td key={def.id} className="py-2 px-2 text-xs text-gray-500">
                      {r.customFields[def.id] || "—"}
                    </td>
                  ))}

                  {/* Attempt # */}
                  {hasMultipleAttempts && <td className="py-2 px-2">{r.attemptNo}</td>}

                  {/* Grading status badge */}
                  <td className="py-2 px-2">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                      r.gradingStatus === "FULLY_GRADED"
                        ? "bg-green-50 text-green-700"
                        : "bg-amber-50 text-amber-700"
                    }`}>
                      {r.gradingStatus === "FULLY_GRADED" ? "Graded" : "Needs Grading"}
                    </span>
                  </td>

                  {/* Score */}
                  <td className="py-2 px-2">
                    {r.scoreRaw !== null ? `${r.scoreRaw} / ${r.scoreTotal}` : "—"}
                  </td>

                  {/* % */}
                  <td className="py-2 px-2">
                    {r.scorePct !== null ? `${Math.round(r.scorePct)}%` : "—"}
                  </td>

                  {/* Grade */}
                  {hasGradeBands && <td className="py-2 px-2">{r.grade || "—"}</td>}

                  {/* Pass/Fail */}
                  {hasPassMark && (
                    <td className="py-2 px-2">
                      {r.scorePct !== null && r.passMark !== null ? (
                        r.scorePct >= r.passMark ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-50 text-green-700">Pass</span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700">Fail</span>
                        )
                      ) : "—"}
                    </td>
                  )}

                  {/* Time */}
                  <td className="py-2 px-2 text-xs text-gray-500">{formatTime(r.timeSecs)}</td>

                  {/* Submitted */}
                  <td className="py-2 px-2 text-xs text-gray-400">{fmtDate(r.submittedAt)}</td>

                  {/* Action */}
                  <td className="py-2 px-2">
                    {r.gradingStatus === "AUTO_GRADED" ? (
                      <a
                        href={`/exam-grade?attempt_id=${r.id}&exam_id=${examId}${returnSuffix}`}
                        className="px-2 py-1 bg-teal-700 text-white text-xs font-semibold rounded-lg hover:bg-teal-800 no-underline"
                      >
                        Grade
                      </a>
                    ) : (
                      <a
                        href={`/exam-grade?attempt_id=${r.id}&exam_id=${examId}&view=1${returnSuffix}`}
                        className="px-2 py-1 bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-300 no-underline"
                      >
                        View
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
