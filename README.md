# QAcademy Beta-B — Stack Migration

*This is the Next.js migration of QAcademy Beta. The original app (`qacademy-beta`) remains untouched as a safety net.*

---

## What Is This Project

A **multi-tenant exam taking platform for schools.**
- Schools sign up and get their own isolated space
- Teachers create and manage exams
- Students take exams and view results
- Admins manage users and publish results
- Built to be simple, affordable, and work well in low-resource school environments
- **Beta's identity: exams are the core product, not quizzes. Everything is designed around formal exam running.**

---

## The Person Building This

- **Role:** Product Manager — no coding background
- **Approach:** Claude writes all the code, user describes features and tests them
- **Pace:** Learning as we go — explanations needed alongside code

---

## Stack Migration Summary

### What Changed

| | Old Stack (`qacademy-beta`) | New Stack (`qacademy-beta-b`) |
|---|---|---|
| **UI rendering** | Raw HTML template literals in JS | React components (JSX/TSX) |
| **Framework** | None — manual routing | Next.js 16 with App Router |
| **Routing** | Giant if-chain in `[[path]].js` | File-based: `src/app/<route>/page.tsx` |
| **Styling** | Inline `style=""` attributes | Tailwind CSS utility classes |
| **Language** | JavaScript | TypeScript |
| **Components** | Copy-pasted HTML on every page | Reusable components (`Card`, `TabNav`, `DataTable`, etc.) |
| **Form handling** | Separate POST routes | Server Actions (`"use server"`) |
| **Hosting** | Cloudflare Pages | Cloudflare Workers (via OpenNext) |
| **Database** | D1 (`beta_db`) | D1 (`beta_b_db`) — separate copy |
| **Deployment** | Auto-deploy from GitHub → Pages | GitHub Actions → build on Linux → `wrangler deploy` |

### What Stayed The Same

- **Database schema** — identical, no changes
- **Business logic** — same SQL queries, same auth flow, same rules
- **Authentication** — same PBKDF2 password hashing, same session cookies
- **D1 + Cloudflare** — still the database and hosting platform

### Why Linux Build?

OpenNext (the adapter that runs Next.js on Cloudflare Workers) has Windows path issues that cause 500 errors at runtime. The GitHub Actions workflow builds on Ubuntu, avoiding this entirely. Local development uses `npm run dev` (Next.js dev server) which works fine on Windows.

---

## Tech Stack

| Layer | Tool |
|---|---|
| Frontend Framework | Next.js 16 (React, TypeScript) |
| CSS | Tailwind CSS v4 |
| Backend Runtime | Cloudflare Workers |
| Adapter | OpenNext for Cloudflare (`@opennextjs/cloudflare`) |
| Database | Cloudflare D1 (SQLite) — `beta_b_db` |
| Auth | Custom (PBKDF2 + session cookies) |
| Repository | GitHub (`mybackpacc-byte/qacademy-beta-b`) |
| CI/CD | GitHub Actions → build on Linux → wrangler deploy |
| Live URL | `https://qacademy-beta-b.mybackpacc.workers.dev` |

---

