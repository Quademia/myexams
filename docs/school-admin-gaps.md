# Migration Gaps Tracker

*Tracks all gaps between the old build (`functions/`) and the new build (`src/app/`). Work through these systematically before Phase 2.*

---

## School Admin Gaps — Remaining

- [ ] **#SA-12 — Missing confirm dialogs on destructive actions** — Deferred to Phase 2
  - Files: `school-course`, `school-class`, `school-people`, `school-join-codes`
  - Problem: Old code has browser `confirm()` dialogs on destructive actions. New code has zero.
  - Why deferred: Needs client-side `ConfirmButton` component (Phase 2 design system).

---

## School Admin Gaps — Completed (15/16) — 2026-03-24

See git history for full list. Summary: 9 HIGH (security/validation), 2 MEDIUM (UI features), 4 LOW (cosmetic).

---

## Sittings & Approvals Gaps — Identified 2026-03-24

*Compared old `functions/sittings.js` + `functions/approvals.js` + `functions/admin.js` against new `src/app/sitting-*` + `src/app/approvals/` + `src/app/school-sittings/`.*

### BUGS FOUND (broken right now)

- [x] **#ST-1 — Creating papers for sittings does not work** — Fixed 2026-03-24
  - File: `src/app/sitting-builder/page.tsx` → `createPaperAction`
  - Root cause: INSERT used non-existent column `time_limit_minutes` instead of `duration_mins`. Simplified INSERT to match old code pattern.

- [x] **#ST-2 — Duplicate teacher name in assign-teacher dropdown** — Fixed 2026-03-24
  - File: `src/app/sitting-builder/page.tsx` → Papers tab teacher query
  - Root cause: Query joined `course_teachers` giving one row per course per teacher. Changed to query unique teachers from `memberships` directly.

### HIGH PRIORITY — Missing Features / Security

- [x] **#ST-3 — Per-question approval comments system missing** — Fixed 2026-03-24
  - File: `src/app/exam-preview/page.tsx`
  - Fix: Exam preview now has "approver mode" — when user has PENDING response, shows per-question comment textareas, other approvers' comments, and approve/reject form. Comments saved to `sitting_approval_comments` table.

- [x] **#ST-4 — Question preview in approvals flow missing** — Fixed 2026-03-24
  - Files: `src/app/approvals/page.tsx`, `src/app/exam-preview/page.tsx`
  - Fix: "View exam →" link added to pending items. Links to `/exam-preview` (QUESTIONS/RESULTS) or `/exam-grade` (GRADING). Exam preview access expanded to include assigned approvers. Full questions displayed with comments overlay.

- [x] **#ST-5 — Gate disable/turn-off feature missing** — Fixed 2026-03-24
  - File: `src/app/sitting-gate-settings/page.tsx`
  - Fix: "Disable Gate" button added next to Active badge. Bulk-deletes all approvers + pending responses for the gate in one click.

- [x] **#ST-6 — Course_teachers not assigned on paper creation** — Fixed 2026-03-24
  - File: `src/app/sitting-builder/page.tsx` → `createPaperAction`
  - Fix: Now auto-assigns teacher to `course_teachers` if not already there, matching old code.

### MEDIUM PRIORITY — Missing Validation / UX

- [x] **#ST-7 — Exam grade link missing in approvals for GRADING gate** — Fixed 2026-03-24
  - File: `src/app/approvals/page.tsx`
  - Fix: "View exam →" link added. GRADING items link to `/exam-grade?attempt_id=...&view=1`, others to `/exam-preview`.

- [x] **#ST-8 — Course ACTIVE status not checked on paper creation** — Fixed 2026-03-24
  - File: `src/app/sitting-builder/page.tsx` → `createPaperAction`
  - Fix: Now validates course is ACTIVE and belongs to tenant before creating paper.

- [x] **#ST-9 — Teacher role not re-validated on paper creation submit** — Fixed 2026-03-24
  - File: `src/app/sitting-builder/page.tsx` → `createPaperAction`
  - Fix: Now re-validates teacher has TEACHER role and ACTIVE membership on submit.

---

## Summary

| Area | Total | Fixed | Remaining | Deferred |
|------|-------|-------|-----------|----------|
| School Admin | 16 | 15 | 0 | 1 (Phase 2) |
| Sittings & Approvals | 9 | 9 | 0 | 0 |
| **Total** | **25** | **24** | **0** | **1** |

All migration gaps are fixed. Only #SA-12 (confirm dialogs) remains, deferred to Phase 2.

---

*Last updated: 2026-03-24*
