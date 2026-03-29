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

## Password Reset Flow

**Files:**
- `src/app/(auth)/forgot-password/page.tsx`
- `src/app/(auth)/reset-password/page.tsx`

**Who can access:** Public — no session required.

**Purpose:** Allows a user to reset their password via a time-limited, single-use email link.

---

### Forgot Password — `/forgot-password`

**What the user sees:**
A single email input form. On submit always shows: "If that email is registered you'll receive a reset link shortly." — regardless of whether the email exists (prevents account enumeration).

**Server action logic:**
1. Look up email in `qa_users` where `status = 'ACTIVE'`
2. If not found — log to `password_reset_log` with status `NO_USER`, show success message silently
3. Rate limit check via `checkResetRateLimit()` in `src/lib/reset-log.ts` — 1 request in 10 min or 3 in 24 hr blocks silently. Logged to `password_reset_log` with status `RATE_LIMITED` or `RATE_LIMITED_24H`
4. Invalidate any existing unused, non-invalidated tokens for this email — set `invalidated_at = now()`
5. Generate raw token: `crypto.randomUUID() + crypto.randomUUID()` (no hyphens)
6. Hash token with SHA-256 via `sha256Hex()` from `src/lib/auth.ts` — store hash in DB, send raw in URL
7. Hash requester's IP with SHA-256 for privacy (consistent with auth_events approach)
8. Insert into `verification_tokens`: identifier=email, token=hash, expires=Unix+3600, created_at, ip_address (hashed)
9. Send email via Resend from `noreply@qacademynurses.com` with reset link pointing to `/reset-password?token={raw}&email={encoded}`
10. Log to `password_reset_log` with status `EMAIL_SENT` and token hash (never raw token)
11. Link expires in 1 hour and is single-use only

---

### Reset Password — `/reset-password`

**What the user sees:**
Receives `?token=&email=` from the email link. Shows a form with new password and confirm password fields. Token and email passed as hidden fields.

**Server action logic:**
1. Validate passwords match and are 6+ characters
2. Hash incoming raw token with SHA-256 to get lookup value
3. Look up `verification_tokens` where `identifier = email AND token = hash`
4. Validation checks in order:
   - Not found → "This reset link is invalid."
   - `used_at IS NOT NULL` → "This reset link has already been used."
   - `invalidated_at IS NOT NULL` → "This reset link is no longer valid. Please request a new one."
   - `expires < Math.floor(Date.now() / 1000)` → "This reset link has expired. Please request a new one."
5. Hash new password: `pbkdf2Hex(password + "|" + APP_SECRET, randomSaltHex(), 40000)`
6. Update `qa_users`: new password_hash, password_salt, password_iter=40000, updated_at
7. Expire all active sessions for this user via `expireAllUserSessions()` with reason `"password_reset"` — forces re-login on all devices
8. Mark token as used: `SET used_at = now(), used_ip_address = {ip_hash}` (IP hashed with SHA-256)
9. Update `password_reset_log` to append " | password_changed" to the matching row
10. Redirect to `/login?message=password-reset`

---

### Business rules
- Token is stored hashed in DB, raw value only ever exists in the email link and the URL — never stored plain
- Token hash also stored in `password_reset_log` (never raw) — DB breach cannot expose reset links from either table
- One-use enforced via `used_at` — token row is never deleted (kept for audit)
- Old tokens killed by newer requests via `invalidated_at` — distinguishes "used legitimately" vs "superseded"
- Rate limit via `password_reset_log`: 1 request in 10 min or 3 in 24 hr — prevents inbox flooding
- Account enumeration protection: success message always shown regardless of email existence
- IP addresses hashed with SHA-256 before storage at both request time (`ip_address`) and use time (`used_ip_address`) — consistent with auth_events privacy approach
- All sessions expired on password reset — compromised sessions are killed immediately
- `verification_tokens` extra columns (`created_at`, `ip_address`, `used_at`, `used_ip_address`, `invalidated_at`) are QAcademy additions — NextAuth does not touch them