## Repository Structure
```
src/
  app/                        ← Pages (file-based routing)
    login/page.tsx
    logout/route.ts
    join/page.tsx
    profile/page.tsx
    choose-school/page.tsx
    no-access/page.tsx
    sys/page.tsx
    school/page.tsx
    school-courses/page.tsx
    school-course/page.tsx
    school-classes/page.tsx
    school-class/page.tsx
    school-people/page.tsx
    school-join-codes/page.tsx
    school-sittings/page.tsx
    sittings/page.tsx
    sitting-builder/page.tsx
    sitting-gate-settings/page.tsx
    sitting-results/page.tsx
    exam-builder/page.tsx
    exam-create/route.ts
    exam-preview/page.tsx
    exam-grade/page.tsx
    exam-bank-picker/page.tsx
    exam-results-csv/route.ts
    question-bank/page.tsx
    student/page.tsx
    teacher/page.tsx
    approvals/page.tsx
    api/attempt-take/route.ts
    attempt-start/page.tsx
    attempt-take/page.tsx
    attempt-complete/page.tsx
    attempt-review/page.tsx
    attempt-results/page.tsx

  components/
    Card.tsx
    TabNav.tsx
    DataTable.tsx
    PageHeader.tsx
    SchoolLayout.tsx
    QuestionForm.tsx
    QuestionFormFields.tsx
    GradingEngine.tsx
    GradeBandsEditor.tsx
    CustomFieldsEditor.tsx
    ApproverFilter.tsx
    BankQuestionForm.tsx
    BankQuestionFormFields.tsx
    PreviewToggle.tsx

  lib/
    db.ts
    auth.ts
    env.ts

functions/                     ← OLD code (reference only, not used by Next.js)
db/
  schema.sql
docs/
  Qacademy beta proposed new stack.md
  feature-map.md
  school-admin-gaps.md

.github/workflows/
  deploy.yml

wrangler.jsonc
open-next.config.ts
next.config.ts
tsconfig.json
postcss.config.mjs
CLAUDE.md
```

---

## All Routes — Migration Status

### Legend
- ✅ Verified — built and confirmed correct against old build
- 🔲 Unverified — exists in new build but not yet formally tested end-to-end
- ❓ Unknown — presence in new build not confirmed; needs checking

---

### Auth & Navigation

| Route | Description | Status |
|---|---|---|
| `/` | Smart redirect — role-based routing to correct dashboard | ✅ Verified |
| `/login` | Email + password login, session cookie | ✅ Verified |
| `/logout` | Destroys session, redirect to login | ✅ Verified |
| `/profile` | View profile, change password | ✅ Verified |
| `/no-access` | Shown when user has no school memberships | ✅ Verified |
| `/choose-school` | Pick active school (multi-school users) | ✅ Verified |
| `/setup` | First-time platform setup — creates System Admin | ❓ Unknown — not in route table, needs file check |
| `/switch-school` | Sets active tenant for session, redirects to `/` | ❓ Unknown — not in route table, needs file check |
| `/join` | Public join code entry — handles logged-in users | ✅ Verified |
| `/join-login` | Join flow step 2 — login then process join code | ❓ Unknown — not in route table, needs file check |
| `/join-create-account` | Join flow step 3 — create account then process join code | ❓ Unknown — not in route table, needs file check |
| `/health` | Diagnostic route — DB ping + user count | ❓ Unknown — low priority |

---

### System Admin

| Route | Description | Status |
|---|---|---|
| `/sys` | Create schools, search users, manage memberships | ✅ Verified 2026-03-24 |

---

### School Admin (8 pages)

| Route | Description | Status |
|---|---|---|
| `/school` | Overview dashboard — stats + pending approval banner | ✅ Verified 2026-03-24 |
| `/school-courses` | Course list + create | ✅ Verified 2026-03-24 |
| `/school-course` | Course detail — 5 tabs: Details, Teachers, Students, Classes, Join Codes | ✅ Verified 2026-03-24 |
| `/school-classes` | Class list + create | ✅ Verified 2026-03-24 |
| `/school-class` | Class detail — 3 tabs: Details, Students, Courses | ✅ Verified 2026-03-24 |
| `/school-people` | 2 tabs: Members (with filters) + Add Person (email check) | ✅ Verified 2026-03-24 |
| `/school-join-codes` | 3 sections: Active Codes, Create Code, Pending Requests | ✅ Verified 2026-03-24 |
| `/school-sittings` | Sittings list + create | ✅ Verified 2026-03-24 |

---

### Sittings & Approvals

| Route | Description | Status |
|---|---|---|
| `/sittings` | Standalone sittings management page | ✅ Verified 2026-03-24 |
| `/sitting-builder` | 3 tabs: Settings, Papers (with gate badges), Results | ✅ Verified 2026-03-24 |
| `/sitting-gate-settings` | Assign approvers to QUESTIONS / GRADING / RESULTS gates | ✅ Verified 2026-03-24 |
| `/sitting-results` | Student's view of their results across all papers in a sitting | ✅ Verified (file confirmed) |
| `/approvals` | Approval inbox — pending gates, approve/reject with notes | ✅ Verified 2026-03-24 |
| `/exam-preview` | Read-only preview for teachers; approver review mode for QUESTIONS/RESULTS gates | ✅ Verified 2026-03-24 |

