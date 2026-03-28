// src/app/(auth)/reset-password/page.tsx
// Password reset page — the user lands here from the email link.
//
// HOW IT WORKS:
// 1. The URL contains ?token=...&email=... (from the forgot-password email).
// 2. The page shows a form with "new password" and "confirm password" fields.
//    The token and email are passed as hidden fields so they're submitted with
//    the form (without being passed as props to a client component).
// 3. On submit, the Server Action:
//    a. Validates passwords match and are at least 6 characters.
//    b. Hashes the raw token with SHA-256 to look it up in verification_tokens.
//    c. Checks the token exists, hasn't been used, hasn't been invalidated,
//       and hasn't expired.
//    d. Hashes the new password with PBKDF2 + APP_SECRET pepper — the same
//       algorithm used by login and setup, so the user can log in afterwards.
//    e. Updates qa_users with the new password hash, salt, and iteration count.
//    f. Marks the token as used (sets used_at and used_ip_address).
//    g. Redirects to /login?message=password-reset so the user sees a success banner.

import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { sha256Hex, pbkdf2Hex, randomSaltHex } from "@/lib/auth";
import { Card } from "@/components/ui/Card";

// ── Server Action ────────────────────────────────────────────────────
// Validates the token, hashes the new password, updates the database.

async function resetPasswordAction(formData: FormData) {
  "use server";

  const token = formData.get("token") as string || "";
  const email = (formData.get("email") as string || "").toLowerCase().trim();
  const password = formData.get("password") as string || "";
  const confirm = formData.get("confirm") as string || "";

  // ── Validate input ──
  if (!token || !email) {
    return { error: "This reset link is invalid." };
  }
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }
  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }

  const { first, run } = getDb();
  const { APP_SECRET } = getEnv();

  // ── Look up the token ──
  // We hash the raw token from the URL with SHA-256 to get the stored value.
  // This is the same hash that was stored when the token was created.
  const tokenHash = await sha256Hex(token);

  const row = await first<{
    identifier: string;
    token: string;
    expires: number;
    used_at: string | null;
    invalidated_at: string | null;
  }>(
    `SELECT identifier, token, expires, used_at, invalidated_at
     FROM verification_tokens
     WHERE identifier = ? AND token = ?`,
    [email, tokenHash]
  );

  // ── Check token validity ──
  // Each check returns a specific error message so the user knows what happened.
  if (!row) {
    return { error: "This reset link is invalid." };
  }
  if (row.used_at !== null) {
    return { error: "This reset link has already been used." };
  }
  if (row.invalidated_at !== null) {
    return { error: "This reset link is no longer valid. Please request a new one." };
  }
  if (row.expires < Math.floor(Date.now() / 1000)) {
    return { error: "This reset link has expired. Please request a new one." };
  }

  // ── Hash the new password ──
  // Uses the exact same pattern as login and setup:
  //   1. Generate a random 16-byte salt (as hex).
  //   2. Hash: PBKDF2-SHA256(password + "|" + APP_SECRET, salt, 40000 iterations).
  // The APP_SECRET acts as a "pepper" — even if the DB is stolen, the attacker
  // can't crack passwords without also knowing the pepper.
  const salt = randomSaltHex();
  const hash = await pbkdf2Hex(password + "|" + APP_SECRET, salt, 40000);
  const nowISO = new Date().toISOString();

  // ── Update qa_users ──
  // Set the new password hash, salt, iterations, and updated_at timestamp.
  await run(
    `UPDATE qa_users
     SET password_hash = ?, password_salt = ?, password_iter = ?, updated_at = ?
     WHERE email = ? AND status = 'ACTIVE'`,
    [hash, salt, 40000, nowISO, email]
  );

  // ── Mark token as used ──
  // Record when and from what IP the token was consumed — for audit trail.
  const hdrs = await headers();
  const ip = hdrs.get("cf-connecting-ip") || hdrs.get("x-forwarded-for") || "unknown";

  await run(
    `UPDATE verification_tokens
     SET used_at = ?, used_ip_address = ?
     WHERE identifier = ? AND token = ?`,
    [nowISO, ip, email, tokenHash]
  );

  // ── Update password_reset_log ──
  // Append " | password_changed" to the action_note on the matching row
  // so we can see in the audit log that the reset was completed.
  try {
    await run(
      `UPDATE password_reset_log
       SET action_note = action_note || ' | password_changed'
       WHERE reset_token = ? AND status = 'EMAIL_SENT'`,
      [token]
    );
  } catch {
    // Fire-and-forget — never break the reset flow for logging.
  }

  // ── Redirect to login ──
  const { redirect } = await import("next/navigation");
  redirect("/login?message=password-reset");
}

// ── Page Component ───────────────────────────────────────────────────
// Reads token and email from the URL query params and renders the form.
// If the form was submitted with errors, it re-renders with the error.

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; email?: string; error?: string }>;
}) {
  const params = await searchParams;
  const token = params.token || "";
  const email = params.email || "";

  // If there's no token or email in the URL, the link is broken.
  if (!token || !email) {
    return (
      <main className="max-w-md mx-auto p-6 mt-12">
        <Card>
          <h1 className="text-xl font-bold mb-4">Invalid reset link</h1>
          <p className="text-sm text-gray-600 mb-4">
            This password reset link is invalid or incomplete.
          </p>
          <p className="text-xs text-gray-400 mt-4">
            <a href="/forgot-password" className="text-teal-700 hover:underline">
              Request a new reset link
            </a>
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main className="max-w-md mx-auto p-6 mt-12">
      <Card>
        <h1 className="text-xl font-bold mb-4">Reset your password</h1>

        {/* Show error if the Server Action returned one (passed via URL param). */}
        {params.error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">
            {params.error}
          </div>
        )}

        <form action={handleSubmit}>
          {/* Hidden fields pass token and email to the Server Action.
              We use hidden inputs (not props) because Server Actions
              must NOT be passed as props to client components. */}
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="email" value={email} />

          <label className="block text-sm mb-1 mt-3">New password</label>
          <input
            name="password"
            type="password"
            required
            minLength={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />

          <label className="block text-sm mb-1 mt-3">Confirm password</label>
          <input
            name="confirm"
            type="password"
            required
            minLength={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />

          <button
            type="submit"
            className="w-full mt-4 py-2 bg-teal-700 text-white font-semibold rounded-lg hover:bg-teal-800 transition-colors"
          >
            Reset password
          </button>
        </form>

        <p className="text-xs text-gray-400 mt-4">
          <a href="/login" className="text-teal-700 hover:underline">&larr; Back to login</a>
        </p>
      </Card>
    </main>
  );
}

// ── Wrapper Server Action ────────────────────────────────────────────
// Calls resetPasswordAction and handles errors by redirecting back to the
// same page with the error in the URL. If successful, resetPasswordAction
// redirects to /login?message=password-reset internally.
//
// WHY a wrapper? The Server Action can return { error: "..." } for
// validation/token issues. We need to show that error on the page, so
// we redirect back with the token, email, and error in the URL.

async function handleSubmit(formData: FormData) {
  "use server";
  const result = await resetPasswordAction(formData);
  if (result?.error) {
    const token = formData.get("token") as string || "";
    const email = formData.get("email") as string || "";
    const { redirect } = await import("next/navigation");
    redirect(
      `/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}&error=${encodeURIComponent(result.error)}`
    );
  }
  // If no error, resetPasswordAction already redirected to /login
}
