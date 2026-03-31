// src/lib/admin-nav.ts
// Shared school admin sidebar navigation items.
// Used by /school workspace and any admin page wrapped in WorkspaceShell.

import type { NavItem } from "@/components/layout/SidebarNav";

export function getAdminNavItems(pendingApprovals: number, pendingJoinRequests: number): NavItem[] {
  return [
    {
      label: "Overview",
      href: "/school",
      icon: "\u{1F3E0}",
    },
    {
      label: "Courses",
      href: "/school?section=courses",
      icon: "\u{1F4DA}",
    },
    {
      label: "Classes",
      href: "/school?section=classes",
      icon: "\u{1F465}",
    },
    {
      label: "People",
      href: "/school?section=people",
      icon: "\u{1F464}",
    },
    {
      label: "Join Codes",
      href: "/school?section=join-codes",
      icon: "\u{1F511}",
      badge: pendingJoinRequests > 0 ? pendingJoinRequests : undefined,
    },
    {
      label: "Sittings",
      href: "/school?section=sittings",
      icon: "\u{1F4C5}",
    },
    {
      label: "Approvals",
      href: "/approvals",
      icon: "\u2705",
      badge: pendingApprovals > 0 ? pendingApprovals : undefined,
    },
    { label: "", href: "", icon: "", divider: true, dividerLabel: "Coming soon" },
    {
      label: "Invitations & Bulk Import",
      href: "/school",
      icon: "\u{1F4E8}",
      soon: true,
    },
    {
      label: "Reports & Analytics",
      href: "/school",
      icon: "\u{1F4CA}",
      soon: true,
    },
    {
      label: "School Settings",
      href: "/school",
      icon: "\u2699\uFE0F",
      soon: true,
    },
    {
      label: "Security & Audit Log",
      href: "/school",
      icon: "\u{1F512}",
      soon: true,
    },
    {
      label: "Data Export",
      href: "/school",
      icon: "\u{1F4E5}",
      soon: true,
    },
  ];
}
