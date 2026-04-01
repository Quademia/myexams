// src/components/sys/SchoolsSection.tsx
// System Admin schools list — search, table, new school link.

interface TenantRow {
  id: string;
  name: string;
  status: string;
  created_at: string;
  school_admin?: string | null;
  members_count?: number;
}

interface SchoolsSectionProps {
  tenants: TenantRow[];
  q: string;
}

export function SchoolsSection({ tenants, q }: SchoolsSectionProps) {
  const filtered = tenants.filter((t) => !q || t.name.toLowerCase().includes(q));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <form action="/sys" method="get" className="flex flex-1 items-center gap-2">
          <input type="hidden" name="section" value="schools" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search schools"
            className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-lg bg-gray-800 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-900"
          >
            Search
          </button>
        </form>
        <a
          href="/sys?section=schools&drawer=new-school"
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
        >
          New School
        </a>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">School</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">School Admin</th>
              <th className="px-3 py-2 text-left">Members</th>
              <th className="px-3 py-2 text-left">Created</th>
              <th className="px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-gray-400">
                  {q ? "No schools match your search." : "No schools yet."}
                </td>
              </tr>
            ) : (
              filtered.map((t) => (
                <tr key={t.id} className="border-t border-gray-100">
                  <td className="px-3 py-3 font-medium">{t.name}</td>
                  <td className="px-3 py-3">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold">
                      {t.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-gray-600">{t.school_admin || "—"}</td>
                  <td className="px-3 py-3 text-gray-600">{t.members_count ?? 0}</td>
                  <td className="px-3 py-3 text-gray-600">
                    {new Date(t.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-3">
                    <a
                      href={`/sys?section=schools&drawer=school-details&schoolId=${encodeURIComponent(t.id)}${
                        q ? `&q=${encodeURIComponent(q)}` : ""
                      }`}
                      className="text-teal-700 hover:underline"
                    >
                      Open
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
