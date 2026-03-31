# QAcademy — Workspace Restructure Plan

*Agreed: 2026-03-30. This is the architectural direction for the platform
UX. Every significant build decision from this point forward should
reference this plan.*

---

## The core decision

The platform is moving from a collection of separate pages to role-based
workspaces. Each role gets a persistent shell with a left sidebar and a
main content area. The sidebar is designed to accommodate future features
from day one — placeholder slots are included so the navigation structure
never needs to be rebuilt when new features arrive.

---

## What stays as a standalone page — never enters a workspace

These routes must remain independent pages. They are either unauthenticated
flows, pre-workspace states, or immersive experiences that must not have
workspace chrome around them.

| Route | Reason |
|---|---|
| /login | Unauthenticated entry point |
| /join | Pre-workspace onboarding — user may have no school yet |
| /forgot-password | Unauthenticated recovery flow |
| /reset-password | Token-based recovery — no session |
| /setup | One-time bootstrap before any tenant exists |
| / | Root dispatcher — landing page + role router |
| /no-access | Pre-workspace — user has no memberships |
| /choose-school | Pre-workspace — must fire before workspace loads |
| /attempt-start | Pre-exam wizard — must be focused, no distractions |
| /attempt-take | Immersive exam — no workspace chrome |
| /attempt-complete | Post-exam confirmation — pairs with attempt-take |
| /attempt-results | Printable result slip — needs full page + print CSS |
| /attempt-review | Linear question review — full viewport scroll |

Utility/API routes (no UI, keep as route handlers):
- /switch-school, /logout, /health, /exam-create, /exam-results-csv

---

## Interaction hierarchy

Four containers are used across the platform. When building any new
feature, decide which container it belongs in before writing any code.

| Container | When to use |
|---|---|
| Workspace section | Primary navigation destinations — courses, people, sittings, exams |
| Drawer (right slide-in) | Inspecting a record from a list — student profile, teacher profile |
| Modal | Focused task over current context — note: drawer vs modal decided per feature |
| Confirm dialog | Destructive or irreversible actions — already built |

Note: some items in this plan are marked as drawers. Whether each becomes
a drawer or a full-screen modal is decided when that feature is built,
based on how much content it needs to display.

---

## Shared components (Phase 2 — build first)

These are built once and used by all workspaces.

- WorkspaceShell — persistent sidebar + main content area + header
- Sidebar navigation — accepts items as props, includes placeholder slots
- Drawer shell — right-side slide-in panel, one at a time
- Full-screen modal — covers viewport, own scroll, for rich content
- Profile drawer — name, email, memberships, change password

---

## Phase 1 — Pre-work (clean up before building)

- [x] Merge /school-sittings and /sittings into one unified route
      (completed 2026-03-30 — /sittings deleted, /school-sittings is now the single sittings page)
- [x] Decide profile page approach — done 2026-03-30
      (decision made: becomes a drawer accessible from every workspace header)

---

## Phase 2 — Shared workspace shell

Build once, used by all four roles.

- [x] WorkspaceShell component — done 2026-03-30
      Desktop: sidebar always visible. Mobile: sidebar behind hamburger menu.
      Sidebar items passed as props per role.
- [x] Sidebar navigation with future placeholder slots — done 2026-03-30
      Placeholder items are greyed out and labelled "coming soon"
- [x] Drawer shell component — done 2026-03-30
      Right-side slide-in, one at a time, content passed as children
- [x] LargeModal component — done 2026-03-30
      (built as LargeModal — centred large panel, not full screen, workspace visible behind backdrop)
- [x] Profile drawer — done 2026-03-30
      Replaces standalone /profile page for authenticated users

---

## Phase 3 — Teacher workspace

Smallest scope — proves the pattern before applying to larger roles.

Sidebar sections:
- My Exams (current + future)
- Question Bank
- Approvals
- [placeholder] My Courses
- [placeholder] My Students
- [placeholder] Analytics
- [placeholder] Settings

Tasks:
- [x] Teacher workspace using WorkspaceShell — done 2026-03-30
- [x] Exam list in sidebar, exam builder loads in main content area — done 2026-03-30
      (two-pane list: standalone exams left, sitting exams right. URL-driven state.
      returnPath pattern for all server action redirects.)
- [x] /question-bank and /approvals wrapped in teacher workspace shell — done 2026-03-30
      (role-based branching: teacher gets WorkspaceShell with persistent sidebar,
      school admin gets plain layout as before. Shared nav via teacher-nav.ts.)
- [x] Shared teacher sidebar extracted to src/lib/teacher-nav.ts — done 2026-03-30
      (single source of truth for nav items used by /teacher, /question-bank, /approvals)
- [x] Exam preview — converted to inline PreviewTab in exam builder — done 2026-03-31
      (decision changed: inline pane instead of LargeModal. Renders student view of
      questions + read-only approver comments. /exam-preview stays as approver-only page.)
- [x] Exam bank picker — converted to inline BankPickerTab in exam builder — done 2026-03-31
      (decision changed: inline pane instead of LargeModal. Hidden tab=bank pane triggered
      from Questions tab. Teacher stays on picker until clicking back. Filter/search/add
      all work inline via server-side forms.)
