// src/app/join/page.tsx
// Public join page — users enter a join code to join a school or course.
// Flow:
// 1. Enter code → validate → show preview
// 2a. If logged in + auto-approve → join immediately
// 2b. If logged in + needs approval → create join request
// 2c. If not logged in → show login + create account forms

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getAuth, joinCodeHash as jcHash, pbkdf2Hex, randomSaltHex, roleLabel, fmtISO, isIsoInPast } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { Card } from "@/components/Card";

// Helper: load join code by plain text.
async function loadJoinCode(codePlain: string, pepper: string) {
  const { first } = getDb();
  const h = await jcHash(codePlain, pepper);
  return await first<{
    id: string; tenant_id: string; scope: string; role: string; course_id: string | null;
    auto_approve: number; expires_at: string; max_uses: number; uses_approved: number; revoked: number;
    tenant_name: string; course_title: string | null;
  }>(
    `SELECT jc.*, t.name AS tenant_name, c.title AS course_title
     FROM join_codes jc
     JOIN tenants t ON t.id = jc.tenant_id
     LEFT JOIN courses c ON c.id = jc.course_id
     WHERE jc.code_hash=?`,
    [h]
  );
}

function isCodeValid(jc: { revoked: number; expires_at: string; uses_approved: number; max_uses: number } | null) {
  if (!jc) return { ok: false, why: "Invalid code." };
  if (jc.revoked === 1) return { ok: false, why: "This code was revoked." };
  if (isIsoInPast(jc.expires_at)) return { ok: false, why: "This code has expired." };
  if (jc.uses_approved >= jc.max_uses) return { ok: false, why: "This code has reached its maximum uses." };
  return { ok: true, why: "" };
}

// ============================================================
// Server Actions
// ============================================================

async function checkCodeAction(formData: FormData) {
  "use server";
  const code = (formData.get("code") as string || "").toUpperCase().replaceAll(" ", "");
  if (!code) redirect("/join");
  redirect(`/join?code=${encodeURIComponent(code)}`);
}

async function joinLoginAction(formData: FormData) {
  "use server";
  const codePlain = (formData.get("code") as string || "").toUpperCase().replaceAll(" ", "");
  const email = (formData.get("email") as string || "").toLowerCase().trim();
  const password = formData.get("password") as string || "";

  const { APP_SECRET } = getEnv();
  const { first, all, run } = getDb();

  const jc = await loadJoinCode(codePlain, APP_SECRET);
  const v = isCodeValid(jc);
  if (!v.ok || !jc) redirect(`/join?code=${encodeURIComponent(codePlain)}&error=${encodeURIComponent(v.why)}`);

  const u = await first<{
    id: string; password_salt: string; password_hash: string; password_iter: number;
  }>("SELECT id, password_salt, password_hash, password_iter FROM users WHERE email=? AND status='ACTIVE'", [email]);
  if (!u) redirect(`/join?code=${encodeURIComponent(codePlain)}&error=Wrong+email+or+password`);

  const check = await pbkdf2Hex(password + "|" + APP_SECRET, u.password_salt, Number(u.password_iter));
  if (check !== u.password_hash) redirect(`/join?code=${encodeURIComponent(codePlain)}&error=Wrong+email+or+password`);

  // Create session.
  const token = crypto.randomUUID() + "-" + crypto.randomUUID();
  const tokenHashVal = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))))
    .map(b => b.toString(16).padStart(2, "0")).join("");
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await run("INSERT INTO sessions (token_hash, user_id, active_tenant_id, expires_at, created_at) VALUES (?,?,?,?,?)",
    [tokenHashVal, u.id, jc.tenant_id, expires, now]);

  const cookieStore = await cookies();
  cookieStore.set("qa_sess", token, { path: "/", httpOnly: true, secure: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 });

  if (jc.auto_approve === 1) {
    await run(`UPDATE join_codes SET uses_approved = uses_approved + 1, updated_at=? WHERE id=? AND revoked=0 AND uses_approved < max_uses`, [now, jc.id]);
    await applyJoin(u.id, jc, run, first);
    redirect("/");
  }

  // Needs approval — create request.
  const exists = await first("SELECT id FROM join_requests WHERE join_code_id=? AND user_id=? AND status='PENDING' LIMIT 1", [jc.id, u.id]);
  if (!exists) {
    const reqType = jc.scope === "TENANT_ROLE" ? "MEMBERSHIP" : jc.scope;
    await run(
      `INSERT INTO join_requests (id, join_code_id, tenant_id, course_id, user_id, type, requested_role, status, created_at) VALUES (?,?,?,?,?,?,?,'PENDING',?)`,
      [crypto.randomUUID(), jc.id, jc.tenant_id, jc.course_id, u.id, reqType, jc.role, now]
    );
  }
  redirect(`/join?success=request`);
}

