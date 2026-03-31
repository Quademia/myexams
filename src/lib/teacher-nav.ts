// src/lib/teacher-nav.ts
// Shared teacher sidebar navigation items.
// Used by /teacher, /question-bank, and /approvals when the user is a teacher.

import type { NavItem } from "@/components/layout/SidebarNav";

export function getTeacherNavItems(pendingApprovals: number): NavItem[] {
  return [
    {
      label: "My Exams",
      href: "/teacher",
      icon: "\u{1F4CB}",
    },
    {
      label: "Question Bank",
      href: "/question-bank",
      icon: "\u{1F4DA}",
    },
    {
      label: "Approvals",
      href: "/approvals",
      icon: "\u2705",
      badge: pendingApprovals > 0 ? pendingApprovals : undefined,
    },
    { label: "", href: "", icon: "", divider: true, dividerLabel: "Coming soon" },
    {
      label: "My Students",
      href: "/teacher",
      icon: "\u{1F465}",
      soon: true,
    },
    {
      label: "Analytics",
      href: "/teacher",
      icon: "\u{1F4CA}",
      soon: true,
    },
    {
      label: "Settings",
      href: "/teacher",
      icon: "\u2699\uFE0F",
      soon: true,
    },
  ];
}
