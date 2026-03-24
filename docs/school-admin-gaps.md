# School Admin — Migration Gaps

*Identified by comparing the old `functions/admin.js` against all new `src/app/school-*/page.tsx` files. This file tracks each gap until it's fixed.*

---

## How to Read This File

- Each gap has a number, severity, description, which file(s) need changing, and a checkbox
- When a gap is fixed, tick the checkbox and note the date
- Once all boxes are ticked, this file becomes a record of what was done

---

## HIGH PRIORITY — Business Logic / Security

- [ ] **#1 — Missing teacher demotion protection** (school-join-codes)
  - File: `src/app/school-join-codes/page.tsx` → `approveRequestAction`
  - Problem: Old code prevents a teacher from being downgraded to student when a student-scope join code is approved. New code has no such protection.
  - Fix: Before updating membership role, check if user already has TEACHER or SCHOOL_ADMIN role — if so, don't overwrite with STUDENT.

- [ ] **#2 — Missing unreserve-on-failure** (school-join-codes)
  - File: `src/app/school-join-codes/page.tsx` → `approveRequestAction`
  - Problem: If the join action fails after the use counter was incremented, the old code rolls back the counter. New code doesn't.
  - Fix: Wrap the apply logic in try/catch. On failure, decrement `uses_approved` back.

- [ ] **#3 — Missing reserve success check** (school-join-codes)
  - File: `src/app/school-join-codes/page.tsx` → `approveRequestAction`
  - Problem: Old code checks that the UPDATE to increment `uses_approved` actually changed a row (confirming the code wasn't maxed out by a race condition). New code doesn't check.
  - Fix: Use `db.prepare(...).run()` directly and check `meta.changes > 0` before proceeding.

- [ ] **#4 — Missing membership validation in assignTeacherAction** (school-course)
  - File: `src/app/school-course/page.tsx` → `assignTeacherAction`
  - Problem: Old code verifies the user has a TEACHER or SCHOOL_ADMIN membership before assigning them as course teacher. New code just inserts without checking.
  - Fix: Add a query to verify user has `role IN ('TEACHER','SCHOOL_ADMIN')` membership in this tenant before inserting.

- [ ] **#5 — Missing membership validation in enrolStudentAction** (school-course)
  - File: `src/app/school-course/page.tsx` → `enrolStudentAction`
  - Problem: Old code verifies user has STUDENT membership before enrolling. New code skips this.
  - Fix: Add a query to verify user has `role='STUDENT'` (or SCHOOL_ADMIN) membership in this tenant.

- [ ] **#6 — Missing membership validation in addStudentAction** (school-class)
  - File: `src/app/school-class/page.tsx` → `addStudentAction`
  - Problem: Old code verifies user has STUDENT role before adding to class. New code skips this.
  - Fix: Add membership role check before inserting into class_students.

- [ ] **#7 — Missing tenant/ACTIVE validation in multiple actions**
  - Files: `src/app/school-course/page.tsx` → `enrolClassAction`, `src/app/school-class/page.tsx` → `enrolCourseAction`, `unenrolCourseAction`
  - Problem: Old code validates that classes and courses belong to the tenant and are ACTIVE. New code doesn't.
  - Fix: Add `WHERE tenant_id=? AND status='ACTIVE'` checks on class/course before performing the action.

- [ ] **#8 — Missing course validation in createCodeAction** (school-join-codes)
  - File: `src/app/school-join-codes/page.tsx` → `createCodeAction`
  - Problem: Old code validates the course exists, belongs to tenant, and is ACTIVE before creating a join code for it. New code doesn't.
  - Fix: Add a SELECT to verify course exists + tenant match + ACTIVE status before INSERT.

- [ ] **#9 — Missing status validation in updateCourseAction** (school-course)
  - File: `src/app/school-course/page.tsx` → `updateCourseAction`
  - Problem: Old code validates status is one of ACTIVE or ARCHIVED. New code accepts any value.
  - Fix: Add `if (!["ACTIVE", "ARCHIVED"].includes(status)) redirect(...)` before the UPDATE.

---

## MEDIUM PRIORITY — Missing UI Features

- [ ] **#10 — Missing pending approvals banner** (school overview)
  - File: `src/app/school/page.tsx`
  - Problem: Old code shows a yellow banner with count of pending approval gates assigned to the current user + link to /approvals. New code doesn't have this.
  - Fix: Add a query on `sitting_approval_gates` + `sitting_approval_responses` for pending items where the user is an assigned approver. Show banner if count > 0.

- [ ] **#11 — Missing system admin redirect on all school pages**
  - Files: ALL `src/app/school-*/page.tsx` files + `src/app/school/page.tsx`
  - Problem: Old code redirects system admins to /sys on every school admin page. New code doesn't.
  - Fix: Add `if (auth.user!.is_system_admin === 1) redirect("/sys")` at the top of each page, before the active membership check.

- [ ] **#12 — Missing confirm dialogs on destructive actions**
  - Files: `school-course`, `school-class`, `school-people`, `school-join-codes`
  - Problem: Old code has browser `confirm()` dialogs on: unassign teacher, unenrol student, remove class from course, remove member, archive class, remove student from class, unlink course from class, revoke code, approve/reject request. New code has zero.
  - Fix: Add `onSubmit="return confirm('...')"` to each destructive form. Note: this requires the forms to be client-side or use a simple inline script attribute.

---

## LOW PRIORITY — Minor Differences

- [ ] **#13 — Missing `created_at` in course_teachers INSERT**
  - File: `src/app/school-course/page.tsx` → `assignTeacherAction`
  - Problem: Old code sets `created_at` when inserting into course_teachers. New code omits it.
  - Fix: Add `created_at` to the INSERT with `new Date().toISOString()`.

- [ ] **#14 — Missing year_group display in Classes tab** (school-course)
  - File: `src/app/school-course/page.tsx` → `ClassesTab`
  - Problem: Old code shows "(Year 10)" next to class names in the linked classes list. New code doesn't.
  - Fix: Add `cl.year_group` display next to class name in the table.

- [ ] **#15 — Archive redirect goes to detail page instead of list**
  - File: `src/app/school-class/page.tsx` → `archiveClassAction`
  - Problem: Old code redirects to `/school-classes` (list) after archiving. New code stays on detail page.
  - Decision needed: Keep new behavior (stay on page) or match old behavior (go to list)?

- [ ] **#16 — Partial SCHOOL_ADMIN role preservation in approve logic**
  - File: `src/app/school-join-codes/page.tsx` → `approveRequestAction`
  - Problem: Old code has nuanced logic for preserving higher roles (SCHOOL_ADMIN > TEACHER > STUDENT) across all join code scopes. New code only handles TENANT_ROLE scope.
  - Fix: Port the full role hierarchy logic from the old `applyJoinActionForUser` function.

---

## Summary

| Severity | Count | Fixed |
|----------|-------|-------|
| High     | 9     | 0/9   |
| Medium   | 3     | 0/3   |
| Low      | 4     | 0/4   |
| **Total**| **16**| **0/16** |

---

*Last updated: 2026-03-24*
