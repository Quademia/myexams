// src/components/sys/UsersSection.tsx
// System Admin user search — email search, results table, manage access links.

interface SearchResult {
  user: { id: string; email: string; name: string; is_system_admin: number; status: string };
  memberships: { tenant_name: string; role: string; status: string }[];
}

interface UsersSectionProps {
  searchResults: SearchResult[];
  q: string;
  focusSearch: boolean;
}

export function UsersSection({ searchResults, q, focusSearch }: UsersSectionProps) {
  return (
    <div className="space-y-4">
      <form action="/sys" method="get" className="flex items-center gap-2">
        <input type="hidden" name="section" value="users" />
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by email"
          required
          autoFocus={focusSearch}
          className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
        >
          Search
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">User</th>
              <th className="px-3 py-2 text-left">Account Type</th>
              <th className="px-3 py-2 text-left">Memberships</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!q ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-400">
                  Search by email to view users.
                </td>
              </tr>
            ) : searchResults.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-400">
                  No users found.
                </td>
              </tr>
            ) : (
              searchResults.map(({ user, memberships }) => (
                <tr key={user.id} className="border-t border-gray-100">
                  <td className="px-3 py-3">
                    <div className="font-medium">{user.email}</div>
                    <div className="text-xs text-gray-500">{user.name}</div>
                  </td>
                  <td className="px-3 py-3">
                    {user.is_system_admin === 1 ? (
                      <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">
                        System Admin
                      </span>
                    ) : (
                      <span className="text-gray-600">Standard User</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-600">
                    {memberships.length === 0 ? (
                      <span className="text-gray-400">No memberships</span>
                    ) : (
                      memberships.map((m, i) => (
                        <div key={i}>
                          {m.tenant_name}: {m.role} ({m.status})
                        </div>
                      ))
                    )}
                  </td>
                  <td className="px-3 py-3">{user.status}</td>
                  <td className="px-3 py-3">
                    <a
                      href={`/sys?section=users&drawer=user-access&userId=${encodeURIComponent(user.id)}&q=${encodeURIComponent(q)}`}
                      className="text-teal-700 hover:underline"
                    >
                      Manage Access
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