### Database tables touched
- `qa_users` — read (look up user), write (update password hash)
- `verification_tokens` — read (validate token), write (create token, mark used, invalidate old tokens)
- `password_reset_log` — write (log every request attempt and outcome)
- `sessions` — write (expire all active sessions on password reset)

---

## Login — `/login`

**File:** `src/app/(auth)/login/page.tsx`
**Who can access:** Public — no session required.
**Purpose:** Sign in with email + password, Google SSO, or Microsoft SSO.

### What the user sees
1. **Email + password form** — email and password fields, submit button, "Forgot your password?" link
2. **SSO buttons** — "Sign in with Google" and "Sign in with Microsoft"
3. **Error banners** — shown for wrong credentials, rate limiting, no account (SSO), max sessions reached
4. **Success banner** — green banner after password reset (`?message=password-reset`)

### Server action logic (email + password)
1. Derive request metadata (IP hash, UA hash, country) from Cloudflare headers via `getRequestMeta()`
2. Look up user in `qa_users` by email — needed for rate limiting (only `id`, not password fields)
3. Check rate limits via `checkLoginRateLimit()` — 5 failures in 10 min or 10 in 24 hr blocks login
4. If blocked — log to `auth_events`, redirect to `/login?error=TooManyAttempts`
5. Call `signIn("credentials")` — NextAuth runs `authorize()` in `src/auth.ts` which does the single PBKDF2 hash+compare
6. Password verification happens only once in `authorize()` — never duplicated in the login action
7. On failure — log to `auth_events`, redirect to `/login?error=CredentialsSignin`

### SSO flow
- Google/Microsoft buttons call `signIn("google")` or `signIn("microsoft-entra-id")` which redirects to the OAuth provider
- After OAuth round-trip, the `signIn` callback in `src/auth.ts` checks if the email exists in `qa_users`. Unregistered emails are rejected with `/login?error=NoAccount`
- Concurrent session limit (max 2) is checked for all login types
- Auth events are logged for both success and failure

### Business rules
- Rate limiting checks three dimensions independently: identifier (email), IP hash, and user ID
- If IP hash is null (no Cloudflare headers), the IP dimension is skipped — identifier and user dimensions still protect
- Concurrent session limit: max 2 active sessions per user. Blocked attempts logged with error code `max_sessions_reached`
- All auth events logged fire-and-forget — logging failure never blocks login

### Database tables touched
- `qa_users` — read (user lookup for rate limiting)
- `auth_events` — read (rate limit counts), write (log every attempt)
- `sessions` — read (count active sessions), write (create session row on success, create+expire for blocked audit trail)

---

## Logout — `/logout`

**File:** `src/app/(auth)/logout/route.ts`
**Who can access:** Any authenticated user.
**Purpose:** End the session cleanly — expire the D1 session row and clear the JWT cookie.

### What happens
1. Read `session_token` from the current JWT
2. Get D1 binding via `getCloudflareContext()`
3. Expire the D1 session row via `expireSession()` with reason from URL param (e.g. `"logout"`, `"idle_timeout"`)
4. Call NextAuth `signOut()` to delete the JWT cookie
5. Redirect to `/login`

### Business rules
- The D1 session row is expired so it no longer counts toward the concurrent session limit
- The reason parameter allows distinguishing between manual logout, idle timeout, and other causes in the audit trail

---

## Idle Timeout — Client-Side Component

**File:** `src/components/ui/IdleTimeout.tsx`
**Who can access:** All authenticated users (rendered in root layout for every page).
**Purpose:** Auto-logout inactive users with a warning countdown.

### How it works
1. On mount, checks `data-authed` attribute on `<body>` (set by `layout.tsx`) — renders nothing if not logged in
2. Starts idle timer (2 min for testing, 28 min for production)
3. Listens for activity events: mousemove, mousedown, keydown, touchstart, scroll
4. On activity — resets the timer
5. When timer expires — shows warning modal with countdown (30 sec for testing, 120 sec for production)
6. "Stay logged in" button resets everything
7. Countdown reaches 0 or "Log out now" clicked — navigates to `/logout?reason=idle_timeout`

