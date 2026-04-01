// src/components/sys/OverviewSection.tsx
// System Admin overview — stat cards, recent schools, quick actions.

import { Card } from "@/components/ui/Card";

interface TenantRow {
  id: string;
  name: string;
  status: string;
  created_at: string;
  school_admin?: string | null;
  members_count?: number;
}

interface OverviewSectionProps {
  tenants: TenantRow[];
  activeTenantCount: number;
  totalUsers: number;
  noAccessUsers: number;
}

export function OverviewSection({ tenants, activeTenantCount, totalUsers, noAccessUsers }: OverviewSectionProps) {
  const stats = [
    { label: "Total Schools", value: tenants.length },
    { label: "Active Schools", value: activeTenantCount },
    { label: "Total Users", value: totalUsers },
    { label: "Users With No Access", value: noAccessUsers },
  ];

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <p className="text-sm text-gray-500">{stat.label}</p>
            <p className="mt-2 text-2xl font-bold">{stat.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Recent schools */}
        <Card>
          <div className="mb-3 flex items-center justify-between xl:col-span-2">
            <h3 className="text-base font-semibold">Recent Schools</h3>
            <a href="/sys?section=schools" className="text-sm text-teal-700 hover:underline">
              View all
            </a>
          </div>
          {tenants.length === 0 ? (
            <p className="text-sm text-gray-400">No schools yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {tenants.slice(0, 6).map((t) => (
                <li key={t.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(t.created_at).toLocaleDateString()} &bull; {t.status}
                    </p>
                  </div>
                  <a
                    href={`/sys?section=schools&drawer=school-details&schoolId=${encodeURIComponent(t.id)}`}
                    className="text-teal-700 hover:underline"
                  >
                    Open
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Quick actions */}
        <Card>
          <h3 className="mb-3 text-base font-semibold">Quick Actions</h3>
          <div className="space-y-2">
            <a
              href="/sys?section=schools&drawer=new-school"
              className="block rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium hover:bg-gray-50"
            >
              New School
            </a>
            <a
              href="/sys?section=users&focus=search"
              className="block rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Find User
            </a>
            <a
              href="/sys?section=schools"
              className="block rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium hover:bg-gray-50"
            >
              View Schools
            </a>
            <a
              href="/sys?section=users"
              className="block rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium hover:bg-gray-50"
            >
              View Users
            </a>
          </div>
        </Card>
      </div>
    </div>
  );
}