async function joinCreateAccountAction(formData: FormData) {
  "use server";
  const codePlain = (formData.get("code") as string || "").toUpperCase().replaceAll(" ", "");
  const name = (formData.get("name") as string || "").trim();
  const email = (formData.get("email") as string || "").toLowerCase().trim();
  const password = formData.get("password") as string || "";

  if (!name || !email || password.length < 6) {
    redirect(`/join?code=${encodeURIComponent(codePlain)}&error=Check+inputs.+Password+must+be+6%2B+characters`);
  }

  const { APP_SECRET } = getEnv();
  const { first, run } = getDb();

  const jc = await loadJoinCode(codePlain, APP_SECRET);
  const v = isCodeValid(jc);
  if (!v.ok || !jc) redirect(`/join?code=${encodeURIComponent(codePlain)}&error=${encodeURIComponent(v.why)}`);

  const now = new Date().toISOString();
  let u = await first<{ id: string }>("SELECT id FROM users WHERE email=? AND status='ACTIVE'", [email]);
  let userId = u?.id;

  if (!userId) {
    const saltHex = randomSaltHex();
    const iter = 40000;
    const hashHex = await pbkdf2Hex(password + "|" + APP_SECRET, saltHex, iter);
    userId = crypto.randomUUID();
    await run(
      "INSERT INTO users (id, email, name, password_salt, password_hash, password_iter, is_system_admin, status, created_at, updated_at) VALUES (?,?,?,?,?,?,0,'ACTIVE',?,?)",
      [userId, email, name, saltHex, hashHex, iter, now, now]
    );
  }

  // Create session.
  const token = crypto.randomUUID() + "-" + crypto.randomUUID();
  const tokenHashVal = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))))
    .map(b => b.toString(16).padStart(2, "0")).join("");
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await run("INSERT INTO sessions (token_hash, user_id, active_tenant_id, expires_at, created_at) VALUES (?,?,?,?,?)",
    [tokenHashVal, userId, jc.tenant_id, expires, now]);

  const cookieStore = await cookies();
  cookieStore.set("qa_sess", token, { path: "/", httpOnly: true, secure: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 });

  if (jc.auto_approve === 1) {
    await run(`UPDATE join_codes SET uses_approved = uses_approved + 1, updated_at=? WHERE id=? AND revoked=0 AND uses_approved < max_uses`, [now, jc.id]);
    await applyJoin(userId, jc, run, first);
    redirect("/");
  }

  const exists = await first("SELECT id FROM join_requests WHERE join_code_id=? AND user_id=? AND status='PENDING' LIMIT 1", [jc.id, userId]);
  if (!exists) {
    const reqType = jc.scope === "TENANT_ROLE" ? "MEMBERSHIP" : jc.scope;
    await run(
      `INSERT INTO join_requests (id, join_code_id, tenant_id, course_id, user_id, type, requested_role, status, created_at) VALUES (?,?,?,?,?,?,?,'PENDING',?)`,
      [crypto.randomUUID(), jc.id, jc.tenant_id, jc.course_id, userId, reqType, jc.role, now]
    );
  }
  redirect(`/join?success=request`);
}