### Cross-tab sync (BroadcastChannel)
- Creates a `BroadcastChannel("qa-idle-timeout")` on mount
- On local activity — broadcasts `{ type: "activity" }` to all tabs
- On receiving "activity" from another tab — resets idle timer
- On logout — broadcasts `{ type: "logout" }` before navigating
- On receiving "logout" from another tab — navigates to `/logout`
- Channel closed on component unmount
- Falls back to per-tab behavior if BroadcastChannel is not supported (old browsers)

### Business rules
- BroadcastChannel only works across tabs in the same browser — not across different browsers or incognito
- Once the warning modal is showing, local activity does NOT reset the timer — only the "Stay logged in" button does
- Same browser, same account = one JWT cookie shared by all tabs. The idle timeout prevents a stale tab from being left open indefinitely

### Login page updates
- "Forgot your password?" link below the password field → `/forgot-password`
- Green success banner shown when `?message=password-reset` is in the URL

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

## Sitting Builder `/sitting-builder`

**File:** `src/app/sitting-builder/page.tsx`
**Who can access:** SCHOOL_ADMIN only.
**Purpose:** Build and manage a sitting — configure settings, add/remove papers (exams), view results. Has 3 tabs: Settings, Papers, Results.

### Actions

#### Save Settings (`saveSettingsAction`)
- Updates sitting title, academic year, status.

#### Add Existing Paper (`addExistingPaperAction`)
- Links an existing exam to the sitting. Checks for duplicates, assigns sort_order.

#### Create New Paper (`createPaperAction`)
- Creates a new exam (DRAFT) and links it to the sitting. Validates course is ACTIVE, teacher has TEACHER role. Auto-assigns teacher to course_teachers.

#### Remove Paper (`removePaperAction`)
- Removes exam from sitting (deletes from `exam_sitting_papers`).

### Business rules
- Papers table shows gate badges (Q/G/R) with approver counts
- "Set Approvals" link per paper goes to gate settings page
- "Edit" link per paper goes to exam builder

---

## Sitting Gate Settings `/sitting-gate-settings`

**File:** `src/app/sitting-gate-settings/page.tsx`
**Who can access:** SCHOOL_ADMIN only.
**Purpose:** Assign approvers to QUESTIONS, GRADING, RESULTS gates for a specific paper in a sitting.

### What the user sees

Per gate (3 cards): Active/Inactive badge, assigned approvers with Remove button, "Disable Gate" button (removes all approvers at once), "Add approver" form with course + role filters.

### Actions

#### Add Approver (`addApproverAction`)
- Validates user is active member. Prevents duplicates. Inserts into `sitting_approval_gates`.

#### Remove Approver (`removeApproverAction`)
- Deletes from gates + deletes pending response if exists.

#### Disable Gate (`disableGateAction`)
- Bulk-deletes all approvers + all pending responses for the gate in one action.

### Business rules
- ApproverFilter client component provides instant course + role filtering (no page reload)
- Approver dropdown excludes already-assigned users

---

## Approval Inbox `/approvals`

**File:** `src/app/approvals/page.tsx`
**Who can access:** Any user with pending approval assignments (teachers, school admins).
**Purpose:** View and respond to pending gate approvals.

### What the user sees

1. **Pending items** — exam title, sitting title, gate type badge, submitter name, "View exam →" link, note textarea, Approve/Reject buttons
2. **Recent responses** — table of past approvals/rejections with date and note

### Actions

#### Respond (`respondAction`)
- Validates user is assigned approver. Upserts response (APPROVED/REJECTED with optional note).

### Business rules
- "View exam →" links to `/exam-preview` for QUESTIONS/RESULTS gates, `/exam-grade` for GRADING gate
- Pending items query fetches first_submitted_attempt for grading link

---

## Exam Builder `/exam-builder`

**File:** `src/app/exam-builder/page.tsx`
**Who can access:** TEACHER (owns course) or SCHOOL_ADMIN.
**Purpose:** Build and manage an exam — settings, questions, publish, access control, results, approvals. Has 7 tabs.

### Tab 1 — Settings