---

### Exams & Grading

| Route | Description | Status |
|---|---|---|
| `/exam-builder` | 7 tabs: Settings, Questions, Preview, Publish, Access, Results, Approvals | ✅ Verified 2026-03-24 + 2026-03-25 |
| `/exam-create` | POST — creates exam, redirects to builder | ✅ Verified |
| `/exam-grade` | Grading interface: grade / view=1 read-only / approver GRADING gate mode. Two-column desktop layout, live GradingEngine client component | ✅ Verified 2026-03-25 |
| `/exam-results-csv` | GET — CSV export of exam results | ✅ Verified 2026-03-25 |
| `/exam-bank-picker` | Pick questions from bank to add to exam | ✅ Verified 2026-03-24 |

---

### Question Bank

| Route | Description | Status |
|---|---|---|
| `/question-bank` | Full CRUD, share toggle (PERSONAL↔SCHOOL), type and visibility filters, owner-only actions | ✅ Verified 2026-03-25 |

---

### Teacher

| Route | Description | Status |
|---|---|---|
| `/teacher` | Teacher dashboard — exam list, courses, create exam, pending approval banner | 🔲 Unverified — built but full end-to-end flow not confirmed |

---

### Student

| Route | Description | Status |
|---|---|---|
| `/student` | Student dashboard — exams, sittings, attempt tracking | ✅ Verified 2026-03-25 |
| `/attempt-start` | Exam lobby — info + start button | 🔲 Unverified — built but not formally end-to-end tested |
| `/attempt-take` | Live exam-taking interface — timer, autosave, FREE/SEQUENTIAL modes, question grid, flagging, submit | ✅ Verified 2026-03-25 (TypeScript fix applied) |
| `/attempt-complete` | Post-submission confirmation screen | 🔲 Unverified — built but not formally end-to-end tested |
| `/attempt-review` | Answer review with correct answers, option feedback, model answers, teacher notes | 🔲 Unverified — built but not formally end-to-end tested |
| `/attempt-results` | View scored attempt results | 🔲 Unverified — built but not formally end-to-end tested |
| `/api/attempt-take` | POST API — autosave answers + final submit with auto-grading | ✅ Verified 2026-03-25 |

---

## Reusable Components

| Component | What It Does | Where Used |
|---|---|---|
| `Card` | White rounded box wrapping content | Every page |
| `TabNav` | Tab bar for switching sections | Courses (5 tabs), classes (3), people (2), sitting builder (3), exam builder (7) |
| `DataTable` | Table with headers, rows, empty state | Available for any table |
| `PageHeader` | Title + optional back link | Course detail, class detail |
| `SchoolLayout` | Header (school name, role, links) + nav bar | All 8 `/school-*` pages |
| `QuestionForm` | Question create/edit shell with bank auto-save | Exam builder Questions tab |
| `QuestionFormFields` | All 5 question types, options, per-option feedback, partial marking | Exam builder, question bank |
| `GradingEngine` | Live reactive sidebar, running score total, mobile FAB | `/exam-grade` |
| `GradeBandsEditor` | Add/edit/delete grade bands | Exam builder Settings tab |
| `CustomFieldsEditor` | Add/edit/delete custom result fields | Exam builder Settings tab |
| `ApproverFilter` | Client-side course + role filtering on approver selection | `/sitting-gate-settings` |
| `BankQuestionForm` | Create/edit question bank entries | `/question-bank` |
| `BankQuestionFormFields` | Shared form fields for bank questions | `/question-bank`, bank picker |
| `PreviewToggle` | Toggle between question types in preview | `/exam-preview` |

---

## Migration Progress Log

