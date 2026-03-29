// src/app/(auth)/forgot-password/page.tsx
// "Forgot your password?" page — lets users request a password reset link via email.
//
// HOW IT WORKS:
// 1. User enters their email and submits the form.
// 2. A Server Action runs on the server:
//    a. Looks up the email in qa_users (our platform user table).
//    b. If not found, logs to password_reset_log with status NO_USER and
//       shows "success" to prevent account enumeration.
//    c. Checks rate limits via password_reset_log — if already sent a reset
//       in the last 10 minutes or 3 in 24 hours, silently shows success.
//    d. Invalidates any previous unused tokens for this email.
//    e. Generates a cryptographically random token (two UUIDs mashed together).
//    f. Stores a SHA-256 hash of the token in the verification_tokens table.
//       (We never store the raw token — if the DB were breached, the attacker
//       couldn't forge reset links.)
//    g. Sends the raw token via email using Resend. The link includes the token
//       and email as query params so the reset-password page can verify.
//    h. Logs to password_reset_log with status EMAIL_SENT.
// 3. The page shows a generic success message.

import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { sha256Hex } from "@/lib/auth";
import { logResetRequest, checkResetRateLimit } from "@/lib/reset-log";
import { getRequestMeta } from "@/lib/auth-events";
import { Card } from "@/components/ui/Card";
import { Resend } from "resend";

// ── Server Action ────────────────────────────────────────────────────
// This function runs on the server when the form is submitted.
// It's defined at the top level (not inside the component) because
// Next.js server actions must NOT be passed as props to client components.

async function forgotPasswordAction(formData: FormData) {
  "use server";

  const email = (formData.get("email") as string || "").toLowerCase().trim();
  if (!email) return { sent: true }; // still show success for empty input

  // Derive request metadata from Cloudflare headers — needed for logging.
  const meta = await getRequestMeta();

  const { first, run } = getDb();
  const { APP_SECRET, RESEND_API_KEY } = getEnv();

  // 1. Look up the user in qa_users (our platform table — NOT the NextAuth users table).
  //    Only active accounts can reset their password.
  const user = await first<{ id: string; email: string }>(
    "SELECT id, email FROM qa_users WHERE email = ? AND status = 'ACTIVE'",
    [email]
  );

  // If no user found, log it and stop — but still show the generic success message.
  if (!user) {
    await logResetRequest({
      identifierRaw: email,
      email: null,
      username: null,
      userId: null,
      tenantId: null,
      actionNote: "No matching user for identifier",
      resetToken: null,
      status: "NO_USER",
      meta,
    });
    return { sent: true };
  }

  // 2. Check rate limits via password_reset_log.
  //    Short window: 1 request in 10 minutes → blocked.
  //    Long window:  3 requests in 24 hours → blocked.
  const rateCheck = await checkResetRateLimit(email);

  if (rateCheck.blocked) {
    if (rateCheck.window === "short") {
      await logResetRequest({
        identifierRaw: email,
        email: user.email,
        username: null,
        userId: user.id,
        tenantId: null,
        actionNote: "Rate limited - 10 minute window",
        resetToken: null,
        status: "RATE_LIMITED",
        meta,
      });
    } else {
      await logResetRequest({
        identifierRaw: email,
        email: user.email,
        username: null,
        userId: user.id,
        tenantId: null,
        actionNote: "Rate limited - 24 hour window (3 emails sent)",
        resetToken: null,
        status: "RATE_LIMITED_24H",
        meta,
      });
    }
    // Show success silently — don't reveal rate limiting to the user.
    return { sent: true };
  }

  const nowUnix = Math.floor(Date.now() / 1000);
  const nowISO = new Date().toISOString();

  // 3. Invalidate all existing unused tokens for this email.
  //    This ensures only the newest reset link works.
  await run(
    `UPDATE verification_tokens
     SET invalidated_at = ?
     WHERE identifier = ?
       AND used_at IS NULL
       AND invalidated_at IS NULL`,
    [nowISO, email]
  );

  // 4. Generate a raw token — two UUIDs concatenated with hyphens removed.
  //    This gives us 64 hex-like characters of randomness.
  const rawToken = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");

  // 5. Hash the raw token with SHA-256 for storage.
  //    The raw token goes in the email link; only the hash goes in the database.
  const tokenHash = await sha256Hex(rawToken);

  // 6. Get the requester's IP address for audit purposes.
  const hdrs = await headers();
  const ip = hdrs.get("cf-connecting-ip") || hdrs.get("x-forwarded-for") || "unknown";

  // 7. Insert the token into verification_tokens.
  //    - identifier: the user's email (NextAuth's standard column)
  //    - token: the SHA-256 hash (not the raw token!)
  //    - expires: Unix timestamp 1 hour from now
  //    - created_at through invalidated_at: our custom audit columns
  await run(
    `INSERT INTO verification_tokens
       (identifier, token, expires, created_at, ip_address, used_at, used_ip_address, invalidated_at)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL)`,
    [email, tokenHash, nowUnix + 3600, nowISO, ip]
  );

  // 8. Build the reset link and send the email via Resend.
  const host = hdrs.get("host") || "localhost";
  const protocol = host.includes("localhost") ? "http" : "https";
  const resetLink = `${protocol}://${host}/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;

  const resend = new Resend(RESEND_API_KEY);
  await resend.emails.send({
    from: "QAcademy <noreply@qacademynurses.com>",
    to: email,
    subject: "Reset your QAcademy password",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #0f766e;">Reset your password</h2>
        <p>We received a request to reset your QAcademy password.</p>
        <p>
          <a href="${resetLink}"
             style="display: inline-block; padding: 10px 24px; background: #0f766e; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">
            Reset Password
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">
          Or copy and paste this link into your browser:<br/>
          <a href="${resetLink}" style="color: #0f766e;">${resetLink}</a>
        </p>
        <p style="color: #666; font-size: 14px;">This link expires in 1 hour and can only be used once.</p>
        <p style="color: #666; font-size: 14px;">If you did not request this, you can ignore this email.</p>
      </div>
    `,
  });

  // 9. Log the successful email send to password_reset_log.
  await logResetRequest({
    identifierRaw: email,
    email: user.email,
    username: null,
    userId: user.id,
    tenantId: null,
    actionNote: "Reset email sent successfully",
    resetToken: rawToken,
    status: "EMAIL_SENT",
    meta,
  });

  return { sent: true };
}

