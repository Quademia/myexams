# School Admin — Migration Gaps

*Tracks gaps between the old `functions/admin.js` and the new `src/app/school-*/page.tsx` files.*

*Original audit found 16 gaps on 2026-03-24. 15 were fixed same day. This file now only tracks the remaining item.*

---

## Remaining

- [ ] **#12 — Missing confirm dialogs on destructive actions** — Deferred to Phase 2
  - Files: `school-course`, `school-class`, `school-people`, `school-join-codes`
  - Problem: Old code has browser `confirm()` dialogs on: unassign teacher, unenrol student, remove class from course, remove member, archive class, remove student from class, unlink course from class, revoke code, approve/reject request. New code has zero.
  - Why deferred: React Server Components don't support inline `onSubmit` with `confirm()`. This needs a client-side `ConfirmButton` component, which is a Phase 2 feature (design system — Modal component). The destructive actions still work correctly — the confirm dialog is a UX safeguard, not a business logic requirement.

---

## Completed (15/16) — 2026-03-24

All fixed items have been removed from this file for clarity. See git history for the full original list. Summary of what was fixed:

- **9 HIGH** — teacher demotion protection, unreserve-on-failure, reserve success check, membership validation (×4), course validation in code creation, status validation in course update
- **2 MEDIUM** — pending approvals banner on dashboard, system admin redirect on all school pages
- **4 LOW** — created_at in course_teachers, year_group display in classes tab, archive redirect to list, full role hierarchy in approve logic

---

*Last updated: 2026-03-24*
