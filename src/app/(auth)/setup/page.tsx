// src/app/setup/page.tsx
// First-time setup — creates the very first System Admin account.
// This page is only useful on a fresh deployment with zero users.
// Once a user exists, it refuses to do anything and links to /login.
//
// HOW IT WORKS:
// 1. On load, we count how many users exist in the database.
// 2. If there are already users → show "Setup already done" and a link to /login.
// 3. If zero users → show a form to create the System Admin.
// 4. On submit, a Server Action hashes the password (same PBKDF2 approach as
//    everywhere else) and inserts the user with is_system_admin = 1.
// 5. After success, redirect to /login so they can log in with the new account.

import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { pbkdf2Hex, randomSaltHex } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { Card } from "@/components/ui/Card";

// ---------- Server Action ----------
// Runs on the server when the setup form is submitted.
// Creates the System Admin user if no users exist yet.
async function setupAction(formData: FormData) {
  "use server";

  const { first, run } = getDb();

  // Safety guard: if someone already exists, don't create another admin.
  // This protects against race conditions (two people submitting at once).
  const row = await first<{ n: number }>("SELECT COUNT(*) AS n FROM qa_users");
  if (row && row.n > 0) {
    redirect("/login");
  }

  // Read and clean form values.
  const name = (formData.get("name") as string || "").trim();
  const email = (formData.get("email") as string || "").toLowerCase().trim();
  const password = (formData.get("password") as string || "");

  // Validate — all fields required, password must be 6+ characters.
  if (!name || !email || password.length < 6) {
    redirect("/setup?error=invalid");
  }

  // Hash the password using the same approach as the rest of the app:
  // PBKDF2 with a random salt, 40,000 iterations, and APP_SECRET as a pepper.
  const { APP_SECRET } = getEnv();
  const saltHex = randomSaltHex();
  const iter = 40000;
  const hashHex = await pbkdf2Hex(password + "|" + APP_SECRET, saltHex, iter);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Insert the System Admin user.
  await run(
    "INSERT INTO qa_users (id, email, name, password_salt, password_hash, password_iter, is_system_admin, status, created_at, updated_at) VALUES (?,?,?,?,?,?,1,'ACTIVE',?,?)",
    [id, email, name, saltHex, hashHex, iter, now, now]
  );

  // Done — send them to log in with their new account.
  redirect("/login");
}

// ---------- Page Component ----------

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const error = params.error;

  const { first } = getDb();

  // Check if any users already exist.
  const row = await first<{ n: number }>("SELECT COUNT(*) AS n FROM qa_users");
  const userCount = row?.n ?? 0;

  // If users exist, setup is already done — show a simple message.
  if (userCount > 0) {
    return (
      <main className="max-w-md mx-auto p-6 mt-12">
        <Card>
          <h1 className="text-xl font-bold mb-4">Setup already done</h1>
          <a href="/login" className="text-teal-700 hover:underline">
            Go to login
          </a>
        </Card>
      </main>
    );
  }

  // No users yet — show the setup form.
  return (
    <main className="max-w-md mx-auto p-6 mt-12">
      <Card>
        <h1 className="text-xl font-bold mb-4">First-time Setup</h1>
        <p className="text-sm text-gray-500 mb-4">
          Create the System Admin account (only once).
        </p>

        {/* Error message if validation failed */}
        {error === "invalid" && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">
            Check inputs. Name and email are required, password must be 6+ characters.
          </div>
        )}

        <form action={setupAction}>
          <label className="block text-sm mb-1">Full name</label>
          <input
            name="name"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3"
          />

          <label className="block text-sm mb-1">Email</label>
          <input
            name="email"
            type="email"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3"
          />

          <label className="block text-sm mb-1">Password (6+ characters)</label>
          <input
            name="password"
            type="password"
            required
            minLength={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />

          <button
            type="submit"
            className="w-full mt-4 py-2 bg-teal-700 text-white font-semibold rounded-lg hover:bg-teal-800 transition-colors"
          >
            Create System Admin
          </button>
        </form>
      </Card>
    </main>
  );
}
