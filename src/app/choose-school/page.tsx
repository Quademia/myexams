// src/app/choose-school/page.tsx
// Shows a list of schools the user belongs to, letting them pick one.
// Only shown when a user has memberships in multiple schools.

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership, setActiveTenant, roleLabel } from "@/lib/auth";
import { Card } from "@/components/Card";

// Server Action — runs when the user clicks "Switch" or "Open" on a school card.
async function switchSchoolAction(formData: FormData) {
  "use server";
  const tenantId = formData.get("tenant_id") as string;
  if (!tenantId) redirect("/choose-school");

  const auth = await requireAuth();
  const membership = auth.memberships.find((m) => m.tenant_id === tenantId);
  if (!membership) redirect("/choose-school");

  await setActiveTenant(tenantId);
  redirect("/");
}

export default async function ChooseSchoolPage() {
  const auth = await requireAuth();

  if (auth.user!.is_system_admin === 1) redirect("/sys");
  if (!auth.memberships.length) redirect("/no-access");
  if (auth.memberships.length === 1) {
    await setActiveTenant(auth.memberships[0].tenant_id);
    redirect("/");
  }

  const active = pickActiveMembership(auth);
  const activeId = active?.tenant_id ?? null;

  return (
    <main className="max-w-lg mx-auto p-6 mt-8">
      <Card>
        <h1 className="text-xl font-bold">Choose School</h1>
        <p className="text-sm text-gray-500 mt-1">
          Select which school you want to use right now.
        </p>
      </Card>

      {auth.memberships.map((m) => {
        const isCurrent = activeId === m.tenant_id;
        return (
          <Card key={m.tenant_id}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">{m.tenant_name}</div>
                <div className="text-sm text-gray-500 mt-1">
                  <span className="inline-block px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-xs font-semibold">
                    {roleLabel(m.role)}
                  </span>
                  {isCurrent && (
                    <span className="inline-block ml-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold">
                      Current
                    </span>
                  )}
                </div>
              </div>
              <form action={switchSchoolAction}>
                <input type="hidden" name="tenant_id" value={m.tenant_id} />
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800"
                >
                  {isCurrent ? "Open" : "Switch"}
                </button>
              </form>
            </div>
          </Card>
        );
      })}

      <div className="flex gap-4 mt-4 text-sm">
        <a href="/profile" className="text-teal-700 hover:underline">Profile</a>
        <a href="/logout" className="text-teal-700 hover:underline">Logout</a>
      </div>
    </main>
  );
}
