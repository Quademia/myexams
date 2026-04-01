// src/app/profile/page.tsx
// User profile page — shows name, email, schools, and change password form.

import { redirect } from "next/navigation";
import { requireAuth, roleLabel, pbkdf2Hex, randomSaltHex } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { Card } from "@/components/ui/Card";

async function changePasswordAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();

  const oldPw = formData.get("old_password") as string || "";
  const newPw = formData.get("new_password") as string || "";
  const newPw2 = formData.get("new_password2") as string || "";

  if (newPw.length < 6) redirect("/profile?error=short");
  if (newPw !== newPw2) redirect("/profile?error=mismatch");

  const { first, run } = getDb();
  const { APP_SECRET } = getEnv();

  const u = await first<{ id: string; password_salt: string; password_hash: string; password_iter: number }>(
    "SELECT id, password_salt, password_hash, password_iter FROM qa_users WHERE id=? AND status='ACTIVE'",
    [auth.user!.id]
  );
  if (!u) redirect("/logout");

  const check = await pbkdf2Hex(oldPw + "|" + APP_SECRET, u.password_salt, Number(u.password_iter));
  if (check !== u.password_hash) redirect("/profile?error=wrong");

  const saltHex = randomSaltHex();
  const iter = 40000;
  const hashHex = await pbkdf2Hex(newPw + "|" + APP_SECRET, saltHex, iter);
  await run("UPDATE qa_users SET password_salt=?, password_hash=?, password_iter=?, updated_at=? WHERE id=?",
    [saltHex, hashHex, iter, new Date().toISOString(), auth.user!.id]);

  redirect("/profile?success=1&toast=Password+changed");
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const auth = await requireAuth();
  const params = await searchParams;

  const errors: Record<string, string> = {
    short: "New password must be 6+ characters.",
    mismatch: "Passwords do not match.",
    wrong: "Current password is incorrect.",
  };

  return (
    <main className="max-w-lg mx-auto p-6 mt-8">
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-lg font-bold">Profile</h1>
          <div className="flex gap-3 text-sm">
            <a href="/" className="text-teal-700 hover:underline">Dashboard</a>
            <a href="/logout" className="text-teal-700 hover:underline">Logout</a>
          </div>
        </div>
        <p className="text-sm text-gray-600 mt-2">
          <strong>{auth.user!.name}</strong> — {auth.user!.email}
        </p>
        {auth.user!.is_system_admin === 1 && (
          <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-xs font-semibold">
            System Admin
          </span>
        )}
      </Card>

      <Card title="My schools">
        {auth.memberships.length === 0 ? (
          <p className="text-sm text-gray-400">None</p>
        ) : (
          <ul className="space-y-1">
            {auth.memberships.map((m) => (
              <li key={m.tenant_id} className="text-sm">
                <strong>{m.tenant_name}</strong>
                <span className="ml-2 inline-block px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-xs font-semibold">
                  {roleLabel(m.role)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Change password">
        {params.success === "1" && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg p-3 mb-3">
            Password updated successfully.
          </div>
        )}
        {params.error && errors[params.error] && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-3">
            {errors[params.error]}
          </div>
        )}
        <form action={changePasswordAction}>
          <label className="block text-sm mb-1">Current password</label>
          <input name="old_password" type="password" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />
          <label className="block text-sm mb-1">New password (6+ characters)</label>
          <input name="new_password" type="password" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />
          <label className="block text-sm mb-1">Confirm new password</label>
          <input name="new_password2" type="password" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />
          <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
            Update password
          </button>
        </form>
      </Card>
    </main>
  );
}
