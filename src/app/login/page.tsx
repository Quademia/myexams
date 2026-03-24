// src/app/login/page.tsx
// The login page — renders the form and handles submission.
//
// HOW IT WORKS IN NEXT.JS:
// Unlike the old code where GET and POST were handled in the same if-block,
// Next.js separates concerns:
// - This file (page.tsx) renders the form (like the old GET handler)
// - The "action" attribute points to a Server Action (like the old POST handler)
//
// Server Actions are functions that run on the server when a form is submitted.
// They're marked with "use server" at the top. Next.js handles the form POST
// automatically — no need to manually parse FormData or set response headers.

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { pbkdf2Hex } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { Card } from "@/components/Card";

// This is the Server Action — it runs on the server when the form is submitted.
// It's the equivalent of the old "if (request.method === 'POST')" block.
async function loginAction(formData: FormData) {
  "use server";

  const email = (formData.get("email") as string || "").toLowerCase().trim();
  const password = (formData.get("password") as string || "");

  if (!email || !password) {
    redirect("/login?error=missing");
  }

  const { first, all, run } = getDb();
  const { APP_SECRET } = getEnv();

  // Look up the user by email.
  const u = await first<{
    id: string;
    email: string;
    name: string;
    password_salt: string;
    password_hash: string;
    password_iter: number;
    is_system_admin: number;
  }>(
    "SELECT id, email, name, password_salt, password_hash, password_iter, is_system_admin FROM users WHERE email=? AND status='ACTIVE'",
    [email]
  );

  if (!u) {
    redirect("/login?error=invalid");
  }

  // Hash the provided password with the same salt/pepper and compare.
  const check = await pbkdf2Hex(
    password + "|" + APP_SECRET,
    u.password_salt,
    Number(u.password_iter)
  );

  if (check !== u.password_hash) {
    redirect("/login?error=invalid");
  }

  // Password matches — create a session.
  const token = crypto.randomUUID() + "-" + crypto.randomUUID();
  const tokenHash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
    )
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();

  await run(
    "INSERT INTO sessions (token_hash, user_id, active_tenant_id, expires_at, created_at) VALUES (?,?,?,?,?)",
    [tokenHash, u.id, null, expires, now]
  );

  // Set the session cookie.
  const cookieStore = await cookies();
  cookieStore.set("qa_sess", token, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  // Redirect based on role — same logic as the old code.
  if (Number(u.is_system_admin) === 1) {
    redirect("/sys");
  }

  const mems = await all<{ tenant_id: string; role: string; tenant_name: string }>(
    `SELECT m.tenant_id, m.role, t.name AS tenant_name
     FROM memberships m
     JOIN tenants t ON t.id = m.tenant_id
     WHERE m.user_id=? AND m.status='ACTIVE' AND t.status='ACTIVE'
     ORDER BY t.name ASC`,
    [u.id]
  );

  if (!mems.length) {
    redirect("/no-access");
  }

  if (mems.length === 1) {
    await run("UPDATE sessions SET active_tenant_id=? WHERE token_hash=?", [
      mems[0].tenant_id,
      tokenHash,
    ]);
    if (mems[0].role === "SCHOOL_ADMIN") redirect("/school");
    if (mems[0].role === "TEACHER") redirect("/teacher");
    if (mems[0].role === "STUDENT") redirect("/student");
    redirect("/no-access");
  }

  redirect("/choose-school");
}

// This is the page component — it renders the login form.
// The searchParams prop gives us access to ?error=invalid in the URL.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const error = params.error;

  return (
    <main className="max-w-md mx-auto p-6 mt-12">
      <Card>
        <h1 className="text-xl font-bold mb-4">Login</h1>

        {/* Show error message if login failed */}
        {error === "invalid" && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">
            Wrong email or password.
          </div>
        )}
        {error === "missing" && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">
            Please enter both email and password.
          </div>
        )}

        {/* The action={loginAction} tells Next.js to run our Server Action
            when the form is submitted. No fetch() or API route needed. */}
        <form action={loginAction}>
          <label className="block text-sm mb-1 mt-3">Email</label>
          <input
            name="email"
            type="email"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />

          <label className="block text-sm mb-1 mt-3">Password</label>
          <input
            name="password"
            type="password"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />

          <button
            type="submit"
            className="w-full mt-4 py-2 bg-teal-700 text-white font-semibold rounded-lg hover:bg-teal-800 transition-colors"
          >
            Login
          </button>
        </form>

        <p className="text-xs text-gray-400 mt-4">
          Have a join code? Go to <a href="/join" className="text-teal-700 hover:underline">/join</a>.
        </p>
        <p className="text-xs text-gray-400 mt-1">
          <a href="/" className="text-teal-700 hover:underline">← Back to home</a>
        </p>
      </Card>
    </main>
  );
}