- [x] Exam grade — wrapped in WorkspaceShell for teachers — done 2026-03-31
      (decision changed: stays as full page instead of LargeModal — too rich/interactive
      for a modal. Two-column grading layout needs full viewport. Back links and server
      action redirects made role-aware via returnPath pattern.)
- [x] ProfileDrawer wired into teacher sidebar — done 2026-03-31
      (SidebarNav accepts optional profile props. Clicking Profile opens drawer instead
      of navigating. Shared changePasswordAction in src/lib/change-password.ts.
      Switch school link in drawer for multi-school users.)
- [ ] StudentDrawer — profile, courses, classes, attempts
      (deferred to Phase 4 — no consumer in teacher workspace yet)
- [x] Attempt review — not needed — done 2026-03-31
      (covered by /exam-grade?view=1 which already shows student answers in view mode)

Note: Approvals page enhanced with three sections — Pending (action required),
All my approvals (full gate assignment history with status), Recent activity (last 10).
allAssignments query uses LEFT JOIN so gates with no response yet appear as "Awaiting response".

---

## Phase 4 — School Admin workspace

Larger scope. Reuses WorkspaceShell and StudentDrawer from Phase 3.

Sidebar sections:
- Overview
- Courses
- Classes
- People
- Join Codes
- Sittings
- Approvals
- [placeholder] Invitations & Bulk Import
- [placeholder] Reports & Analytics
- [placeholder] School Settings
- [placeholder] Security & Audit Log
- [placeholder] Data Export

Tasks:
- [x] School Admin workspace using WorkspaceShell — done 2026-03-31
      (single /school entry point with sidebar nav. All 10 admin routes consolidated
      into URL-driven sections: /school?section=courses, classes, people, join-codes, sittings.
      ProfileDrawer wired in. admin-nav.ts created with sidebar items + placeholders.)
- [x] List → detail pattern for Courses — done 2026-03-31
      (courses list inline, CourseDetail component with 5 tabs and 8 server actions.
      URL: /school?section=courses&course_id=X&tab=Y)
- [x] List → detail pattern for Classes — done 2026-03-31
      (classes list inline, ClassDetail component with 3 tabs and 6 server actions.
      URL: /school?section=classes&class_id=X&tab=Y)
- [x] People section migrated — done 2026-03-31
      (PeopleSection component with 2 tabs, 5 server actions, dynamic filters.
      URL: /school?section=people&tab=members|add)
- [x] Join Codes section migrated — done 2026-03-31
      (JoinCodesSection component with 4 server actions incl race-condition-safe approve.
      URL: /school?section=join-codes)
- [x] Sittings section migrated (deepest level) — done 2026-03-31
      (SittingDetail component with 3 tabs, 4 server actions.
      GateSettingsPane component with 3 server actions — rendered as sub-pane.
      Exam builder loads inline via ExamBuilderContent with rpBase() URL joining.
      URL: /school?section=sittings&sitting_id=X&tab=Y
      Gate settings: &exam_id=Y. Exam builder: &exam_id=Y&edit=1&tab=Z)
- [x] Exam grade/view returns wired for admin workspace — done 2026-03-31
      (ResultsTable passes return_to param to /exam-grade. exam-grade reads it,
      uses for redirects, wraps in admin WorkspaceShell when return_to starts with /school.)
- [ ] TeacherDrawer — profile, courses, exams
      (deferred — used in People page and Course teachers tab)
- [ ] StudentDrawer — profile, courses, classes, attempts
      (deferred — used in People, Class detail, Course students tab, Sitting results)
- [ ] Cleanup: delete 9 old admin route files + SchoolLayout.tsx
      (all marked DEPRECATED 2026-03-31, safe to remove)

---

## Phase 5 — Student workspace

Simplest workspace.

Sidebar sections:
- My Exams
- My Results
- [placeholder] Certificates
- [placeholder] Course Progress
- [placeholder] Profile / Settings

Tasks:
- [ ] Student workspace using WorkspaceShell
- [ ] Result summary drawer/modal — score, grade, pass/fail
- [ ] Attempt review modal — full questions and answers
      (student-facing version)

---

## Phase 6 — System Admin workspace

Already closest to workspace model — migrate to use WorkspaceShell.

Sidebar sections:
- Overview
- Schools
- Users
- [placeholder] Platform Settings
- [placeholder] Billing
- [placeholder] Audit Log

Tasks:
- [ ] Migrate /sys to use WorkspaceShell
      (replace URL-based module switching with sidebar navigation)

---

## Key principles

1. Build the shell before any workspace content — nothing can proceed
   without Phase 2 complete
2. Teacher workspace first — smallest scope, lowest risk, proves the pattern
3. Shared components are built once — ProfileDrawer and changePasswordAction
   built in Phase 3, reusable by all future workspaces. StudentDrawer deferred
   to Phase 4 where it has real consumers.
4. Sidebar placeholder slots included from day one — future features
   add content, never restructure navigation
5. Drawer vs modal is decided per feature when building — not predetermined
6. Pages that stay as pages are never touched by this restructure

---

*Last updated: 2026-03-31 — Phase 3 complete. Phase 4 complete (admin workspace fully operational). All admin sections consolidated into /school with URL-driven state. Remaining: delete old admin files, TeacherDrawer, StudentDrawer, then Phase 5 (Student) and Phase 6 (System Admin).*
