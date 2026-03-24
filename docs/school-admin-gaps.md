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

- [ ] **#ST-1 — Creating papers for sittings does not work**
  - File: `src/app/sitting-builder/page.tsx` → `createPaperAction`
  - Problem: Paper creation fails. Needs investigation — may be query issue, missing validation, or form field mismatch.
  - Severity: **CRITICAL** — sittings are unusable without papers

- [ ] **#ST-2 — Duplicate teacher name in assign-teacher dropdown**
  - File: `src/app/sitting-builder/page.tsx` → Papers tab teacher dropdown
  - Problem: Same teacher name appears multiple times in the dropdown. Likely the query returns duplicate rows (e.g., teacher has multiple memberships or the JOIN produces duplicates).
  - Severity: **HIGH** — confusing UX, may cause wrong assignment

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

- [ ] **#ST-6 — Course_teachers not assigned on paper creation**
  - File: `src/app/sitting-builder/page.tsx` → `createPaperAction`
  - Old code: When creating a new paper, auto-assigns the teacher to `course_teachers` if not already there.
  - New code: Creates exam with `created_by` but does NOT insert into `course_teachers`.
  - Severity: **HIGH** — teacher may not see the exam on their dashboard

### MEDIUM PRIORITY — Missing Validation / UX

- [ ] **#ST-7 — Exam grade link missing in approvals for GRADING gate**
  - File: `src/app/approvals/page.tsx`
  - Old code: GRADING gate items link directly to `/exam-grade?attempt_id=...&view=1`.
  - New code: No link to view grading. Approver must navigate manually.
  - Severity: **MEDIUM** — UX friction

- [ ] **#ST-8 — Course ACTIVE status not checked on paper creation**
  - File: `src/app/sitting-builder/page.tsx` → `createPaperAction`
  - Old code: Validates course is ACTIVE before allowing paper creation.
  - New code: Doesn't explicitly check course status.
  - Severity: **MEDIUM** — could allow papers in archived courses

- [ ] **#ST-9 — Teacher role not re-validated on paper creation submit**
  - File: `src/app/sitting-builder/page.tsx` → `createPaperAction`
  - Old code: Re-validates teacher has TEACHER role and ACTIVE status on form submission.
  - New code: Only filters in the dropdown query. No server-side re-check on submit.
  - Severity: **MEDIUM** — race condition possible if role changes between page load and submit

---

## Summary

| Area | Total | Fixed | Remaining | Deferred |
|------|-------|-------|-----------|----------|
| School Admin | 16 | 15 | 0 | 1 (Phase 2) |
| Sittings & Approvals | 9 | 0 | 9 | 0 |
| **Total** | **25** | **15** | **9** | **1** |

### Priority Order for Sittings Fixes

1. **#ST-1** — Fix paper creation (nothing works without this)
2. **#ST-2** — Fix duplicate teacher dropdown
3. **#ST-6** — Auto-assign course_teachers on paper creation
4. **#ST-8** — Course ACTIVE check on paper creation
5. **#ST-9** — Teacher validation on submit
6. **#ST-5** — Gate disable feature
7. **#ST-7** — Exam grade link in approvals
8. **#ST-3** — Per-question approval comments
9. **#ST-4** — Question preview in approvals

*Items 1-5 are quick targeted fixes. Items 6-9 are larger feature builds.*

---

*Last updated: 2026-03-24*
