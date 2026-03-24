# School Admin — Migration Gaps

*Identified by comparing the old `functions/admin.js` against all new `src/app/school-*/page.tsx` files. This file tracks each gap until it's fixed.*

---

## How to Read This File

- Each gap has a number, severity, description, which file(s) need changing, and a checkbox
- When a gap is fixed, tick the checkbox and note the date
- Once all boxes are ticked, this file becomes a record of what was done

---

## HIGH PRIORITY — Business Logic / Security

- [x] **#1 — Missing teacher demotion protection** (school-join-codes) — Fixed 2026-03-24
  - File: `src/app/school-join-codes/page.tsx` → `approveRequestAction`
  - Problem: Old code prevents a teacher from being downgraded to student when a student-scope join code is approved. New code has no such protection.
  - Fix: Added check — if user is TEACHER and code is student-scope, redirect with error instead of downgrading.

- [x] **#2 — Missing unreserve-on-failure** (school-join-codes) — Fixed 2026-03-24
  - File: `src/app/school-join-codes/page.tsx` → `approveRequestAction`
  - Problem: If the join action fails after the use counter was incremented, the old code rolls back the counter. New code doesn't.
  - Fix: Wrapped apply logic in try/catch with `unreserve()` helper that decrements `uses_approved` on failure.