### ✅ Verified & Fixed — 2026-03-24

- System admin (`/sys`) — fully migrated, documented in `docs/feature-map.md`
- School admin — all 8 pages verified against old code, 15 of 16 gaps fixed (see `docs/school-admin-gaps.md`)
- Enrollments table — added `id`, `tenant_id`, `status`, `updated_at` columns
- Join codes — 7 fixes: dates, validation, history, empty states
- People — self-removal protection, email check auth, tooltip
- Classes — enrol-class-in-course functional after schema upgrade
- Sittings & Approvals — all 9 gaps fixed: paper creation, teacher dropdown, gate disable, approval comments, question preview, exam grade link, course_teachers assignment, validations
- Approver filter — client-side course + role filtering on gate settings page
- Exam builder — 7 critical fixes across all tabs:
  - Settings: 5 missing columns restored, time_limit_minutes bug fixed, all settings save correctly
  - Questions: QuestionForm client component built with MCQ options, per-option feedback, partial marking, all 5 question types
  - Access: added_by NOT NULL fix, class/student validation, closed exam protection
  - Publish: published_by, question count check, results_release_policy (IMMEDIATE/AFTER_CLOSE)
  - Close: results_release_policy auto-release on AFTER_CLOSE
- Exam preview — time_limit_minutes crash fixed, approver mode with per-question comments working
- Bank picker — crash fixed (wrong column name), visibility filter added, creator names, Personal/School labels, WHERE clause matches old code
- Question bank — auto-save to bank on inline question create/edit, PRIVATE→PERSONAL visibility fix

### ✅ Verified & Fixed — 2026-03-25 (session 1)

