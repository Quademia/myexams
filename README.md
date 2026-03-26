# QAcademy Beta-B — Stack Migration Complete

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
    setup/page.tsx
    join/page.tsx
    profile/page.tsx
    choose-school/page.tsx
    switch-school/route.ts
    no-access/page.tsx
    health/route.ts
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

## All Routes

### Auth & Navigation

| Route | Description | Status |
|---|---|---|
| `/` | Smart redirect — role-based routing to correct dashboard | ✅ Verified |
| `/login` | Email + password login, session cookie | ✅ Verified |
| `/logout` | Destroys session, redirect to login | ✅ Verified |
| `/setup` | First-time platform setup — creates System Admin | ✅ Verified 2026-03-26 |
| `/profile` | View profile, change password | ✅ Verified |
| `/no-access` | Shown when user has no school memberships | ✅ Verified |
| `/choose-school` | Pick active school (multi-school users) | ✅ Verified |
| `/switch-school` | Sets active tenant for session, redirects to `/` | ✅ Verified 2026-03-26 |
| `/join` | Public join code entry — login or create account inline | ✅ Verified |
| `/health` | Diagnostic route — DB connectivity, response time, timestamp | ✅ Verified 2026-03-26 |

---

### System Admin

| Route | Description | Status |
|---|---|---|
| `/sys` | Create schools, search users, manage memberships | ✅ Verified 2026-03-24 |

---

### School Admin

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
| `/sitting-results` | Student's view of results across all papers in a sitting | ✅ Verified |
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
| `/teacher` | Teacher dashboard — exam list, courses, create exam, pending approval banner | ✅ Verified 2026-03-26 |

---

### Student

| Route | Description | Status |
|---|---|---|
| `/student` | Student dashboard — exams, sittings, attempt tracking | ✅ Verified 2026-03-25 |
| `/attempt-start` | Exam lobby — info + start button | ✅ Verified 2026-03-26 |
| `/attempt-take` | Live exam-taking interface — timer, autosave, FREE/SEQUENTIAL modes, question grid, flagging, submit | ✅ Verified 2026-03-25 |
| `/attempt-complete` | Post-submission confirmation screen | ✅ Verified 2026-03-26 |
| `/attempt-review` | Answer review with correct answers, option feedback, model answers, teacher notes | ✅ Verified 2026-03-26 |
| `/attempt-results` | View scored attempt results | ✅ Verified 2026-03-26 |
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

### ✅ Verified & Fixed — 2026-03-25

- Questions tab — full rebuild with correct server action architecture. QuestionFormFields client component. All 5 question types, add/edit/delete/reorder, partial marking, model answer, per-option feedback, bank auto-save, From Bank badge, locked state for published exams
- Question bank page — full rebuild: create, edit, delete, share toggle (PERSONAL↔SCHOOL), type and visibility filters, owner-only actions, read-only label for non-owners
- Question Bank link — added to teacher dashboard header
- Results tab — full rebuild: summary cards (Total Submitted, In Progress, Needs Grading, Avg Score), client-side filtering and sorting, all columns (custom fields, attempt #, grade, pass/fail, time taken), correct Grade/View button logic, CSV export link
- CSV export route — new GET handler at `/exam-results-csv` with correct columns, CSV escaping, Content-Disposition header
- Grading page — full rebuild: two-column desktop layout, sidebar showing ungraded questions, view=1 read-only mode, approver mode (GRADING gate), grade band recalculation, context-aware back link, mobile drawer, gate decision banner
- `/attempt-take` — TypeScript strict mode error fixed; page now loads correctly in production
- Student dashboard — multiple attempts button logic fixed
- Grading page (`/exam-grade`) — Save Grades button fix, live sidebar via `GradingEngine` client component

### ✅ Verified & Fixed — 2026-03-26

- `/setup` — built and verified: zero-user guard, form, PBKDF2 hashing, system admin creation, redirect to login
- `/switch-school` — built as route handler: validates membership, calls `setActiveTenant()`, redirects to `/`
- `/join-login` and `/join-create-account` — confirmed not needed as separate routes; both flows handled inline on `/join` via Server Actions
- `/health` — built with DB connectivity check, response time measurement, and timestamp
- Teacher flow — verified end-to-end: login → dashboard → create exam → publish → view results
- Student flow — verified end-to-end: attempt-start → attempt-take → attempt-complete → attempt-results → attempt-review

---

## Next Plan

The migration is complete. All routes are built and verified. Development continues on the new stack.

### Deferred from migration — carry forward
- Confirm dialogs on destructive actions — needs client-side `ConfirmButton` component
- Sequential question navigation in exam preview — needs client-side state
- Remove `/setup` link from login page before real production launch — confusing for students and teachers once the platform has live schools
- Exam preview and exam builder may error when accessed as system admin without an active school — needs more testing and a clean fix

### Future capabilities — when the time is right
These are not immediate priorities. They will be picked up as the platform grows:

- Drawer panels — `StudentDrawer`, `TeacherDrawer` opened from any page without leaving context
- Drag-to-reorder questions — real-time in the exam builder
- Live filtering — filter tables without page reloads
- Question Bank Bulk Import — CSV/Excel upload
- UI & Design Polish — one focused design sprint across the whole platform
- PWA installability — desktop and mobile
- School identity features — logo, brand colour, custom domain

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

- **Logic before design** — all features built correctly first, then one focused design sprint
- **Flat file structure** — all pages flat in `src/app/`, no subfolders beyond the page itself
- **No third-party auth** — custom PBKDF2, 40,000 iterations, pepper from `APP_SECRET`
- **Tenant isolation** — every DB query includes `tenant_id`
- **Status fields uppercase** — `DRAFT`, `PUBLISHED`, `ACTIVE`, `CLOSED`, `SUBMITTED`, etc.
- **Sittings are grouping only** — QAcademy delivers individual paper results; no combined sitting scores
- **Exam access is explicit** — `exam_access` table is the single source of truth; course enrolment is organisational only
- **Branch discipline** — always commit and push directly to `main`; never create a new branch
- **Full file rewrites preferred** — over partial patches when multiple files need to stay in sync
