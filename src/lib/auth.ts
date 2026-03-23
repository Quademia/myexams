// src/lib/auth.ts
// Authentication helper — reads the session cookie and looks up the logged-in user.
//
// HOW IT WORKS:
// In the old stack, shared.js read cookies from the raw Request object.
// In Next.js, we use the built-in cookies() function which does the same thing
// but in a Next.js-friendly way.
//
// The session flow is unchanged:
// 1. Read the "qa_sess" cookie (a random token set at login)
// 2. Hash it with SHA-256
// 3. Look up that hash in the sessions table
// 4. If found and not expired, load the user + their memberships
//
// USAGE:
//   import { getAuth } from "@/lib/auth";
//   const auth = await getAuth();
//   if (!auth.user) redirect("/login");

import { cookies } from "next/headers";
import { getDb } from "./db";

// ---------- Crypto helpers ----------
// These are the same functions from shared.js, just in TypeScript.

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return toHex(digest);
}

export async function pbkdf2Hex(
  password: string,
  saltHex: string,
  iterations: number
): Promise<string> {
  const salt = Uint8Array.from(
    saltHex.match(/../g)!.map((x) => parseInt(x, 16))
  );
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return toHex(bits);
}

export function randomSaltHex(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return toHex(a.buffer);
}

// ---------- Types ----------
// These describe the shape of data we get back from the database.

export interface User {
  id: string;
  email: string;
  name: string;
  is_system_admin: number;
}

export interface Membership {
  tenant_id: string;
  role: string;
  tenant_name: string;
}

export interface AuthResult {
  user: User | null;
  session: { token_hash: string; user_id: string; active_tenant_id: string | null; expires_at: string } | null;
  memberships: Membership[];
}

// ---------- Main auth function ----------

// Reads the session cookie, validates it, and returns the user + memberships.
// Returns { user: null, session: null, memberships: [] } if not logged in.
export async function getAuth(): Promise<AuthResult> {
  const empty: AuthResult = { user: null, session: null, memberships: [] };

  // cookies() is a Next.js function that reads the request cookies.
  // It replaces the manual cookie parsing we did in shared.js.
  const cookieStore = await cookies();
  const token = cookieStore.get("qa_sess")?.value;
  if (!token) return empty;

  const { first, all, run } = getDb();

  // Hash the token and look it up in the sessions table.
  const tokenHash = await sha256Hex(token);
  const session = await first<{
    token_hash: string;
    user_id: string;
    active_tenant_id: string | null;
    expires_at: string;
  }>(
    "SELECT token_hash, user_id, active_tenant_id, expires_at FROM sessions WHERE token_hash=?",
    [tokenHash]
  );
  if (!session) return empty;

  // Check if the session has expired.
  if (Date.parse(session.expires_at) < Date.now()) {
    await run("DELETE FROM sessions WHERE token_hash=?", [tokenHash]);
    return empty;
  }

  // Load the user.
  const user = await first<User>(
    "SELECT id, email, name, is_system_admin FROM users WHERE id=? AND status='ACTIVE'",
    [session.user_id]
  );
  if (!user) return empty;

  // Load all their school memberships.
  const memberships = await all<Membership>(
    `SELECT m.tenant_id, m.role, t.name AS tenant_name
     FROM memberships m
     JOIN tenants t ON t.id = m.tenant_id
     WHERE m.user_id=? AND m.status='ACTIVE' AND t.status='ACTIVE'
     ORDER BY t.name ASC`,
    [user.id]
  );

  return { user, session, memberships };
}

// Returns the active membership (the school the user is currently viewing).
export function pickActiveMembership(auth: AuthResult): Membership | null {
  const tid = auth.session?.active_tenant_id;
  if (!tid) return null;
  return auth.memberships.find((m) => m.tenant_id === tid) || null;
}

// Sets the active school for the current session.
// Called when a user picks or switches schools.
export async function setActiveTenant(tenantId: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get("qa_sess")?.value;
  if (!token) return;
  const tokenHash = await sha256Hex(token);
  const { run } = getDb();
  await run("UPDATE sessions SET active_tenant_id=? WHERE token_hash=?", [tenantId, tokenHash]);
}

// Deletes the session and clears the cookie. Used by /logout.
export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("qa_sess")?.value;
  if (token) {
    const tokenHash = await sha256Hex(token);
    const { run } = getDb();
    await run("DELETE FROM sessions WHERE token_hash=?", [tokenHash]);
  }
  cookieStore.delete("qa_sess");
}

// Helper to format role names for display.
export function roleLabel(role: string): string {
  if (role === "SCHOOL_ADMIN") return "School Admin";
  if (role === "TEACHER") return "Teacher";
  if (role === "STUDENT") return "Student";
  return role;
}

// Checks auth and redirects to /login if not logged in.
// Use this at the top of any protected page.
export async function requireAuth() {
  const auth = await getAuth();
  if (!auth.user) {
    const { redirect } = await import("next/navigation");
    redirect("/login");
  }
  return auth;
}

// ---------- Join Code helpers ----------

const CODE_ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// Generates a random join code like "ABCD-EF23".
export function makeJoinCodePlain(): string {
  const rnd = (n: number) => {
    let s = "";
    const a = new Uint8Array(n);
    crypto.getRandomValues(a);
    for (let i = 0; i < n; i++) s += CODE_ALPH[a[i] % CODE_ALPH.length];
    return s;
  };
  return `${rnd(4)}-${rnd(4)}`;
}

// Hashes a join code with the pepper for storage.
export async function joinCodeHash(codePlain: string, pepper: string): Promise<string> {
  return await sha256Hex(`${codePlain}|${pepper}|JOINCODE`);
}

// Returns true if an ISO date string is in the past.
export function isIsoInPast(iso: string | null): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return t < Date.now();
}

// Human-readable description of what a join code does.
export function describeCode(scope: string, role: string, courseTitle?: string | null): string {
  if (scope === "TENANT_ROLE" && role === "STUDENT") return "Students → join school";
  if (scope === "TENANT_ROLE" && role === "TEACHER") return "Teachers → join school";
  if (scope === "COURSE_ENROLL" && courseTitle) return `Students → enrol in ${courseTitle}`;
  if (scope === "COURSE_TEACHER" && courseTitle) return `Teachers → assign to ${courseTitle}`;
  return `${scope} (${role})`;
}

// Formats an ISO date string for display.
export function fmtISO(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    });
  } catch {
    return iso;
  }
}