// Helper: apply join action (membership + enrolment/assignment).
async function applyJoin(
  userId: string,
  jc: { tenant_id: string; scope: string; role: string; course_id: string | null },
  run: (sql: string, params?: unknown[]) => Promise<void>,
  first: <T>(sql: string, params?: unknown[]) => Promise<T | null>,
) {
  const now = new Date().toISOString();

  // Ensure membership.
  const m = await first<{ id: string; role: string; status: string }>(
    "SELECT id, role, status FROM memberships WHERE tenant_id=? AND user_id=? ORDER BY created_at ASC LIMIT 1",
    [jc.tenant_id, userId]
  );
  const roleToSet = (m?.role === "SCHOOL_ADMIN" && m?.status === "ACTIVE") ? "SCHOOL_ADMIN" : jc.role;

  if (!m) {
    await run("INSERT INTO memberships (id, user_id, tenant_id, role, status, created_at, updated_at) VALUES (?,?,?,?,'ACTIVE',?,?)",
      [crypto.randomUUID(), userId, jc.tenant_id, roleToSet, now, now]);
  } else if (m.status !== "ACTIVE" || m.role !== roleToSet) {
    await run("UPDATE memberships SET role=?, status='ACTIVE', updated_at=? WHERE id=?", [roleToSet, now, m.id]);
  }

  // Course enrolment.
  if (jc.scope === "COURSE_ENROLL" && jc.course_id) {
    const ex = await first("SELECT 1 FROM enrollments WHERE course_id=? AND user_id=?", [jc.course_id, userId]);
    if (!ex) {
      await run("INSERT INTO enrollments (id, course_id, user_id, tenant_id, status, created_at, updated_at) VALUES (?,?,?,?,'ACTIVE',?,?)",
        [crypto.randomUUID(), jc.course_id, userId, jc.tenant_id, now, now]);
    }
  }

  // Course teacher assignment.
  if (jc.scope === "COURSE_TEACHER" && jc.course_id) {
    const ex = await first("SELECT 1 FROM course_teachers WHERE course_id=? AND user_id=?", [jc.course_id, userId]);
    if (!ex) {
      await run("INSERT INTO course_teachers (course_id, user_id) VALUES (?,?)", [jc.course_id, userId]);
    }
  }
}