Edit form with 16 fields: title, description, duration, max attempts, score display, pass mark %, shuffle questions, shuffle options, show marks during, allow review, navigation mode (FREE/SEQUENTIAL), results release policy (MANUAL/IMMEDIATE/AFTER_CLOSE), opens at, closes at, late submission policy, exam password. Locked when PUBLISHED or CLOSED.

### Tab 2 — Questions

- Question list with type badge, marks, partial marking badge, options preview
- Reorder (↑/↓), Edit, Delete buttons per question
- **Add New Question form** (QuestionForm client component): supports MCQ, Multiple Select, True/False, Short Answer, Essay. Dynamic option adding/removing, per-option feedback, model answer, general feedback, partial marking toggle.
- **Question Bank link** — secondary option to add from bank
- Auto-saves to question bank (PERSONAL) on create/edit

### Tab 3 — Preview

Link to `/exam-preview?exam_id=X` (separate page, not inline).

### Tab 4 — Publish

- DRAFT → Publish button (requires ≥1 question, sets published_by, auto-releases results if policy=IMMEDIATE)
- PUBLISHED → Close button (auto-releases results if policy=AFTER_CLOSE)
- CLOSED → informational message

### Tab 5 — Access

- Current access list with Remove button per student
- Add by class (bulk — all students in class)
- Add by course enrollment (bulk — all enrolled students)
- Add individual student (validates STUDENT role)
- All INSERTs include `added_by` for audit trail

### Tab 6 — Results

- Full submission table — one row per attempt
- Columns: student name, custom field answers, attempt number, grading status, score, percentage, grade, pass/fail, time taken, submitted at
- Summary block: total submissions, in progress, needs grading, average score
- Filters: grading status, pass/fail (client-side, via ResultsTable client component)
- Sortable columns: name, score, %, time, submitted (client-side)
- Export CSV button → GET /exam-results-csv?exam_id=X
- Grade button → /exam-grade?attempt_id=X&exam_id=Y for AUTO_GRADED attempts
- View button → /exam-grade?attempt_id=X&exam_id=Y&view=1 for FULLY_GRADED attempts
- Release Results button (sets `results_published_at`)

### Tab 7 — Approvals (conditional)

Only shown if exam has approval gates configured. Shows per-gate status with approver responses and "Submit for Approval" button.

---

## Exam Preview `/exam-preview`

**File:** `src/app/exam-preview/page.tsx`
**Who can access:** TEACHER, SCHOOL_ADMIN, system admin, or assigned approver.
**Purpose:** Read-only preview of exam questions. Also serves as the approver review interface.

### Two modes

**Preview Mode** (default): Shows all questions with correct answers highlighted in green, model answers, feedback. For teacher verification.

**Approver Review Mode** (auto-detected): When user has a PENDING gate response, shows questions with per-question comment textareas, other approvers' comments, and Approve/Reject form at bottom. Comments saved to `sitting_approval_comments`.

### Business rules
- Teachers/admins see all approval comments in read-only mode
- Approvers can only see comments from their gate
- Access check allows assigned approvers (not just teachers/admins)

---

## Exam Bank Picker `/exam-bank-picker`

**File:** `src/app/exam-bank-picker/page.tsx`
**Who can access:** TEACHER or SCHOOL_ADMIN.
**Purpose:** Browse the question bank and add questions to an exam.

### What the user sees

1. **Filter bar** — text search, type filter (MCQ/True-False/etc.), visibility filter (All/My questions/School questions)
2. **Question cards** — type badge, marks, Personal/School label, creator name (for shared questions), "Already added" badge, Add to Exam button
3. **Question count** — "X questions found" below filters

### Actions

#### Add Bank Question (`addBankQuestionToExamAction`)
- Copies question + options from bank to exam. Sets `bank_question_id` link. Puts at end of sort order.

### Business rules
- Teachers see own PERSONAL questions + all SCHOOL-visible questions
- WHERE clause: `(created_by=? OR visibility='SCHOOL')`
- Questions already in exam show "Already added" badge but can still be added again

---

## Question Bank `/question-bank`

