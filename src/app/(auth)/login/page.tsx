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
// For SSO (Google/Microsoft) we log the initiation with ok=null — the actual
// success/failure will be logged via the NextAuth signIn callback later.

import { signIn } from "@/auth";
import { getDb } from "@/lib/db";
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

  // 2. Look up the user in qa_users so we have user_id for rate limiting.
  //    If the user doesn't exist, we still proceed — signIn will fail with
  //    "CredentialsSignin" and we log it as a failure.
  const { first } = getDb();
  const user = await first<{ id: string }>(
    "SELECT id FROM qa_users WHERE email = ? AND status = 'ACTIVE'",
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
    const errorCode = rateCheck.window === "short" ? "too_many_attempts" : "too_many_attempts_24h";

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

  // 4. Attempt the login via NextAuth.
  //    signIn() throws a NEXT_REDIRECT on success (redirectTo: "/") or on
  //    failure (redirectTo: "/login?error=CredentialsSignin"). We need to
  //    catch the failure case to log it, then re-throw so NextAuth can
  //    complete the redirect.
  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/",
    });

    // If signIn didn't throw, it means success — log it.
    // (In practice, signIn always throws a NEXT_REDIRECT, so this line
    // is only reached if NextAuth changes behavior in a future version.)
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
      failureCountAtTime: null,
      meta,
    });
  } catch (err: unknown) {
    // NextAuth throws a special error with a NEXT_REDIRECT digest on both
    // success and failure redirects. We need to inspect the digest to know
    // which happened.
    const e = err as { digest?: string };

    if (typeof e.digest === "string" && e.digest.includes("NEXT_REDIRECT")) {
      // Check if this redirect is going to an error page (login failure)
      // or to "/" (success). The digest contains the redirect URL.
      if (e.digest.includes("error=")) {
        // Login failed — bad password or unknown user.
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
      } else {
        // Login succeeded — log success.
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
          failureCountAtTime: null,
          meta,
        });
      }

      // Re-throw so Next.js can complete the redirect.
      throw err;
    }

    // Unexpected error — log it and re-throw.
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
// We log the initiation with ok=null — we can't intercept the OAuth callback
// result here. Full SSO result logging will be added to the NextAuth signIn
// callback in src/auth.ts in a future update.
async function googleAction() {
  "use server";

  const meta = await getRequestMeta();
  await logAuthEvent({
    kind: "LOGIN_GOOGLE",
    identifier: "google_sso",
    userId: null,
    ok: null,
    errorCode: null,
    note: "sso_redirect_initiated",
    tenantId: null,
    sessionId: null,
    loginMethodDetail: null,
    failureCountAtTime: null,
    meta,
  });

  await signIn("google", { redirectTo: "/" });
}

// Server Action for Microsoft SSO.
// Same as Google — log initiation with ok=null, then redirect to Microsoft.
async function microsoftAction() {
  "use server";

  const meta = await getRequestMeta();
  await logAuthEvent({
    kind: "LOGIN_MICROSOFT",
    identifier: "microsoft_sso",
    userId: null,
    ok: null,
    errorCode: null,
    note: "sso_redirect_initiated",
    tenantId: null,
    sessionId: null,
    loginMethodDetail: null,
    failureCountAtTime: null,
    meta,
  });

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
        {error && error !== "CredentialsSignin" && error !== "TooManyAttempts" && (
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
