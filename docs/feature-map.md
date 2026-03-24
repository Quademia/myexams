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

*More pages will be added to this document as they are reviewed.*