**File:** `src/app/question-bank/page.tsx`
**Who can access:** TEACHER or SCHOOL_ADMIN.
**Purpose:** Manage personal/shared question library. Create, edit, delete, and share bank questions.

### What the user sees

1. **Filter bar** — type filter (All/MCQ/True-False/etc.), visibility filter (All/My questions/School questions)
2. **Question cards** — type badge, marks, PERSONAL/SCHOOL label, owner name, question text preview, options preview for choice types
3. **Owner-only actions** — Edit, Delete, Share toggle (PERSONAL↔SCHOOL) buttons only shown for questions you created
4. **Read-only label** — "Shared by [name]" shown for other teachers' SCHOOL-visible questions

### Actions

#### Create Question (`createBankQuestionAction`)
- Creates bank question with type, text, marks, model answer, visibility (PERSONAL or SCHOOL). Supports all 5 question types with options.

#### Edit Question (`editBankQuestionAction`)
- Updates existing bank question. Owner-only. Deletes and re-inserts options.

#### Delete Question (`deleteBankQuestionAction`)
- Deletes bank question + options. Owner-only (tenant-scoped).

#### Toggle Visibility (`toggleVisibilityAction`)
- Toggles between PERSONAL and SCHOOL visibility. Owner-only.

### Business rules
- Visibility: PERSONAL (only creator sees it) or SCHOOL (all teachers in school)
- Questions created inline in exam builder auto-save here as PERSONAL
- Full CRUD: create, edit, delete (owner-only actions)
- Share toggle allows teachers to make questions available school-wide

---

## ✏️ Grading Screen `/exam-grade`

**File:** `src/app/exam-grade/page.tsx`
**Who can access:** TEACHER (owns course) or SCHOOL_ADMIN.
**Purpose:** View and grade student exam submissions. Three modes: grade, view, approver review.

### What the user sees

- Shows ALL questions ordered by sort_order (original teacher order)
- MCQ/True-False/Multiple Select — read only, shows student answer with green/red/amber highlighting
- Short Answer/Essay — student answer, model answer, score input, teacher note field
- Desktop: two-column layout — questions left, sticky sidebar right
- Sidebar (grade mode): lists ungraded manual questions, score summary, Save Grades button
- Sidebar (view mode): score summary card with raw score, percentage, grade, pass/fail
- Mobile: floating button opens drawer showing ungraded questions (MobileGradingDrawer client component)
- view=1 mode — fully read-only, used for FULLY_GRADED attempts
- Approver mode — auto-detected when viewer is GRADING gate approver with PENDING response. Shows approver banner, per-question comment boxes, Approve/Reject form at bottom.
- Gate decision banner in view mode — shows approved/rejected status with approver name and note
- Context-aware back link — approvers → /approvals, teachers/admins → /exam-builder results tab
- On save: full recalcAttempt logic including grade band calculation, redirects to results tab

### Actions

#### Grade Submission (`gradeAction`)
- Reads score and note per manual question from form
- Clamps score to [0, question.marks]
- Updates exam_answers with score_awarded, teacher_note, graded_by, graded_at
- Runs full recalcAttempt: recalculates score_raw, score_total, score_pct, grade (from grade_bands_json), grading_status
- Redirects to /exam-builder results tab

#### Approver Review (`gradingReviewRespondAction`)
- Saves per-question comments (upsert into sitting_approval_comments)
- Updates sitting_approval_responses status to APPROVED or REJECTED with optional note
- Redirects to /approvals

### Business rules
- Grade mode only available for AUTO_GRADED attempts (not view=1)
- Approver mode auto-detected server-side from sitting_approval_gates + responses
- answer_json parsed correctly: single ID for MCQ/TRUE_FALSE, array for MULTIPLE_SELECT, text for SHORT_ANSWER/ESSAY
- Grade bands read from attempt's snapshotted grade_bands_json (not exam table)
- grading_status set to FULLY_GRADED only when ALL manual questions have scores

---

*More pages will be added to this document as they are reviewed. Last updated: 2026-03-29 — Login, logout, idle timeout, and security features added.*
