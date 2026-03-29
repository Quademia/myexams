// src/app/(auth)/login/page.tsx
// The login page — renders the email/password form and SSO buttons.
//
// HOW IT WORKS WITH NEXTAUTH:
// Instead of a custom Server Action that manually hashes passwords, creates
// session rows, and sets cookies, we now call NextAuth's signIn() function.
// NextAuth handles all of that internally:
// - For credentials: calls the authorize() function in src/auth.ts
// - For Google/Microsoft: redirects to the OAuth provider's login page
// - On success: creates a JWT cookie and redirects to "/"
// - On failure: redirects back here with ?error=CredentialsSignin
//
// AUTH EVENT LOGGING & RATE LIMITING:
// Before every credentials login attempt we:
//   1. Derive ip_hash, ua_hash, country, ua_parsed from Cloudflare headers.
//   2. Look up the user in qa_users to get user_id (for rate limit check).
//   3. Check rate limits (5 failures in 10 min or 10 in 24 hr → blocked).
//   4. Log the attempt to auth_events (fire-and-forget).
// For SSO (Google/Microsoft) logging happens in the NextAuth signIn callback
// in src/auth.ts after the OAuth round-trip completes.

import { signIn } from "@/auth";
import { getDb } from "@/lib/db";
import { pbkdf2Hex } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { logAuthEvent, checkLoginRateLimit, getRequestMeta } from "@/lib/auth-events";
import { Card } from "@/components/ui/Card";

// Server Action for email + password login.
// signIn("credentials", ...) tells NextAuth to use the Credentials provider,
// which runs our authorize() function in src/auth.ts.
async function loginAction(formData: FormData) {
  "use server";

  const email = (formData.get("email") as string || "").toLowerCase().trim();
  const password = formData.get("password") as string || "";

  // 1. Derive request metadata from Cloudflare headers.
  const meta = await getRequestMeta();

  // 2. Look up the user in qa_users — we need id for rate limiting and the
  //    password fields so we can verify the password before calling signIn().
  const { first } = getDb();
  const user = await first<{
    id: string;
    password_hash: string | null;
    password_salt: string | null;
    password_iter: number | null;
  }>(
    "SELECT id, password_hash, password_salt, password_iter FROM qa_users WHERE email = ? AND status = 'ACTIVE'",
    [email]
  );
  const userId = user?.id ?? null;

  // 3. Check rate limits — short window (10 min, 5 failures) and long (24 hr, 10 failures).
  const rateCheck = await checkLoginRateLimit(email, userId, meta.ipHash);

  if (rateCheck.blocked) {
    // Log the blocked attempt.
    const window = rateCheck.window === "short" ? "10m" : "24h";
    const c = rateCheck.counts!;
    const note = `blocked(${window}): short_user=${c.user}, short_identifier=${c.identifier}, short_ip=${c.ip}`;
    const errorCode = rateCheck.window === "short" ? "too_many_attempts_10m" : "too_many_attempts_24h";

    await logAuthEvent({
      kind: "LOGIN_EMAIL",
      identifier: email,
      userId,
      ok: false,
      errorCode,
      note,
      tenantId: null,
      sessionId: null,
      loginMethodDetail: null,
      failureCountAtTime: null,
      meta,
    });

    // Redirect back to login with rate limit error.
    const { redirect } = await import("next/navigation");
    redirect("/login?error=TooManyAttempts");
  }

  // 4. Verify the password ourselves before calling signIn().
  //    This avoids having to interpret signIn()'s thrown errors (which differ
  //    across runtimes). We log success/failure here, then either redirect on
  //    failure or proceed to signIn() for the session cookie on success.
  const { APP_SECRET } = getEnv();
  let passwordValid = false;

  if (user && user.password_hash && user.password_salt && user.password_iter) {
    const derived = await pbkdf2Hex(
      password + "|" + APP_SECRET,
      user.password_salt,
      user.password_iter
    );
    passwordValid = derived === user.password_hash;
  }

  if (!passwordValid) {
    // User doesn't exist, has no password, or password didn't match.
    await logAuthEvent({
      kind: "LOGIN_EMAIL",
      identifier: email,
      userId,
      ok: false,
      errorCode: "invalid_login",
      note: "bad_password",
      tenantId: null,
      sessionId: null,
      loginMethodDetail: null,
      failureCountAtTime: null,
      meta,
    });
    const { redirect } = await import("next/navigation");
    redirect("/login?error=CredentialsSignin");
  }

  // Password is correct — log success before calling signIn().
  await logAuthEvent({
    kind: "LOGIN_EMAIL",
    identifier: email,
    userId,
    ok: true,
    errorCode: null,
    note: null,
    tenantId: null,
    sessionId: null,
    loginMethodDetail: "returning",
    failureCountAtTime: 0,
    meta,
  });

  // 5. Call signIn() to create the session cookie and redirect to "/".
  //    Since we've already verified the password, this should always succeed.
  //    The catch block only handles genuinely unexpected errors.
  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/",
    });
  } catch (err: unknown) {
    // signIn() throws a redirect internally — let those through.
    const e = err as { digest?: string };
    if (typeof e.digest === "string" && e.digest.includes("NEXT_REDIRECT")) {
      throw err;
    }

    // Genuinely unexpected error — log and re-throw.
    await logAuthEvent({
      kind: "LOGIN_EMAIL",
      identifier: email,
      userId,
      ok: false,
      errorCode: "unexpected_error",
      note: null,
      tenantId: null,
      sessionId: null,
      loginMethodDetail: null,
      failureCountAtTime: null,
      meta,
    });
    throw err;
  }
}