// ============================================================
// Page Component
// ============================================================

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; error?: string; success?: string }>;
}) {
  const params = await searchParams;
  const code = params.code;
  const error = params.error;
  const success = params.success;

  const auth = await getAuth();
  const isLoggedIn = !!auth.user;

  // Success message.
  if (success === "request") {
    return (
      <main className="max-w-md mx-auto p-6 mt-12">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <h1 className="text-lg font-bold text-green-800">Request sent</h1>
          <p className="text-sm text-green-700 mt-2">A School Admin must approve this request.</p>
          <div className="flex gap-3 mt-3 text-sm">
            <a href="/" className="text-teal-700 hover:underline">Dashboard</a>
            <a href="/join" className="text-teal-700 hover:underline">Join another</a>
          </div>
        </div>
      </main>
    );
  }

  // Step 1: No code entered yet — show input form.
  if (!code) {
    return (
      <main className="max-w-md mx-auto p-6 mt-12">
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold">Join a school or course</h1>
            <a href={isLoggedIn ? "/" : "/login"} className="text-sm text-teal-700 hover:underline">
              {isLoggedIn ? "Dashboard" : "Login"}
            </a>
          </div>
          <p className="text-sm text-gray-500 mb-3">Enter your join code.</p>
          <form action={checkCodeAction}>
            <label className="block text-sm mb-1">Join code</label>
            <input name="code" placeholder="ABCD-EFGH" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />
            <button type="submit" className="w-full py-2 bg-teal-700 text-white font-semibold rounded-lg hover:bg-teal-800">
              Continue
            </button>
          </form>
        </Card>
      </main>
    );
  }

  // Step 2: Code entered — validate and show preview.
  const { APP_SECRET } = getEnv();
  const jc = await loadJoinCode(code, APP_SECRET);
  const v = isCodeValid(jc);

  if (!v.ok || !jc) {
    return (
      <main className="max-w-md mx-auto p-6 mt-12">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm text-red-700 font-semibold">{error || v.why}</p>
          <a href="/join" className="text-sm text-teal-700 hover:underline mt-2 inline-block">Back</a>
        </div>
      </main>
    );
  }

  // If logged in — handle directly.
  if (isLoggedIn) {
    // For logged-in users with auto-approve, we'd normally process immediately.
    // But since this is a GET page, we show a confirm button instead.
    return (
      <main className="max-w-md mx-auto p-6 mt-12">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-3">{error}</div>
        )}
        <Card>
          <h1 className="text-lg font-bold mb-2">Join preview</h1>
          <p className="text-sm text-gray-600">School: <strong>{jc.tenant_name}</strong></p>
          <p className="text-sm text-gray-600">Role: <strong>{roleLabel(jc.role)}</strong></p>
          {jc.course_title && <p className="text-sm text-gray-600">Course: <strong>{jc.course_title}</strong></p>}
          <p className="text-sm text-gray-400 mt-1">
            {jc.auto_approve === 1 ? "Auto-approve: Yes" : "Requires admin approval"}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500 mb-3">You are logged in as <strong>{auth.user!.name}</strong>. Click below to join.</p>
          <form action={joinLoginAction}>
            <input type="hidden" name="code" value={code} />
            <input type="hidden" name="email" value={auth.user!.email} />
            <input type="hidden" name="password" value="__session_auth__" />
            <button type="submit" className="w-full py-2 bg-teal-700 text-white font-semibold rounded-lg hover:bg-teal-800">
              Join
            </button>
          </form>
        </Card>
      </main>
    );
  }

  // Not logged in — show login + create account forms.
  return (
    <main className="max-w-2xl mx-auto p-6 mt-8">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-3">{error}</div>
      )}
      <Card>
        <h1 className="text-lg font-bold mb-2">Join preview</h1>
        <p className="text-sm text-gray-600">School: <strong>{jc.tenant_name}</strong></p>
        <p className="text-sm text-gray-600">Role: <strong>{roleLabel(jc.role)}</strong></p>
        {jc.course_title && <p className="text-sm text-gray-600">Course: <strong>{jc.course_title}</strong></p>}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card title="Login">
          <form action={joinLoginAction}>
            <input type="hidden" name="code" value={code} />
            <label className="block text-sm mb-1">Email</label>
            <input name="email" type="email" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />
            <label className="block text-sm mb-1">Password</label>
            <input name="password" type="password" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />
            <button type="submit" className="w-full py-2 bg-teal-700 text-white font-semibold rounded-lg hover:bg-teal-800">
              Login &amp; join
            </button>
          </form>
        </Card>

        <Card title="Create account">
          <form action={joinCreateAccountAction}>
            <input type="hidden" name="code" value={code} />
            <label className="block text-sm mb-1">Full name</label>
            <input name="name" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />
            <label className="block text-sm mb-1">Email</label>
            <input name="email" type="email" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />
            <label className="block text-sm mb-1">Password (6+ characters)</label>
            <input name="password" type="password" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />
            <button type="submit" className="w-full py-2 bg-teal-700 text-white font-semibold rounded-lg hover:bg-teal-800">
              Create &amp; join
            </button>
          </form>
        </Card>
      </div>
      <p className="text-sm mt-3"><a href="/join" className="text-teal-700 hover:underline">Back</a></p>
    </main>
  );
}
