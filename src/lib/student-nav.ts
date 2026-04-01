// src/lib/student-nav.ts
// Shared student sidebar navigation items.
// Used by /student when the user is a student.

import type { NavItem } from "@/components/layout/SidebarNav";

export function getStudentNavItems(): NavItem[] {
  return [
    {
      label: "My Exams",
      href: "/student",
      icon: "\u{1F4DD}",
    },
    { label: "", href: "", icon: "", divider: true, dividerLabel: "Coming soon" },
    {
      label: "My Results",
      href: "/student",
      icon: "\u{1F4CA}",
      soon: true,
    },
    {
      label: "Certificates",
      href: "/student",
      icon: "\u{1F3C6}",
      soon: true,
    },
    {
      label: "Course Progress",
      href: "/student",
      icon: "\u{1F4D6}",
      soon: true,
    },
  ];
}
