// src/app/school-join-codes/page.tsx
// Join Codes page — 3 sections: Active Codes, Create Code, Pending Requests.
// Uses plain English questions ("Who is this for?" + "What should happen?")
// instead of technical scope names.

import { redirect } from "next/navigation";
import { requireAuth, pickActiveMembership, roleLabel, makeJoinCodePlain, joinCodeHash, isIsoInPast, describeCode, fmtISO } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { SchoolLayout } from "@/components/SchoolLayout";
import { Card } from "@/components/Card";

// ============================================================
// Server Actions
// ============================================================

async function createCodeAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const who = (formData.get("who") as string || "").trim();
  const action = (formData.get("action") as string || "").trim();
  const courseId = (formData.get("course_id") as string || "").trim();
  const autoApprove = Number(formData.get("auto_approve") || "0") === 1 ? 1 : 0;
  const expDays = Math.max(1, parseInt(formData.get("exp_days") as string || "14", 10) || 14);
  const maxUses = Math.max(1, parseInt(formData.get("max_uses") as string || "300", 10) || 300);

  // Map the two plain English questions to scope + role.
  let scope: string, role: string, course_id: string | null = null;
  if (who === "student" && action === "school") { scope = "TENANT_ROLE"; role = "STUDENT"; }
  else if (who === "student" && action === "course") { scope = "COURSE_ENROLL"; role = "STUDENT"; course_id = courseId || null; }
  else if (who === "teacher" && action === "school") { scope = "TENANT_ROLE"; role = "TEACHER"; }
  else if (who === "teacher" && action === "course") { scope = "COURSE_TEACHER"; role = "TEACHER"; course_id = courseId || null; }
  else redirect("/school-join-codes");

  if ((scope! === "COURSE_ENROLL" || scope! === "COURSE_TEACHER") && !course_id) {
    redirect("/school-join-codes?error=no_course");
  }

  const { first, run } = getDb();
  const { APP_SECRET } = getEnv();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + expDays * 24 * 60 * 60 * 1000).toISOString();

  // Generate unique code.
  let codePlain = "", codeHash_ = "";
  for (let i = 0; i < 6; i++) {
    codePlain = makeJoinCodePlain();
    codeHash_ = await joinCodeHash(codePlain, APP_SECRET);
    const exists = await first("SELECT id FROM join_codes WHERE code_hash=? LIMIT 1", [codeHash_]);
    if (!exists) break;
  }

  await run(
    `INSERT INTO join_codes (id, tenant_id, scope, role, course_id, code_hash, auto_approve, expires_at, max_uses, uses_approved, revoked, created_by_user_id, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,0,0,?,?,?)`,
    [crypto.randomUUID(), active.tenant_id, scope!, role!, course_id, codeHash_, autoApprove, expiresAt, maxUses, auth.user!.id, now, now]
  );

  redirect(`/school-join-codes?new_code=${encodeURIComponent(codePlain)}`);
}

async function revokeCodeAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const codeId = formData.get("code_id") as string;
  const { run } = getDb();
  await run("UPDATE join_codes SET revoked=1, updated_at=? WHERE id=? AND tenant_id=?",
    [new Date().toISOString(), codeId, active.tenant_id]);
  redirect("/school-join-codes");
}