- Questions tab — full rebuild with correct server action architecture. QuestionFormFields client component. All 5 question types, add/edit/delete/reorder, partial marking, model answer, per-option feedback, bank auto-save, From Bank badge, locked state for published exams
- Question bank page — full rebuild: create, edit, delete, share toggle (PERSONAL↔SCHOOL), type and visibility filters, owner-only actions, read-only label for non-owners
- Question Bank link — added to teacher dashboard header
- Results tab — full rebuild: summary cards (Total Submitted, In Progress, Needs Grading, Avg Score), client-side filtering and sorting, all columns (custom fields, attempt #, grade, pass/fail, time taken), correct Grade/View button logic, CSV export link
- CSV export route — new GET handler at `/exam-results-csv` with correct columns, CSV escaping, Content-Disposition header
- Grading page — full rebuild: two-column desktop layout, sidebar showing ungraded questions, view=1 read-only mode, approver mode (GRADING gate), grade band recalculation, context-aware back link, mobile drawer, gate decision banner

### ✅ Verified & Fixed — 2026-03-25 (session 2)

- `/attempt-take` — TypeScript strict mode error fixed (`res.json()` typed as `unknown`); page now loads correctly in production
- Student dashboard — multiple attempts button logic fixed: students with attempts remaining now correctly see both "Start Exam" and prior "View Results" buttons simultaneously
- Grading page (`/exam-grade`) — two issues fixed:
  - Save Grades button was hidden on desktop (was outside the form and marked `hidden`); moved into form via `GradingEngine` client component
  - Sidebar "Needs Grading" list was static (server-rendered only); now updates live as teacher enters scores, with live running score total and mobile FAB updates
- `GradingEngine.tsx` — new client component created to own all grading interactivity

---

## What's Still Needed

### ❓ Unknown — Needs File Check First

These routes exist in the old build but were not listed in the new build's route table. Before building anything, check whether the files already exist in `src/app/`:

| Route | Why It Matters |
|---|---|
| `/setup` | Critical — without this, a fresh deployment cannot create its first System Admin |
| `/switch-school` | Important — multi-school users cannot switch between schools without this |
| `/join-login` | Critical — the join flow breaks for users who aren't logged in |
| `/join-create-account` | Critical — new users cannot create an account via join code without this |
| `/health` | Low priority — diagnostic only |

### 🔲 Unverified — Built But Not Tested End-to-End

These routes appear to be built but have not been formally walked through:

| Route | What to Test |
|---|---|
| `/teacher` | Full teacher flow: login → dashboard → create exam → publish → view results |
| `/attempt-start` | Student sees lobby, info is correct, start button works |
| `/attempt-complete` | Post-submit screen appears with correct messaging |
| `/attempt-review` | All question types show answers, feedback, model answers correctly |
| `/attempt-results` | Scored results display correctly, grade/pass-fail shown |

### Deferred to Phase 2

- **Confirm dialogs on destructive actions** (#SA-12) — needs client-side `ConfirmButton` component
- **Sequential question navigation in preview** — needs client-side state

---

## Known Issues

- Exam preview and exam builder may error when accessed as system admin without an active school — partially fixed, needs more testing

---

## Phase 2 — New Capabilities (After Migration Complete)

Once all existing logic is verified, these features use React's client-side capabilities that were not possible in the old stack:

1. **Drawer panels** — `StudentDrawer`, `TeacherDrawer` opened from any page without leaving context
2. **Drag-to-reorder questions** — real-time in the exam builder
3. **Live filtering** — filter tables without page reloads
4. **Question Bank Bulk Import** — CSV/Excel upload
5. **UI & Design Polish** — one focused design sprint across the whole platform; PWA installability; school identity features (logo, brand colour, custom domain)

---

## Database Tables

### Core tables
| # | Table | Purpose |
|---|---|---|
| 1 | `tenants` | Schools |
| 2 | `users` | All people |
| 3 | `sessions` | Login sessions (includes `active_tenant_id`) |
| 4 | `memberships` | User ↔ school ↔ role |
| 5 | `courses` | Subjects within a school |
| 6 | `course_teachers` | Teacher ↔ course |
| 7 | `enrollments` | Student ↔ course (upgraded: `id`, `tenant_id`, `status`, `updated_at`) |
| 8 | `join_codes` | Invite codes |
| 9 | `join_requests` | Pending join approvals |
| 10 | `classes` | Class groups within a school |
| 11 | `class_students` | Student ↔ class |

### Exam tables
| # | Table | Purpose |
|---|---|---|
| 12 | `exams` | Exam metadata + all settings |
| 13 | `exam_grade_bands` | Grade band rows per exam |
| 14 | `exam_custom_fields` | Custom result fields per exam |
| 15 | `exam_questions` | Questions per exam |
| 16 | `exam_options` | Answer options per question |
| 17 | `exam_access` | Which students/classes/courses can access each exam |
| 18 | `exam_attempts` | Student attempts |
| 19 | `exam_answers` | Per-question answers per attempt |
| 20 | `exam_sittings` | Sitting groupings |
| 21 | `exam_sitting_papers` | Exam ↔ sitting link |
| 22 | `sitting_approval_gates` | Approver assignments per gate per exam |
| 23 | `sitting_approval_responses` | Approver decisions (PENDING/APPROVED/REJECTED) |
| 24 | `sitting_approval_comments` | Per-question approver comments (nullable `attempt_id` for GRADING gate) |
| 25 | `question_bank` | Shared/personal question bank entries |

---

## Important Decisions & Principles

- **Logic before design** — all features built correctly first, then one focused design sprint (Phase 2)
- **Flat file structure** — all pages flat in `src/app/`, no subfolders beyond the page itself
- **No third-party auth** — custom PBKDF2, 40,000 iterations, pepper from `APP_SECRET`
- **Tenant isolation** — every DB query includes `tenant_id`
- **Status fields uppercase** — `DRAFT`, `PUBLISHED`, `ACTIVE`, `CLOSED`, `SUBMITTED`, etc.
- **Sittings are grouping only** — QAcademy delivers individual paper results; no combined sitting scores
- **Exam access is explicit** — `exam_access` table is the single source of truth; course enrolment is organisational only
- **Branch discipline** — always commit and push directly to `main`; never create a new branch
- **Full file rewrites preferred** — over partial patches when multiple files need to stay in sync
