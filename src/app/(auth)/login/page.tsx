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

import { signIn } from "@/auth";
import { Card } from "@/components/ui/Card";

// Server Action for email + password login.
// signIn("credentials", ...) tells NextAuth to use the Credentials provider,
// which runs our authorize() function in src/auth.ts.
async function loginAction(formData: FormData) {
  "use server";
  await signIn("credentials", {
    email: (formData.get("email") as string || "").toLowerCase().trim(),
    password: formData.get("password") as string || "",
    redirectTo: "/",
  });
}

// Server Action for Google SSO.
async function googleAction() {
  "use server";
  await signIn("google", { redirectTo: "/" });
}

// Server Action for Microsoft SSO.
async function microsoftAction() {
  "use server";
  await signIn("microsoft-entra-id", { redirectTo: "/" });
}

// This is the page component — it renders the login form and SSO buttons.
// The searchParams prop gives us access to ?error=... in the URL.
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

        {/* Show error message if login failed.
            NextAuth uses "CredentialsSignin" as the error code when
            the authorize() function returns null (wrong email/password). */}
        {error === "CredentialsSignin" && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">
            Wrong email or password.
          </div>
        )}
        {error && error !== "CredentialsSignin" && (
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

          <button
            type="submit"
            className="w-full mt-4 py-2 bg-teal-700 text-white font-semibold rounded-lg hover:bg-teal-800 transition-colors"
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