async function approveRequestAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const reqId = formData.get("request_id") as string;
  if (!reqId) redirect("/school-join-codes");

  const { first, all, run } = getDb();
  const now = new Date().toISOString();

  const jr = await first<{
    id: string; user_id: string; join_code_id: string; type: string;
    requested_role: string; course_id: string | null;
  }>("SELECT * FROM join_requests WHERE id=? AND tenant_id=? AND status='PENDING'", [reqId, active.tenant_id]);
  if (!jr) redirect("/school-join-codes");

  // Load the join code to apply its action.
  const jc = await first<{
    id: string; tenant_id: string; scope: string; role: string; course_id: string | null;
    revoked: number; expires_at: string; max_uses: number; uses_approved: number;
    course_title?: string;
  }>(
    `SELECT jc.*, c.title AS course_title FROM join_codes jc
     LEFT JOIN courses c ON c.id=jc.course_id
     WHERE jc.id=? AND jc.tenant_id=?`,
    [jr.join_code_id, active.tenant_id]
  );

  // Validate code is still usable.
  if (!jc || jc.revoked === 1 || isIsoInPast(jc.expires_at) || jc.uses_approved >= jc.max_uses) {
    redirect("/school-join-codes?error=code_invalid");
  }

  // Reserve a use.
  const res = await run(
    `UPDATE join_codes SET uses_approved = uses_approved + 1, updated_at=?
     WHERE id=? AND revoked=0 AND uses_approved < max_uses AND expires_at > ?`,
    [now, jc.id, now]
  );

  // Apply the join action: ensure membership + course enrolment/assignment.
  const userId = jr.user_id;

  // Ensure membership exists.
  const m = await first<{ id: string; role: string; status: string }>(
    "SELECT id, role, status FROM memberships WHERE tenant_id=? AND user_id=? ORDER BY created_at ASC LIMIT 1",
    [jc.tenant_id, userId]
  );

  if (jc.scope === "TENANT_ROLE") {
    const roleToSet = (m?.role === "SCHOOL_ADMIN" && m?.status === "ACTIVE") ? "SCHOOL_ADMIN" : jc.role;
    if (!m) {
      await run("INSERT INTO memberships (id, user_id, tenant_id, role, status, created_at, updated_at) VALUES (?,?,?,?,'ACTIVE',?,?)",
        [crypto.randomUUID(), userId, jc.tenant_id, roleToSet, now, now]);
    } else {
      await run("UPDATE memberships SET role=?, status='ACTIVE', updated_at=? WHERE id=?", [roleToSet, now, m.id]);
    }
  }

  if (jc.scope === "COURSE_ENROLL" && jc.course_id) {
    if (!m) {
      await run("INSERT INTO memberships (id, user_id, tenant_id, role, status, created_at, updated_at) VALUES (?,?,?,?,'ACTIVE',?,?)",
        [crypto.randomUUID(), userId, jc.tenant_id, "STUDENT", now, now]);
    }
    const ex = await first("SELECT 1 FROM enrollments WHERE course_id=? AND user_id=?", [jc.course_id, userId]);
    if (!ex) {
      await run("INSERT INTO enrollments (id, course_id, user_id, tenant_id, status, created_at, updated_at) VALUES (?,?,?,?,'ACTIVE',?,?)",
        [crypto.randomUUID(), jc.course_id, userId, jc.tenant_id, now, now]);
    }
  }

  if (jc.scope === "COURSE_TEACHER" && jc.course_id) {
    if (!m) {
      await run("INSERT INTO memberships (id, user_id, tenant_id, role, status, created_at, updated_at) VALUES (?,?,?,?,'ACTIVE',?,?)",
        [crypto.randomUUID(), userId, jc.tenant_id, "TEACHER", now, now]);
    }
    const ex = await first("SELECT 1 FROM course_teachers WHERE course_id=? AND user_id=?", [jc.course_id, userId]);
    if (!ex) {
      await run("INSERT INTO course_teachers (course_id, user_id) VALUES (?,?)", [jc.course_id, userId]);
    }
  }

  await run("UPDATE join_requests SET status='APPROVED', reviewed_by_user_id=?, reviewed_at=? WHERE id=?",
    [auth.user!.id, now, reqId]);
  redirect("/school-join-codes");
}

async function rejectRequestAction(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const reqId = formData.get("request_id") as string;
  const { run } = getDb();
  await run(
    "UPDATE join_requests SET status='REJECTED', reviewed_by_user_id=?, reviewed_at=? WHERE id=? AND tenant_id=? AND status='PENDING'",
    [auth.user!.id, new Date().toISOString(), reqId, active.tenant_id]
  );
  redirect("/school-join-codes");
}

