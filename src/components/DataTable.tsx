// src/components/DataTable.tsx
// Reusable data table — replaces all the manually written <table> HTML in the old code.
// Every page that shows a list (courses, students, members, etc.) uses this.
//
// HOW IT WORKS:
// You define columns (what headers to show) and pass in rows (the data).
// The component handles rendering the table structure, empty states, and styling.
// You can also pass a custom render function per column for special formatting
// (like badges, links, or action buttons).
//
// USAGE:
//   <DataTable
//     columns={[
//       { key: "name", label: "Name" },
//       { key: "email", label: "Email" },
//       { key: "role", label: "Role", render: (val) => <span className="pill">{val}</span> },
//     ]}
//     rows={members}
//     emptyMessage="No members found"
//   />

import React from "react";

interface Column<T> {
  key: string;                                    // The property name in the row data
  label: string;                                  // The column header text
  render?: (value: unknown, row: T) => React.ReactNode;  // Optional custom renderer
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  emptyMessage?: string;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  emptyMessage = "No data found",
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            {columns.map((col) => (
              <th
                key={col.key}
                className="text-left text-xs text-gray-500 uppercase tracking-wide py-3 px-3"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
              {columns.map((col) => (
                <td key={col.key} className="py-3 px-3">
                  {/* If a custom render function exists, use it.
                      Otherwise, just display the raw value as text. */}
                  {col.render
                    ? col.render(row[col.key], row)
                    : String(row[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