// ── Page Component ───────────────────────────────────────────────────
// This is a server component (the default in Next.js App Router).
// searchParams lets us check if the form was just submitted (?sent=1).

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const params = await searchParams;
  const sent = params.sent === "1";

  return (
    <main className="max-w-md mx-auto p-6 mt-12">
      <Card>
        <h1 className="text-xl font-bold mb-4">Forgot your password?</h1>

        {sent ? (
          // After submission — show the same message regardless of whether the email exists.
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg p-3 mb-4">
            If that email is registered you&apos;ll receive a reset link shortly.
          </div>
        ) : (
          // Before submission — show the email form.
          <>
            <p className="text-sm text-gray-600 mb-4">
              Enter your email address and we&apos;ll send you a link to reset your password.
            </p>
            <form action={handleSubmit}>
              <label className="block text-sm mb-1">Email</label>
              <input
                name="email"
                type="email"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <button
                type="submit"
                className="w-full mt-4 py-2 bg-teal-700 text-white font-semibold rounded-lg hover:bg-teal-800 transition-colors"
              >
                Send reset link
              </button>
            </form>
          </>
        )}

        <p className="text-xs text-gray-400 mt-4">
          <a href="/login" className="text-teal-700 hover:underline">&larr; Back to login</a>
        </p>
      </Card>
    </main>
  );
}

// ── Wrapper Server Action ────────────────────────────────────────────
// This action calls forgotPasswordAction (which does the real work) and
// then redirects to the same page with ?sent=1 so we can show the success
// message. We use redirect() from next/navigation for the redirect.
//
// WHY a wrapper? We always want to show the success message, even if the
// email wasn't found. The forgotPasswordAction returns { sent: true } in
// all cases, and we redirect regardless — so the user always sees the
// same outcome.

async function handleSubmit(formData: FormData) {
  "use server";
  await forgotPasswordAction(formData);
  const { redirect } = await import("next/navigation");
  redirect("/forgot-password?sent=1");
}
