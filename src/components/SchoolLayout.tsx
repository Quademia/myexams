// src/components/SchoolLayout.tsx
// Shared layout for all school admin pages — header + navigation bar.
// Every /school* page wraps its content in this component.
// This replaces schoolHeader() and schoolNav() from the old admin.js.
//
// USAGE:
//   <SchoolLayout auth={auth} active={active} currentPath="/school">
//     {page content here}
//   </SchoolLayout>

import { roleLabel, type AuthResult, type Membership } from "@/lib/auth";

interface SchoolLayoutProps {
  auth: AuthResult;
  active: Membership;
  currentPath: string;
  children: React.ReactNode;
}

const navLinks = [
  { label: "Overview", href: "/school" },
  { label: "Sittings", href: "/school-sittings" },
  { label: "Courses", href: "/school-courses" },
  { label: "Classes", href: "/school-classes" },
  { label: "People", href: "/school-people" },
  { label: "Join Codes", href: "/school-join-codes" },
];

export function SchoolLayout({ auth, active, currentPath, children }: SchoolLayoutProps) {
  return (
    <main className="max-w-5xl mx-auto p-4">
      {/* Header — school name, role, and action links */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-bold">School Admin</h1>
            <div className="flex gap-2 mt-1">
              <span className="inline-block px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-xs font-semibold">
                {active.tenant_name}
              </span>
              <span className="inline-block px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-xs font-semibold">
                {roleLabel(active.role)}
              </span>
            </div>
          </div>
          <div className="flex gap-3 text-sm">
            {auth.memberships.length > 1 && (
              <a href="/choose-school" className="text-teal-700 hover:underline">Switch school</a>
            )}
            <a href="/profile" className="text-teal-700 hover:underline">Profile</a>
            <a href="/logout" className="text-teal-700 hover:underline">Logout</a>
          </div>
        </div>
      </div>

      {/* Navigation bar — the same nav on every school admin page */}
      <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 mb-3 flex flex-wrap gap-1">
        {navLinks.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className={`px-3 py-1.5 rounded-lg text-sm no-underline whitespace-nowrap transition-colors ${
              link.href === currentPath
                ? "bg-gray-100 font-bold text-gray-900"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            {link.label}
          </a>
        ))}
      </div>

      {/* Page content goes here */}
      {children}
    </main>
  );
}
