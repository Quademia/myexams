# QAcademy Beta-B — Feature Map

*A living document that tracks what every page, button, and form action does in the app. Updated as pages are built, reviewed, or changed.*

*This file exists because after building 33+ routes, it's easy to forget what a button does or how a flow works. This is the single source of truth for "what does this page actually do?"*

---

## How to Read This Document

Each page section follows this structure:
- **Route** — the URL path
- **File** — where the code lives
- **Who can access** — which roles see this page
- **Purpose** — what the page is for (one sentence)
- **What the user sees** — the UI sections on the page
- **Actions** — every button/form and exactly what it does (database changes, redirects, etc.)
- **Business rules** — any validation, edge cases, or important logic

---

## System Admin — `/sys`

**File:** `src/app/sys/page.tsx`
**Who can access:** System admin only (`is_system_admin = 1`). All other users are redirected to `/`.
**Purpose:** The god-mode page. Manages schools (tenants) and user-to-school assignments across the entire platform.

### What the user sees

1. **Header bar** — "System Admin" title + links to Profile and Logout
2. **Error banner** — red banner if the Create School form had invalid input (shown via `?error=invalid`)
3. **Create School form** — 4 fields to create a new school and assign its first admin
4. **Find User search** — search box to look up users by email
5. **Search results table** — shows matching users with their memberships and an "Add to school" form per row
6. **Schools list** — all schools in the system with their status

### Actions

#### Create School (`createSchoolAction`)
**Trigger:** Submit the "Create School" form
**Fields:** School name, Admin full name, Admin email, Temporary password

**What happens step by step:**
1. Re-checks that the logged-in user is still a system admin
2. Trims school name, admin name, and admin email. Lowercases the email
3. Validates: all fields must be non-empty, password must be 6+ characters
4. If validation fails → redirects to `/sys?error=invalid` (shows the red banner)
5. Creates a new row in the `tenants` table with status ACTIVE
6. Checks if a user with that email already exists:
   - **If NO** → creates a new user with the given name, email, and password (hashed with PBKDF2, 40,000 iterations, using APP_SECRET as pepper)
   - **If YES** → reuses the existing user (does NOT update their name or password)
7. Checks if that user already has a membership in this new school:
   - **If NO** → inserts a new membership with role SCHOOL_ADMIN
   - **If YES** → updates the existing membership to SCHOOL_ADMIN + ACTIVE
8. Redirects to `/sys` (clean, no query params)

**Business rules:**
- The temporary password is only used if the email is brand new. If the user already exists, the password field is ignored entirely
- System admin does NOT have a standalone "create user" feature. Users are only created as a side effect of creating a school
- The admin email can be any existing user — it doesn't have to be a new person

#### Find User (search form)
**Trigger:** Submit the "Find user by email" search form
**Fields:** Email search query (`q`)

**What happens:**
1. Submits as a GET request to `/sys?q=<search term>`
2. The page runs a SQL query: `SELECT ... FROM users WHERE lower(email) LIKE '%<query>%' ORDER BY email ASC LIMIT 25`
3. For each matching user, fetches their memberships from the `memberships` table joined with `tenants`
4. Displays results in a table

**Business rules:**
- Search is case-insensitive (lowercases both the query and the email column)
- Returns a maximum of 25 results
- Partial matches work (searching "ama" finds "ama@school.com" and "drama@test.com")

#### Add / Update Member (`addMemberAction`)
**Trigger:** Click "Add / Update" button next to a user in the search results
**Fields:** User ID (hidden), School dropdown, Role dropdown, Search query `q` (hidden)

**What happens step by step:**
1. Re-checks that the logged-in user is still a system admin
2. Validates: role must be one of STUDENT, TEACHER, or SCHOOL_ADMIN
3. Verifies the user exists and is ACTIVE
4. Verifies the school (tenant) exists and is ACTIVE
5. Checks if this user already has a membership in this school:
   - **If NO** → inserts a new membership with the selected role, status ACTIVE
   - **If YES** → updates the existing membership to the new role + ACTIVE status
6. Redirects to `/sys?q=<original search>` (preserves the search so you can keep working)