- [x] **#3 — Missing reserve success check** (school-join-codes) — Fixed 2026-03-24
  - File: `src/app/school-join-codes/page.tsx` → `approveRequestAction`
  - Problem: Old code checks that the UPDATE to increment `uses_approved` actually changed a row (confirming the code wasn't maxed out by a race condition). New code doesn't check.
  - Fix: Used `db.prepare(...).run()` directly and check `meta.changes > 0` before proceeding.

- [x] **#4 — Missing membership validation in assignTeacherAction** (school-course) — Fixed 2026-03-24
  - File: `src/app/school-course/page.tsx` → `assignTeacherAction`
  - Problem: Old code verifies the user has a TEACHER or SCHOOL_ADMIN membership before assigning them as course teacher. New code just inserts without checking.
  - Fix: Added query to verify user has `role IN ('TEACHER','SCHOOL_ADMIN')` membership in this tenant before inserting.

- [x] **#5 — Missing membership validation in enrolStudentAction** (school-course) — Fixed 2026-03-24
  - File: `src/app/school-course/page.tsx` → `enrolStudentAction`
  - Problem: Old code verifies user has STUDENT membership before enrolling. New code skips this.
  - Fix: Added query to verify user has `role IN ('STUDENT','SCHOOL_ADMIN')` membership in this tenant.

- [x] **#6 — Missing membership validation in addStudentAction** (school-class) — Fixed 2026-03-24
  - File: `src/app/school-class/page.tsx` → `addStudentAction`
  - Problem: Old code verifies user has STUDENT role before adding to class. New code skips this.
  - Fix: Added membership role check (`role='STUDENT'`) before inserting into class_students.

- [x] **#7 — Missing tenant/ACTIVE validation in multiple actions** — Fixed 2026-03-24
  - Files: `src/app/school-course/page.tsx` → `enrolClassAction`, `src/app/school-class/page.tsx` → `enrolCourseAction`, `unenrolCourseAction`
  - Problem: Old code validates that classes and courses belong to the tenant and are ACTIVE. New code doesn't.
  - Fix: Added `SELECT ... WHERE id=? AND tenant_id=?` (and `AND status='ACTIVE'` for courses) checks before performing each action.

- [x] **#8 — Missing course validation in createCodeAction** (school-join-codes) — Fixed 2026-03-24
  - File: `src/app/school-join-codes/page.tsx` → `createCodeAction`
  - Problem: Old code validates the course exists, belongs to tenant, and is ACTIVE before creating a join code for it. New code doesn't.
  - Fix: Added SELECT to verify course exists + tenant match + ACTIVE status before INSERT. Redirects with `?error=course_invalid` if not found.

- [x] **#9 — Missing status validation in updateCourseAction** (school-course) — Fixed 2026-03-24
  - File: `src/app/school-course/page.tsx` → `updateCourseAction`
  - Problem: Old code validates status is one of ACTIVE or ARCHIVED. New code accepts any value.
  - Fix: Added `if (!["ACTIVE", "ARCHIVED"].includes(status)) redirect(...)` before the UPDATE.

---

## MEDIUM PRIORITY — Missing UI Features

- [x] **#10 — Missing pending approvals banner** (school overview) — Fixed 2026-03-24
  - File: `src/app/school/page.tsx`
  - Problem: Old code shows a yellow banner with count of pending approval gates assigned to the current user + link to /approvals. New code doesn't have this.
  - Fix: Added query on `sitting_approval_gates` + `sitting_approval_responses` for PENDING items where user is approver. Shows amber banner with count + link to /approvals.

- [x] **#11 — Missing system admin redirect on all school pages** — Fixed 2026-03-24
  - Files: ALL `src/app/school-*/page.tsx` files + `src/app/school/page.tsx`
  - Problem: Old code redirects system admins to /sys on every school admin page. New code doesn't.
  - Fix: Added `if (auth.user!.is_system_admin === 1) redirect("/sys")` to the page-level function of all 8 school pages (school, school-courses, school-course, school-classes, school-class, school-people, school-join-codes, school-sittings).

- [ ] **#12 — Missing confirm dialogs on destructive actions** — Deferred to Phase 2
  - Files: `school-course`, `school-class`, `school-people`, `school-join-codes`
  - Problem: Old code has browser `confirm()` dialogs on: unassign teacher, unenrol student, remove class from course, remove member, archive class, remove student from class, unlink course from class, revoke code, approve/reject request. New code has zero.
  - Why deferred: React Server Components don't support inline `onSubmit` with `confirm()` the way raw HTML did. This needs a client-side `ConfirmButton` component, which is a Phase 2 feature (design system — Modal component). The destructive actions still work correctly — the confirm dialog is a UX safeguard, not a business logic requirement.

---

## LOW PRIORITY — Minor Differences

- [x] **#13 — Missing `created_at` in course_teachers INSERT** — Fixed 2026-03-24
  - File: `src/app/school-course/page.tsx` → `assignTeacherAction`
  - Problem: Old code sets `created_at` when inserting into course_teachers. New code omits it.
  - Fix: Added `created_at` with `new Date().toISOString()` to the INSERT.

- [x] **#14 — Missing year_group display in Classes tab** (school-course) — Fixed 2026-03-24
  - File: `src/app/school-course/page.tsx` → `ClassesTab`
  - Problem: Old code shows "(Year 10)" next to class names in the linked classes list. New code doesn't.
  - Fix: Added `cl.year_group` to the SQL query and display it in parentheses next to the class name.

- [x] **#15 — Archive redirect goes to class list** — Fixed 2026-03-24
  - File: `src/app/school-class/page.tsx` → `archiveClassAction`
  - Problem: Old code redirects to `/school-classes` (list) after archiving. New code stays on detail page.
  - Fix: Changed redirect to `/school-classes` to match old behavior.

- [x] **#16 — Full SCHOOL_ADMIN role preservation in approve logic** — Fixed 2026-03-24
  - File: `src/app/school-join-codes/page.tsx` → `approveRequestAction`
  - Problem: Old code has nuanced logic for preserving higher roles (SCHOOL_ADMIN > TEACHER > STUDENT) across all join code scopes. New code only handles TENANT_ROLE scope.
  - Fix: Ported full role hierarchy from old `applyJoinActionForUser()` — SCHOOL_ADMIN is never downgraded, STUDENT can be upgraded to TEACHER on COURSE_TEACHER codes, course validation added for COURSE_ENROLL and COURSE_TEACHER scopes.

---

## Summary

| Severity | Count | Fixed | Deferred |
|----------|-------|-------|----------|
| High     | 9     | 9/9   | 0        |
| Medium   | 3     | 2/3   | 1 (#12)  |
| Low      | 4     | 4/4   | 0        |
| **Total**| **16**| **15/16** | **1** |

**#12 (confirm dialogs)** is intentionally deferred to Phase 2 — needs a client-side ConfirmButton component which is part of the design system work.

---

*Last updated: 2026-03-24*
