// src/lib/sys-nav.ts
// Shared system admin sidebar navigation items.
// Used by /sys workspace.

import type { NavItem } from "@/components/layout/SidebarNav";

export function getSysNavItems(): NavItem[] {
  return [
    {
      label: "Overview",
      href: "/sys",
      icon: "\u{1F3E0}",
    },
    {
      label: "Schools",
      href: "/sys?section=schools",
      icon: "\u{1F3EB}",
    },
    {
      label: "Users",
      href: "/sys?section=users",
      icon: "\u{1F465}",
    },
    { label: "", href: "", icon: "", divider: true, dividerLabel: "Coming soon" },
    {
      label: "Payments",
      href: "/sys",
      icon: "\u{1F4B3}",
      soon: true,
    },
    {
      label: "Sessions Audit",
      href: "/sys",
      icon: "\u{1F4CB}",
      soon: true,
    },
    {
      label: "Auth Audit",
      href: "/sys",
      icon: "\u{1F512}",
      soon: true,
    },
    {
      label: "Question Bank",
      href: "/sys",
      icon: "\u{1F4DA}",
      soon: true,
    },
    {
      label: "Settings",
      href: "/sys",
      icon: "\u2699\uFE0F",
      soon: true,
    },
  ];
}
