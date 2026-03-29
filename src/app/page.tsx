// src/app/page.tsx
// Root page — shows landing page if not logged in, redirects to dashboard if logged in.
//
// IMPORTANT: Do NOT call setActiveTenant() here. It calls unstable_update()
// which makes an internal HTTP subrequest — this crashes on Cloudflare Workers
// when called from a Server Component. Instead we redirect to /switch-school
// which handles setActiveTenant() safely in a Route Handler context.

import { redirect } from "next/navigation";
import { getAuth, pickActiveMembership } from "@/lib/auth";

export default async function Home() {
  const auth = await getAuth();

  // If logged in, redirect to the appropriate dashboard.
  if (auth.user) {
    if (auth.user.is_system_admin === 1) redirect("/sys");
    if (!auth.memberships.length) redirect("/no-access");

    const active = pickActiveMembership(auth);

    if (!active) {
      if (auth.memberships.length === 1) {
        redirect(`/switch-school?tenant_id=${auth.memberships[0].tenant_id}`);
      }
      redirect("/choose-school");
    }

    if (active.role === "SCHOOL_ADMIN") redirect("/school");
    if (active.role === "TEACHER") redirect("/teacher");
    if (active.role === "STUDENT") redirect("/student");
    redirect("/no-access");
  }

  // Not logged in — show landing page.
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-slate-950 text-white overflow-hidden">

      {/* Ambient glow effects */}
      <div className="fixed top-1/4 left-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-[128px] pointer-events-none" />
      <div className="fixed bottom-1/4 right-1/4 w-80 h-80 bg-cyan-500/8 rounded-full blur-[100px] pointer-events-none" />

      {/* ===== Header ===== */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-400 to-cyan-400 flex items-center justify-center text-gray-950 font-black text-sm">
            Q
          </div>
          <span className="text-sm font-semibold tracking-wide text-gray-400">QAcademy</span>
        </div>
        <div className="flex gap-3">
          
            href="/join"
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Join with Code
          </a>
          
            href="/login"
            className="px-4 py-2 text-sm font-semibold text-gray-950 bg-gradient-to-r from-teal-400 to-cyan-400 rounded-lg hover:from-teal-300 hover:to-cyan-300 transition-all shadow-lg shadow-teal-500/20"
          >
            Login
          </a>
        </div>
      </header>

      {/* ===== Hero Section ===== */}
      <main className="relative z-10 max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-block px-3 py-1 rounded-full text-xs font-medium tracking-wide uppercase bg-teal-500/10 text-teal-400 border border-teal-500/20 mb-6">
          Educational Consult
        </div>

        <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-4">
          <span className="bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
            QAcademy
          </span>
        </h1>

        <p className="text-xl md:text-2xl text-gray-400 font-light mb-3">
          The modern exams platform for schools
        </p>

        <p className="text-sm text-gray-500 max-w-lg mx-auto mb-10">
          Create exams. Run formal sittings. Track results. Everything a school needs to manage assessments — simple, secure, and built for real institutions.
        </p>

        <div className="flex justify-center gap-4">
          
            href="/login"
            className="group relative px-8 py-3 text-base font-bold text-gray-950 bg-gradient-to-r from-teal-400 to-cyan-400 rounded-xl hover:from-teal-300 hover:to-cyan-300 transition-all shadow-xl shadow-teal-500/25 hover:shadow-teal-500/40"
          >
            {/* Glow pulse behind button */}
            <span className="absolute inset-0 rounded-xl bg-teal-400/20 blur-xl group-hover:bg-teal-400/30 transition-all" />
            <span className="relative">Get Started</span>
          </a>
          
            href="/join"
            className="px-8 py-3 text-base font-semibold text-gray-300 border border-gray-700 rounded-xl hover:border-gray-500 hover:text-white transition-all"
          >
            Join with Code
          </a>
        </div>
      </main>

      {/* ===== Feature Cards ===== */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

          {/* Card 1 */}
          <div className="group relative bg-gray-900/60 backdrop-blur-sm border border-gray-800 rounded-2xl p-6 hover:border-teal-500/30 transition-all duration-300">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-teal-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-400 text-lg mb-4">
                &#9997;&#65039;
              </div>
              <h3 className="text-base font-bold mb-2">Create Exams</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Build exams with MCQ, essay, true/false, and more. Question bank, approval gates, and full control over settings.
              </p>
            </div>
          </div>

          {/* Card 2 */}
          <div className="group relative bg-gray-900/60 backdrop-blur-sm border border-gray-800 rounded-2xl p-6 hover:border-teal-500/30 transition-all duration-300">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400 text-lg mb-4">
                &#128203;
              </div>
              <h3 className="text-base font-bold mb-2">Run Sittings</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Group papers into formal exam sittings. Assign approvers, manage papers, and track results across the entire event.
              </p>
            </div>
          </div>

          {/* Card 3 */}
          <div className="group relative bg-gray-900/60 backdrop-blur-sm border border-gray-800 rounded-2xl p-6 hover:border-teal-500/30 transition-all duration-300">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-teal-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-400 text-lg mb-4">
                &#128202;
              </div>
              <h3 className="text-base font-bold mb-2">Track Results</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Grades, pass/fail, per-student breakdowns. Release results when ready. Export to CSV. Full control.
              </p>
            </div>
          </div>

        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="relative z-10 border-t border-gray-800/60 py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-600">
          <div>
            <span className="text-gray-400 font-semibold">QAcademy</span>
            <span className="mx-2">·</span>
            Educational Consult
          </div>
          <div className="flex gap-6">
            <a href="/login" className="hover:text-gray-400 transition-colors">Login</a>
            <a href="/join" className="hover:text-gray-400 transition-colors">Join</a>
          </div>
          <div>&copy; {new Date().getFullYear()} QAcademy</div>
        </div>
      </footer>

    </div>
  );
}
