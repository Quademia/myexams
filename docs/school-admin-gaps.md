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

- [ ] **#ST-3 — Per-question approval comments system missing**
  - Files: `src/app/approvals/page.tsx`
  - Old code: Approvers can leave comments on individual questions during QUESTIONS gate approval. Comments saved to `sitting_approval_comments` table. Full question display with per-question comment fields.
  - New code: Simple approve/reject only. No question display, no comment fields.
  - Severity: **HIGH** — core approval workflow feature

- [ ] **#ST-4 — Question preview in approvals flow missing**
  - File: `src/app/approvals/page.tsx`
  - Old code: When approver opens a QUESTIONS gate approval, the full exam with all questions is displayed for review.
  - New code: Only shows metadata (exam title, gate type, sitting name). Approver must navigate separately to view questions.
  - Severity: **HIGH** — approvers can't see what they're approving

- [ ] **#ST-5 — Gate disable/turn-off feature missing**
  - File: `src/app/sitting-gate-settings/page.tsx`
  - Old code: Can disable an entire gate at once (removes all approvers + responses in one action).
  - New code: Can only remove approvers one by one. No bulk disable.
  - Severity: **HIGH** — workflow friction for gate management

- [x] **#ST-6 — Course_teachers not assigned on paper creation** — Fixed 2026-03-24
  - File: `src/app/sitting-builder/page.tsx` → `createPaperAction`
  - Fix: Now auto-assigns teacher to `course_teachers` if not already there, matching old code.

### MEDIUM PRIORITY — Missing Validation / UX

- [ ] **#ST-7 — Exam grade link missing in approvals for GRADING gate**
  - File: `src/app/approvals/page.tsx`
  - Old code: GRADING gate items link directly to `/exam-grade?attempt_id=...&view=1`.
  - New code: No link to view grading. Approver must navigate manually.
  - Severity: **MEDIUM** — UX friction

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
| Sittings & Approvals | 9 | 5 | 4 | 0 |
| **Total** | **25** | **20** | **4** | **1** |

### Remaining Sittings Fixes (priority order)

1. **#ST-5** — Gate disable feature
2. **#ST-7** — Exam grade link in approvals
3. **#ST-3** — Per-question approval comments
4. **#ST-4** — Question preview in approvals

*These are larger feature builds, not quick fixes.*

---

*Last updated: 2026-03-24*
