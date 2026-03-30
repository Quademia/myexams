"use client";

// src/components/layout/SidebarNav.tsx
// Renders inside the WorkspaceShell sidebar slot.
// Handles navigation items, section dividers, placeholder slots,
// and mobile sidebar toggle (hamburger open/close).

import { useState } from "react";

export type NavItem = {
  label: string;
  href: string;
  icon: string;
  soon?: boolean;
  active?: boolean;
  divider?: boolean;
  dividerLabel?: string;
};

interface SidebarNavProps {
  items: NavItem[];
  schoolName?: string;
  roleName?: string;
  currentPath: string;
  switchSchool?: boolean;
}

function NavContent({
  items,
  schoolName,
  roleName,
  currentPath,
  switchSchool,
  onNavigate,
}: SidebarNavProps & { onNavigate?: () => void }) {
  return (
    <>
      {/* Top section — branding */}
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="text-lg font-bold text-teal-700">QAcademy</div>
        {schoolName && (
          <div className="text-sm text-gray-600 mt-0.5">{schoolName}</div>
        )}
        {roleName && (
          <span className="inline-block mt-1 bg-teal-50 text-teal-700 text-xs px-2 py-0.5 rounded-full font-medium">
            {roleName}
          </span>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 flex flex-col gap-1 px-2 py-3 overflow-y-auto">
        {items.map((item, i) => {
          if (item.divider) {
            return (
              <div
                key={`divider-${i}`}
                className="text-xs text-gray-400 uppercase tracking-wide px-3 py-2 mt-2"
              >
                {item.dividerLabel || ""}
              </div>
            );
          }

          const isActive = item.active ?? item.href === currentPath;

          if (item.soon) {
            return (
              <div
                key={item.href}
                className="flex items-center justify-between px-3 py-2 rounded-lg text-sm text-gray-300 cursor-not-allowed"
              >
                <span>
                  <span className="mr-2">{item.icon}</span>
                  {item.label}
                </span>
                <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full font-medium">
                  Soon
                </span>
              </div>
            );
          }

          return (
            <a
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center px-3 py-2 rounded-lg text-sm no-underline ${
                isActive
                  ? "bg-teal-50 text-teal-700 font-semibold"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <span className="mr-2">{item.icon}</span>
              {item.label}
            </a>
          );
        })}
      </nav>

      {/* Bottom section — utility links */}
      <div className="mt-auto border-t border-gray-100 px-3 py-3 flex flex-col gap-1">
        {switchSchool && (
          <a
            href="/choose-school"
            onClick={onNavigate}
            className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1 no-underline"
          >
            Switch school
          </a>
        )}
        <a
          href="/profile"
          onClick={onNavigate}
          className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1 no-underline"
        >
          Profile
        </a>
        <a
          href="/logout"
          onClick={onNavigate}
          className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1 no-underline"
        >
          Logout
        </a>
      </div>
    </>
  );
}

export function SidebarNav(props: SidebarNavProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar content — rendered inside WorkspaceShell's aside */}
      <div className="hidden md:flex flex-col h-full">
        <NavContent {...props} />
      </div>

      {/* Mobile hamburger button — fixed, top-left, only on mobile */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed top-3 left-3 z-30 md:hidden bg-white border border-gray-200 rounded-lg p-2 shadow-sm text-gray-600 hover:text-gray-900"
        aria-label="Open menu"
      >
        <span className="text-lg leading-none">&#9776;</span>
      </button>

      {/* Mobile overlay sidebar */}
      {isOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsOpen(false)}
          />
          {/* Sidebar panel */}
          <div className="absolute left-0 top-0 h-full w-64 bg-white shadow-xl z-50 flex flex-col">
            <NavContent {...props} onNavigate={() => setIsOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