**Business rules:**
- This can both ADD a user to a new school and CHANGE their role in an existing school
- If a user was previously SUSPENDED in a school, this action reactivates them as ACTIVE
- The search query `q` is preserved via a hidden form field, so the search results stay visible after the action

### Database tables touched
- `tenants` — read (list all schools), write (create school)
- `users` — read (search by email), write (create new user during school creation)
- `memberships` — read (show user's schools/roles), write (add/update membership)

### Navigation
- **Profile link** → `/profile`
- **Logout link** → `/logout`

---

## School Admin — Dashboard `/school`

**File:** `src/app/school/page.tsx`
**Who can access:** SCHOOL_ADMIN only. System admins redirected to `/sys`.
**Purpose:** Overview dashboard showing school stats and alerts.

### What the user sees

1. **Stats grid** — 5 cards: Students, Teachers, Courses, Classes, Sittings (counts)
2. **Pending approvals banner** — amber banner with count + link to `/approvals` (only shows if > 0)
3. **Pending join requests banner** — gray banner with count + link to `/school-join-codes` (only shows if > 0)

### Actions

None — this is a read-only dashboard. All stats fetched in parallel.

### Database tables touched
- `memberships` — count students, teachers
- `courses` — count active courses
- `classes` — count active classes
- `sittings` — count sittings
- `sitting_approval_gates` + `sitting_approval_responses` — count pending approvals
- `join_requests` — count pending requests

---

## School Admin — Courses List `/school-courses`

**File:** `src/app/school-courses/page.tsx`
**Who can access:** SCHOOL_ADMIN only.
**Purpose:** View all courses and create new ones.

### What the user sees

1. **Courses table** — title (linked to detail), status badge, teacher count, student count, Manage link
2. **Create Course form** — single field: course title

### Actions

#### Create Course (`createCourseAction`)
**Trigger:** Submit the create form
**Fields:** Title

**What happens:**
1. Validates title is non-empty
2. Inserts new course with status ACTIVE, tenant_id from current school
3. Redirects back to `/school-courses`

**Business rules:**
- Title required
- Courses always start as ACTIVE

---

## School Admin — Course Detail `/school-course`

**File:** `src/app/school-course/page.tsx`
**Who can access:** SCHOOL_ADMIN only.
**Purpose:** Manage a single course — its settings, teachers, students, class links, and join codes. Has 5 tabs.

### What the user sees

**Tab 1 — Details:**
- Edit form: title + status dropdown (ACTIVE/ARCHIVED)

**Tab 2 — Teachers:**
- List of assigned teachers with Unassign button each
- Assign Teacher dropdown (shows TEACHER + SCHOOL_ADMIN members not yet assigned)

**Tab 3 — Students:**
- List of enrolled students with Unenrol button each
- Enrol Student dropdown (shows STUDENT + SCHOOL_ADMIN members not yet enrolled)

**Tab 4 — Classes:**
- Linked classes table showing class name (Year group), enrolled/total students ratio
- "Enrol Class Students in This Course" form — dropdown of ALL active classes (even empty ones) with student counts + bulk enrol button. This pushes the class's students into the course, not the other way around.
- Remove Class button per linked class (validates class exists + belongs to tenant)

**Tab 5 — Join Codes:**
- Active codes table with Revoke button
- Create Code form scoped to this course (COURSE_ENROLL or COURSE_TEACHER)

### Actions

#### Update Course (`updateCourseAction`)
- Updates title and status. Status must be ACTIVE or ARCHIVED — rejects anything else.

#### Assign Teacher (`assignTeacherAction`)
- Validates user has TEACHER or SCHOOL_ADMIN membership in this school before inserting into `course_teachers`. Includes `created_at`.

#### Unassign Teacher (`unassignTeacherAction`)
- Deletes from `course_teachers`.

#### Enrol Student (`enrolStudentAction`)
- Validates user has STUDENT or SCHOOL_ADMIN membership. Checks not already enrolled. Inserts into `enrollments` (7 columns: id, course_id, user_id, tenant_id, status, created_at, updated_at).

#### Unenrol Student (`unenrolStudentAction`)
- Deletes from `enrollments`.

#### Enrol Class (`enrolClassAction`)
- Validates class belongs to tenant and is ACTIVE. Bulk enrolls all class students — skips already enrolled (idempotent).

#### Unenrol Class (`unenrolClassAction`)
- Validates class belongs to tenant. Bulk deletes all class students from this course.

#### Create Code (`createCodeAction`)
- Creates join code scoped to this course. Validates course is ACTIVE and belongs to tenant. Stores plaintext in secure httpOnly cookie (60s).

#### Revoke Code (`revokeCodeAction`)
- Sets code status to REVOKED.

### Business rules
- Status only accepts ACTIVE or ARCHIVED
- Teacher assignment requires TEACHER or SCHOOL_ADMIN role
- Student enrollment requires STUDENT or SCHOOL_ADMIN role
- Bulk class operations are idempotent
- Year group shown next to class names in Classes tab

---

## School Admin — Classes List `/school-classes`

**File:** `src/app/school-classes/page.tsx`
**Who can access:** SCHOOL_ADMIN only.
**Purpose:** View all classes and create new ones.

### What the user sees

1. **Classes table** — name (linked to detail), year group, academic year, status badge, student count, Manage link
2. **Create Class form** — name (required), year group, academic year, description (all optional except name)

### Actions

#### Create Class (`createClassAction`)
- Validates name is non-empty. Inserts with ACTIVE status. Redirects back to list.

---

## School Admin — Class Detail `/school-class`

**File:** `src/app/school-class/page.tsx`
**Who can access:** SCHOOL_ADMIN only.
**Purpose:** Manage a single class — edit details, manage students, link to courses. Has 3 tabs.

### What the user sees

**Tab 1 — Details:**
- Edit form: name, year group, academic year, description
- Archive/Unarchive button

**Tab 2 — Students:**
- List of students in this class with Remove button each
- Add Student dropdown (shows students not already in this class)

**Tab 3 — Courses:**
- Linked courses table showing course name, enrolled/total student ratio
- "Enrol This Class's Students in a Course" form — dropdown of active courses + bulk enrol button. This pushes the class's students into the selected course.
- Unlink button per linked course

### Actions

#### Update Class (`updateClassAction`)
- Updates name, year_group, academic_year, description.

#### Archive Class (`archiveClassAction`)
- Toggles status ACTIVE↔ARCHIVED. Redirects to `/school-classes` (list page, not detail).

#### Add Student (`addStudentAction`)
- Validates user has STUDENT role membership in this school before inserting into `class_students`.

#### Remove Student (`removeStudentAction`)
- Deletes from `class_students`.

#### Enrol Course (`enrolCourseAction`)
- Validates course belongs to tenant and is ACTIVE. Bulk enrolls all class students into the course (idempotent).

#### Unenrol Course (`unenrolCourseAction`)
- Validates course belongs to tenant. Bulk removes all class students from the course.

### Business rules
- Archive redirects to class list, not detail page
- Student add validates STUDENT role membership
- Bulk course operations are idempotent
- Only ACTIVE courses shown in the enrol dropdown

---

## School Admin — People `/school-people`

**File:** `src/app/school-people/page.tsx`
**Who can access:** SCHOOL_ADMIN only.
**Purpose:** View and manage all members of the school. Add new people. Has 2 tabs.

### What the user sees

**Tab 1 — Members:**
- Filter bar: role dropdown + course dropdown + class dropdown
- Members table: name, email, role dropdown with Update button, Remove button (disabled for self with tooltip)
- Course/class pills per member showing their enrollments

**Tab 2 — Add Person:**
- Step 1: Email check form
- Step 2a (email exists): Shows user name + role dropdown + Add button
- Step 2b (email doesn't exist): Name field + role dropdown + temporary password + Create button

### Actions

#### Update Role (`updateRoleAction`)
- Updates membership role. Prevents self-demotion from SCHOOL_ADMIN.

#### Remove Member (`removeMemberAction`)
- Sets membership status to REMOVED. Cascades: deletes all enrollments and course_teachers assignments for this user.
- Prevents self-removal — redirects with `?error=self_remove` and shows error banner.

#### Check Email (`checkEmailAction`)
- Looks up email in users table. Redirects with `exists=1` or `exists=0`. Protected by SCHOOL_ADMIN role check.

#### Add Existing User (`addExistingUserAction`)
- Creates membership for existing user with chosen role.

#### Add New User (`addNewUserAction`)
- Creates new user (hashed password, PBKDF2, 40k iterations) + membership with chosen role.

### Business rules
- Can't remove yourself (button disabled + tooltip)
- Can't demote yourself from SCHOOL_ADMIN
- Email check is case-insensitive
- Password minimum 6 characters for new users
- Remove cascades to enrollments + course_teachers

---

## School Admin — Join Codes `/school-join-codes`

**File:** `src/app/school-join-codes/page.tsx`
**Who can access:** SCHOOL_ADMIN only.
**Purpose:** Create and manage join codes that let users join the school or enrol in courses. Handle pending join requests.

### What the user sees

1. **Active Codes** — table: description, scope, limits (used/max), approval mode, Duplicate + Revoke buttons
2. **Create Code** — plain English form: "Who?" (student/teacher) → "What?" (join school / enrol in course / assign as teacher) → course dropdown (if applicable) → auto-approve toggle → expiry days → max uses
3. **Pending Requests** — table: user email, code description, date, Approve + Reject buttons
4. **History** — past approvals/rejections with "Reviewed:" prefix showing who reviewed and when (limit 50)

### Actions

#### Create Code (`createCodeAction`)
- Maps plain English choices to scope (TENANT_ROLE, COURSE_ENROLL, COURSE_TEACHER) and role (STUDENT, TEACHER).
- Validates course if course-scoped (must exist, be ACTIVE, belong to tenant).
- Generates unique hashed code. Stores plaintext in httpOnly cookie (60s).

#### Revoke Code (`revokeCodeAction`)
- Sets code status to REVOKED.

#### Approve Request (`approveRequestAction`)
- Complex action with race condition protection:
  1. Validates code is still active/valid
  2. Reserves a use slot (increments `uses_approved`, checks `meta.changes > 0`)
  3. Applies the join action based on scope — creates membership, enrollment, or course teaching assignment
  4. Handles role hierarchy: SCHOOL_ADMIN never downgraded, TEACHER not demoted to STUDENT
  5. On failure: unreserves the slot (decrements `uses_approved`)
  6. Updates request status to APPROVED

#### Reject Request (`rejectRequestAction`)
- Updates request status to REJECTED.

### Business rules
- Plaintext code only stored in cookie, never in database (security)
- Reserve-use pattern prevents race conditions on max_uses
- Teacher demotion protection: can't downgrade TEACHER via student-scope code
- Full role hierarchy: SCHOOL_ADMIN > TEACHER > STUDENT
- Course codes validate course is ACTIVE + belongs to tenant
- History shows "Reviewed:" prefix with reviewer name and date/time

---

## School Admin — Sittings `/school-sittings`

**File:** `src/app/school-sittings/page.tsx`
**Who can access:** SCHOOL_ADMIN only.
**Purpose:** View all exam sittings and create new ones.

### What the user sees

1. **Sittings table** — title, academic year, status badge (DRAFT=gray, ACTIVE=green, CLOSED=red), paper count, Open button
2. **New Sitting button** — creates a sitting and redirects to builder

### Actions

#### Create Sitting (`createSittingAction`)
- Creates sitting with title "New Sitting", status DRAFT. Redirects to `/sitting-builder?sitting_id=X`.

### Business rules
- Sittings always start as DRAFT
- Ordered by newest first

---

## Cross-Cutting Patterns (School Admin)

**Authentication:** All 8 school pages enforce SCHOOL_ADMIN role. System admins are redirected to `/sys`.

**Tenant isolation:** Every query is scoped to `tenant_id` from the active membership. Users can never see or modify data from another school.

**Idempotent bulk operations:** Enrol-class-in-course and similar bulk actions check each student individually and skip already-enrolled ones.

**Enrollment INSERTs:** All enrollment inserts use 7 columns (`id`, `course_id`, `user_id`, `tenant_id`, `status`, `created_at`, `updated_at`) since the schema upgrade on 2026-03-24.

**No confirm dialogs yet:** Destructive actions (remove member, unenrol, revoke code, archive) work but have no browser confirmation. Deferred to Phase 2 (needs client-side ConfirmButton component).

---

*More pages will be added to this document as they are reviewed.*