// ============================================================
// Page Component
// ============================================================

export default async function SchoolJoinCodesPage({
  searchParams,
}: {
  searchParams: Promise<{ new_code?: string; error?: string }>;
}) {
  const auth = await requireAuth();
  const active = pickActiveMembership(auth);
  if (!active || active.role !== "SCHOOL_ADMIN") redirect("/");

  const params = await searchParams;
  const newCode = params.new_code;
  const error = params.error;

  const { all } = getDb();
  const tid = active.tenant_id;

  // Fetch data in parallel.
  const [codes, courses, pending, history] = await Promise.all([
    all<{
      id: string; scope: string; role: string; course_title: string | null;
      auto_approve: number; expires_at: string; max_uses: number; uses_approved: number; revoked: number;
    }>(
      `SELECT jc.id, jc.scope, jc.role, c.title AS course_title,
         jc.auto_approve, jc.expires_at, jc.max_uses, jc.uses_approved, jc.revoked
       FROM join_codes jc LEFT JOIN courses c ON c.id=jc.course_id
       WHERE jc.tenant_id=? ORDER BY jc.created_at DESC`, [tid]
    ),
    all<{ id: string; title: string }>(
      "SELECT id, title FROM courses WHERE tenant_id=? AND status='ACTIVE' ORDER BY title ASC", [tid]
    ),
    all<{
      id: string; type: string; requested_role: string; created_at: string;
      user_name: string; user_email: string; course_title: string | null;
    }>(
      `SELECT jr.id, jr.type, jr.requested_role, jr.created_at,
         u.name AS user_name, u.email AS user_email, c.title AS course_title
       FROM join_requests jr JOIN users u ON u.id=jr.user_id LEFT JOIN courses c ON c.id=jr.course_id
       WHERE jr.tenant_id=? AND jr.status='PENDING' ORDER BY jr.created_at DESC`, [tid]
    ),
    all<{
      id: string; user_name: string; user_email: string; requested_role: string;
      course_title: string | null; status: string; reviewed_at: string | null;
    }>(
      `SELECT jr.id, u.name AS user_name, u.email AS user_email, jr.requested_role,
         c.title AS course_title, jr.status, jr.reviewed_at
       FROM join_requests jr JOIN users u ON u.id=jr.user_id LEFT JOIN courses c ON c.id=jr.course_id
       WHERE jr.tenant_id=? AND jr.status IN ('APPROVED','REJECTED')
       ORDER BY jr.reviewed_at DESC LIMIT 50`, [tid]
    ),
  ]);

  const activeCodes = codes.filter((c) => c.revoked !== 1 && !isIsoInPast(c.expires_at));

  return (
    <SchoolLayout auth={auth} active={active} currentPath="/school-join-codes">
      {/* Newly created code banner */}
      {newCode && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-3">
          <h2 className="text-base font-semibold text-green-800">Join code created</h2>
          <p className="text-sm text-green-700 mt-1">Copy and share this code (shown only once):</p>
          <div className="bg-white border border-dashed border-green-300 rounded-lg p-4 mt-2">
            <span className="text-2xl font-black tracking-widest">{newCode}</span>
          </div>
          <p className="text-xs text-green-600 mt-2">Users go to /join, enter the code, then login or create an account.</p>
        </div>
      )}

      {error === "no_course" && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-3">
          Please select a course when creating a course-specific code.
        </div>
      )}
      {error === "code_invalid" && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-3">
          Cannot approve: the join code is no longer valid (expired, revoked, or maxed out).
        </div>
      )}

      {/* Section 1: Active Codes */}
      <Card title="Active Codes">
        <p className="text-xs text-gray-400 mb-3">Codes are stored hashed — the plaintext is only shown at creation time.</p>
        {activeCodes.length === 0 ? (
          <p className="text-sm text-gray-400">No active codes</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Description</th>
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Limits</th>
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Approval</th>
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {activeCodes.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100">
                    <td className="py-3 px-2 font-medium">{describeCode(c.scope, c.role, c.course_title)}</td>
                    <td className="py-3 px-2 text-xs text-gray-500">
                      Expires: {fmtISO(c.expires_at)}<br />Uses: {c.uses_approved}/{c.max_uses}
                    </td>
                    <td className="py-3 px-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                        c.auto_approve === 1 ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
                      }`}>
                        {c.auto_approve === 1 ? "Auto-approve" : "Needs approval"}
                      </span>
                    </td>
                    <td className="py-3 px-2">
                      <form action={revokeCodeAction}>
                        <input type="hidden" name="code_id" value={c.id} />
                        <button type="submit" className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-200">
                          Revoke
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Section 2: Create Code — plain English questions */}
      <Card title="Create Code">
        <form action={createCodeAction}>
          <label className="block text-sm mb-1 font-medium">Who is this code for?</label>
          <select name="who" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3">
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
          </select>

          <label className="block text-sm mb-1 font-medium">What should happen when they join?</label>
          <select name="action" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3">
            <option value="school">Join the school only</option>
            <option value="course">Join the school AND enrol in a specific course</option>
          </select>

          <label className="block text-sm mb-1">Course <span className="text-gray-400">(only needed if enrolling in a course)</span></label>
          <select name="course_id" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3">
            <option value="">— Select course —</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-sm mb-1">Auto-approve</label>
              <select name="auto_approve" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="0">No (admin approval required)</option>
                <option value="1">Yes (instant)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm mb-1">Expiry (days)</label>
              <input name="exp_days" type="number" min="1" defaultValue="14" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>

          <label className="block text-sm mb-1">Max uses</label>
          <input name="max_uses" type="number" min="1" defaultValue="300" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />

          <button type="submit" className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800">
            Create code
          </button>
        </form>
      </Card>

      {/* Section 3: Pending Requests */}
      <Card title={`Pending Requests (${pending.length})`}>
        {pending.length === 0 ? (
          <p className="text-sm text-gray-400">No pending requests</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">User</th>
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Request</th>
                  <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100">
                    <td className="py-3 px-2">
                      <div className="font-semibold">{p.user_name}</div>
                      <div className="text-xs text-gray-400">{p.user_email}</div>
                    </td>
                    <td className="py-3 px-2 text-xs">
                      {p.course_title
                        ? `${roleLabel(p.requested_role)} access to ${p.course_title}`
                        : `${roleLabel(p.requested_role)} access to school`}
                      <br /><span className="text-gray-400">Requested: {fmtISO(p.created_at)}</span>
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex gap-1">
                        <form action={approveRequestAction}>
                          <input type="hidden" name="request_id" value={p.id} />
                          <button type="submit" className="px-3 py-1 bg-teal-700 text-white text-xs font-semibold rounded-lg hover:bg-teal-800">
                            Approve
                          </button>
                        </form>
                        <form action={rejectRequestAction}>
                          <input type="hidden" name="request_id" value={p.id} />
                          <button type="submit" className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-200">
                            Reject
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <>
            <h3 className="text-sm font-semibold mt-4 mb-2">History</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">User</th>
                    <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Request</th>
                    <th className="text-left text-xs text-gray-500 uppercase py-2 px-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-b border-gray-100">
                      <td className="py-2 px-2">
                        <div className="font-semibold">{h.user_name}</div>
                        <div className="text-xs text-gray-400">{h.user_email}</div>
                      </td>
                      <td className="py-2 px-2 text-xs">
                        {h.course_title
                          ? `${roleLabel(h.requested_role)} access to ${h.course_title}`
                          : `${roleLabel(h.requested_role)} access to school`}
                      </td>
                      <td className="py-2 px-2">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                          h.status === "APPROVED" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                        }`}>
                          {h.status}
                        </span>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {fmtISO(h.reviewed_at)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </SchoolLayout>
  );
}