// Server Action for Google SSO.
// Logging happens in the signIn callback in src/auth.ts after the OAuth
// round-trip completes — not here, because the redirect kills this context.
async function googleAction() {
  "use server";
  await signIn("google", { redirectTo: "/" });
}

// Server Action for Microsoft SSO.
// Same as Google — logging happens in the signIn callback in src/auth.ts.
async function microsoftAction() {
  "use server";
  await signIn("microsoft-entra-id", { redirectTo: "/" });
}

// This is the page component — it renders the login form and SSO buttons.
// The searchParams prop gives us access to ?error=... in the URL.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;
  const error = params.error;
  const message = params.message;

  return (
    <main className="max-w-md mx-auto p-6 mt-12">
      <Card>
        <h1 className="text-xl font-bold mb-4">Login</h1>

        {/* Show success banner after a password reset. */}
        {message === "password-reset" && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg p-3 mb-4">
            Your password has been reset. Please log in.
          </div>
        )}

        {/* Show rate limit error — too many failed attempts. */}
        {error === "TooManyAttempts" && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">
            Too many failed attempts. Please wait before trying again or{" "}
            <a href="/forgot-password" className="underline">reset your password</a>.
          </div>
        )}

        {/* Show error message if login failed.
            NextAuth uses "CredentialsSignin" as the error code when
            the authorize() function returns null (wrong email/password). */}
        {error === "CredentialsSignin" && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">
            Wrong email or password.
          </div>
        )}
        {error === "NoAccount" && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">
            This email is not registered on QAcademy. Please contact your administrator.
          </div>
        )}
        {error === "MaxSessionsReached" && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg p-3 mb-4">
            You already have 2 active sessions. If you recently used another device,
            please wait a few minutes and try again, or log out from your other devices first.
          </div>
        )}
        {error && error !== "CredentialsSignin" && error !== "TooManyAttempts" && error !== "NoAccount" && error !== "MaxSessionsReached" && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">
            Something went wrong. Please try again.
          </div>
        )}

        {/* Email + password form.
            The action={loginAction} tells Next.js to run our Server Action
            when the form is submitted. NextAuth handles the rest. */}
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

          <div className="text-right mt-1">
            <a href="/forgot-password" className="text-xs text-teal-700 hover:underline">
              Forgot your password?
            </a>
          </div>

          <button
            type="submit"
            className="w-full mt-3 py-2 bg-teal-700 text-white font-semibold rounded-lg hover:bg-teal-800 transition-colors"
          >
            Login
          </button>
        </form>

        {/* Divider between email/password and SSO buttons */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 border-t border-gray-200" />
          <span className="text-xs text-gray-400 uppercase">or</span>
          <div className="flex-1 border-t border-gray-200" />
        </div>

        {/* SSO buttons — each is a tiny form that calls its own Server Action.
            We use forms (not buttons with onClick) because Server Actions
            need a <form> to trigger on the server side. */}
        <div className="space-y-3">
          <form action={googleAction}>
            <button
              type="submit"
              className="w-full py-2 border border-gray-300 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors"
            >
              Sign in with Google
            </button>
          </form>

          <form action={microsoftAction}>
            <button
              type="submit"
              className="w-full py-2 border border-gray-300 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors"
            >
              Sign in with Microsoft
            </button>
          </form>
        </div>

        <p className="text-xs text-gray-400 mt-4">
          Have a join code? Go to <a href="/join" className="text-teal-700 hover:underline">/join</a>.
        </p>
        <p className="text-xs text-gray-400 mt-1">
          <a href="/" className="text-teal-700 hover:underline">&larr; Back to home</a>
        </p>
        <p className="text-xs text-gray-400 mt-1">
          First time? Go to <a href="/setup" className="text-teal-700 hover:underline">/setup</a>.
        </p>
      </Card>
    </main>
  );
}
