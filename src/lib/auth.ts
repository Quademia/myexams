// src/lib/auth.ts
// Authentication helper — reads the NextAuth session and looks up the logged-in user.
//
// HOW IT WORKS:
// NextAuth manages sessions via JWT cookies. When we call auth() from src/auth.ts,
// NextAuth decodes the JWT and returns the session object (or null if not logged in).
// We then look up the platform user in qa_users by email and load their memberships.
//
// WHY THIS FILE EXISTS:
// Every page in the app imports getAuth() or requireAuth() from here.
// By keeping the same function names and return types, no other files need changing —
// we just swapped the internals from custom cookies to NextAuth.
//
// USAGE:
//   import { getAuth } from "@/lib/auth";
//   const auth = await getAuth();
//   if (!auth.user) redirect("/login");

import { getDb } from "./db";
import { auth as nextAuth, unstable_update } from "@/auth";

// ---------- Crypto helpers ----------
// These are the same functions from the old auth system.
// Still needed for password hashing (change-password, login, setup, etc.).

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
// They have NOT changed — every file that imports them still works.

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

// Reads the NextAuth JWT session, looks up the platform user in qa_users,
// and loads their school memberships.
// Returns { user: null, session: null, memberships: [] } if not logged in.
export async function getAuth(): Promise<AuthResult> {
  const empty: AuthResult = { user: null, session: null, memberships: [] };

  // auth() is NextAuth's server-side session reader.
  // It decodes the JWT cookie and returns the session, or null.
  const nextSession = await nextAuth();
  if (!nextSession?.user?.email) return empty;

  const { first, all } = getDb();

  // Look up the platform user by email (the bridge between NextAuth and qa_users).
  const user = await first<User>(
    "SELECT id, email, name, is_system_admin FROM qa_users WHERE email = ? AND status = 'ACTIVE'",
    [nextSession.user.email]
  );
  if (!user) return empty;

  // Load all their active school memberships.
  // m.user_id references qa_users.id (NOT NextAuth's user id).
  const memberships = await all<Membership>(
    `SELECT m.tenant_id, m.role, t.name AS tenant_name
     FROM memberships m
     JOIN tenants t ON t.id = m.tenant_id
     WHERE m.user_id = ? AND m.status = 'ACTIVE' AND t.status = 'ACTIVE'
     ORDER BY t.name ASC`,
    [user.id]
  );

  // Build a session object that matches the old shape.
  // Other files reference session.user_id, session.active_tenant_id, etc.
  // - token_hash: no longer used (empty string for backward compat)
  // - user_id: the qa_users.id
  // - active_tenant_id: stored as a custom field in the JWT
  // - expires_at: from the NextAuth session expiry
  const session = {
    token_hash: "",
    user_id: user.id,
    active_tenant_id: (nextSession as Record<string, unknown>).active_tenant_id as string | null ?? null,
    expires_at: nextSession.expires ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };

  return { user, session, memberships };
}

// Returns the active membership (the school the user is currently viewing).
// Reads active_tenant_id from the session and finds the matching membership.
export function pickActiveMembership(auth: AuthResult): Membership | null {
  const tid = auth.session?.active_tenant_id;
  if (!tid) return null;
  return auth.memberships.find((m) => m.tenant_id === tid) || null;
}

// Sets the active school for the current session.
// Uses NextAuth's unstable_update to store active_tenant_id in the JWT.
// Called when a user picks or switches schools.
export async function setActiveTenant(tenantId: string) {
  await unstable_update({ active_tenant_id: tenantId });
}

// Clears the NextAuth session. Used by /logout.
export async function destroySession() {
  const { signOut } = await import("@/auth");
  await signOut({ redirect: false });
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

// sha256Hex is still needed by joinCodeHash below.
async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return toHex(digest);
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
  // Fallback: use human-readable labels instead of raw DB values.
  const scopeLabel = scope === "COURSE_ENROLL" ? "Course enrol"
    : scope === "COURSE_TEACHER" ? "Course teacher"
    : scope === "TENANT_ROLE" ? "School role"
    : scope;
  return `${scopeLabel} (${roleLabel(role)})`;
}

// Formats an ISO date string for display (includes time, matching old code).
export function fmtISO(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
