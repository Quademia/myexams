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
    login/page.tsx             ← /login
    logout/route.ts            ← /logout (route handler, not a page)
    join/page.tsx              ← /join (public join code entry)
    profile/page.tsx           ← /profile
    choose-school/page.tsx     ← /choose-school
    no-access/page.tsx         ← /no-access
    sys/page.tsx               ← /sys (system admin)
    school/page.tsx            ← /school (admin overview)
    school-courses/page.tsx    ← /school-courses (list)
    school-course/page.tsx     ← /school-course?course_id=X (detail, 5 tabs)
    school-classes/page.tsx    ← /school-classes (list)
    school-class/page.tsx      ← /school-class?class_id=X (detail, 3 tabs)
    school-people/page.tsx     ← /school-people (2 tabs + filters)
    school-join-codes/page.tsx ← /school-join-codes (3 sections)
    school-sittings/page.tsx   ← /school-sittings
    sittings/page.tsx          ← /sittings (standalone)
    sitting-builder/page.tsx   ← /sitting-builder (3 tabs)
    sitting-gate-settings/     ← /sitting-gate-settings
    sitting-results/page.tsx   ← /sitting-results (student view)
    teacher/page.tsx           ← /teacher dashboard
    student/page.tsx           ← /student dashboard
    approvals/page.tsx         ← /approvals inbox
    exam-builder/page.tsx      ← /exam-builder (7 tabs)
    exam-create/route.ts       ← POST /exam-create
    exam-preview/page.tsx      ← /exam-preview
    exam-grade/page.tsx        ← /exam-grade
    exam-results-csv/route.ts  ← GET /exam-results-csv (CSV export)
    exam-bank-picker/page.tsx  ← /exam-bank-picker
    question-bank/page.tsx     ← /question-bank
    attempt-start/page.tsx     ← /attempt-start
    attempt-take/page.tsx      ← /attempt-take (placeholder)
    attempt-results/page.tsx   ← /attempt-results

  components/                  ← Reusable UI components
    Card.tsx                   ← White rounded content box
    TabNav.tsx                 ← Tab navigation bar
    DataTable.tsx              ← Generic data table
    PageHeader.tsx             ← Title + back link
    SchoolLayout.tsx           ← Header + nav for all /school-* pages
    ResultsTable.tsx           ← Client component: filterable/sortable results table
    MobileGradingDrawer.tsx    ← Client component: floating button + drawer for mobile grading
    QuestionFormFields.tsx     ← Client component: question form with dynamic options
    GradeBandsEditor.tsx       ← Client component: grade band editor
    CustomFieldsEditor.tsx     ← Client component: custom field editor
    ApproverFilter.tsx         ← Client component: course + role filter for approver selection
    BankQuestionForm.tsx       ← Client component: question bank create/edit form
    BankQuestionFormFields.tsx ← Client component: question bank form fields
    PreviewToggle.tsx          ← Client component: preview mode toggle

  lib/                         ← Shared backend logic
    db.ts                      ← D1 database helpers (first, all, run)
    auth.ts                    ← Session auth, crypto, join code helpers
    env.ts                     ← Environment variables (APP_SECRET)

functions/                     ← OLD code (reference only, not used by Next.js)
db/
  schema.sql                   ← Database schema (shared with original)
docs/
  QAcademy Beta — Admin Restructure Plan.md
  Qacademy beta proposed new stack.md

.github/workflows/
  deploy.yml                   ← GitHub Actions: build on Linux + deploy

wrangler.jsonc                 ← Cloudflare Workers config (D1 binding)
open-next.config.ts            ← OpenNext adapter config
next.config.ts                 ← Next.js config
tsconfig.json                  ← TypeScript config
postcss.config.mjs             ← Tailwind CSS config
CLAUDE.md                      ← Instructions for Claude
```

---

## All Routes (34 total)

### Auth & Navigation (7)
| Route | Description |
|---|---|
| `/` | Smart redirect based on role |
| `/login` | Email + password login |
| `/logout` | Destroy session, redirect |
| `/join` | Public join code entry (login or create account) |
| `/profile` | View profile, change password |
| `/choose-school` | Pick active school (multi-school users) |
| `/no-access` | No school memberships message |

### System Admin (1)
| Route | Description |
|---|---|
| `/sys` | Create schools, search users, manage memberships |

### School Admin (8)
| Route | Description |
|---|---|
| `/school` | Overview dashboard with stats |
| `/school-courses` | Course list + create |
| `/school-course` | Course detail — 5 tabs: Details, Teachers, Students, Classes, Join Codes |
| `/school-classes` | Class list + create |
| `/school-class` | Class detail — 3 tabs: Details, Students, Courses |
| `/school-people` | 2 tabs: Members (with filters) + Add Person (email check) |
| `/school-join-codes` | 3 sections: Active Codes, Create Code, Pending Requests |
| `/school-sittings` | Sittings list + create |

### Sittings (4)
| Route | Description |
|---|---|
| `/sittings` | Standalone sittings management |
| `/sitting-builder` | 3 tabs: Settings, Papers (with gate badges), Results |
| `/sitting-gate-settings` | Assign approvers to QUESTIONS/GRADING/RESULTS gates |
| `/sitting-results` | Student's sitting results view |

### Exams (7)
| Route | Description |
|---|---|
| `/exam-builder` | 7 tabs: Settings, Questions, Preview, Publish, Access, Results, Approvals |
| `/exam-create` | POST handler — creates exam, redirects to builder |
| `/exam-preview` | Read-only exam preview for teachers |
| `/exam-grade` | Grading interface — three modes: grade (score manual questions), view (read-only), approver review (GRADING gate). Two-column desktop layout, mobile drawer. |
| `/exam-results-csv` | GET route — CSV export of exam results with correct columns and Content-Disposition header |
| `/exam-bank-picker` | Pick questions from bank to add to exam |
| `/question-bank` | Question bank management — full CRUD, share toggle (PERSONAL↔SCHOOL), type/visibility filters |

### Student (4)
| Route | Description |
|---|---|
| `/student` | Student dashboard — exams, sittings, attempt tracking |
| `/attempt-start` | Exam lobby — info + start button |
| `/attempt-take` | **Placeholder** — exam-taking interface (needs client-side React) |
| `/attempt-results` | View scored attempt results |

### Other (3)
| Route | Description |
|---|---|
| `/teacher` | Teacher dashboard — exams, courses, create exam |
| `/approvals` | Approval inbox — pending gates, approve/reject with notes |
| `/test` | Test page (can delete) |

---

## Reusable Components

| Component | Used On | Replaces |
|---|---|---|
| `Card` | Every page | `.card` CSS class copy-pasted everywhere |
| `TabNav` | Course detail, class detail, people, sitting builder, exam builder | Tab HTML duplicated per page |
| `DataTable` | Available but most tables are inline for custom rendering | Manual `<table>` HTML |
| `PageHeader` | Course detail, class detail | Title + back link copy-pasted |
| `SchoolLayout` | All `/school-*` pages | `schoolHeader()` + `schoolNav()` duplicated |

---

## What's Still Needed

### Placeholder
- `/attempt-take` — interactive exam-taking interface (timer, question navigation, auto-save). First page that will use React client-side interactivity.

### Known Issues
- Exam preview and exam builder may error when accessed as system admin without active school — partially fixed, needs more testing
- Some pages may need error handling for edge cases in data

### Immediate Priority — Complete the Migration

Before adding new capabilities, all existing logic from the old build must work correctly in the new stack.

**✅ Verified & Fixed (2026-03-24):**
- System admin (`/sys`) — fully migrated, documented in `docs/feature-map.md`
- School admin — all 8 pages verified against old code. 15 of 16 gaps fixed (see `docs/school-admin-gaps.md`)
- Enrollments table upgraded — added `id`, `tenant_id`, `status`, `updated_at` columns
- Join codes — 7 fixes (dates, validation, history, empty states)
- People — self-removal protection, email check auth, tooltip
- Classes — enrol-class-in-course now functional after schema upgrade
- Sittings & Approvals — all 9 gaps fixed (paper creation, teacher dropdown, gate disable, approval comments, question preview, exam grade link, course_teachers assignment, validations)
- Approver filter — client-side course + role filtering on gate settings page
- Exam builder — 7 critical fixes across all tabs:
  - Settings: 5 missing columns restored, time_limit_minutes bug fixed, all settings now save correctly
  - Questions: add/edit question form built with QuestionForm client component (MCQ options, per-option feedback, partial marking, all 5 question types)
  - Access: added_by NOT NULL fix, class/student validation, closed exam protection
  - Publish: published_by, question count check, results_release_policy (IMMEDIATE/AFTER_CLOSE)
  - Close: results_release_policy auto-release on AFTER_CLOSE
- Exam preview — time_limit_minutes crash fixed, approver mode with comments working
- Bank picker — fixed crash (wrong column name), added visibility filter, creator names, Personal/School labels, WHERE clause matches old code
- Question bank — auto-save to bank on inline question create/edit, PRIVATE→PERSONAL visibility fix

**✅ Verified & Fixed (2026-03-25):**
- Questions tab — full rebuild from scratch with correct server action architecture (no server actions as props). QuestionFormFields client component. All 5 question types, add/edit/delete/reorder, partial marking, model answer, per-option feedback, bank auto-save, From Bank badge, locked state for published exams.
- Question bank page — full rebuild. Create, edit, delete, share toggle (PERSONAL↔SCHOOL), type and visibility filters, owner-only actions, read-only label for non-owners.
- Question Bank link — added to teacher dashboard header
- Results tab — full rebuild with summary cards (Total Submitted, In Progress, Needs Grading, Avg Score), client-side filtering and sorting, all columns (custom fields, attempt #, grade, pass/fail, time taken), correct Grade/View button logic, CSV export link
- CSV export route — new GET handler at /exam-results-csv with correct columns, CSV escaping, Content-Disposition header
- Grading page — full rebuild: two-column desktop layout, sidebar showing ungraded questions, view=1 read-only mode, approver mode (GRADING gate), grade band recalculation (grade field now correctly calculated), context-aware back link, mobile drawer, gate decision banner

**Still TODO:**
- Build the `/attempt-take` interactive exam-taking interface
- Verify teacher and student flows end-to-end
- Test full flow: login → dashboard → create exam → publish → student takes exam → grading → results
- Remove `functions/` folder once migration is fully verified
- Confirm dialogs on destructive actions (deferred to Phase 2 — needs client-side ConfirmButton)
- Sequential question navigation in preview (deferred to Phase 2 — needs client-side state)

### Phase 2 — Unlock the Power of the New Stack

Once existing logic is solid, these upgrades use React's client-side capabilities that weren't possible in the old stack:

**1. Client-Side Interactivity (biggest upgrade)**
- People page: live search and instant filter updates without page reloads
- Exam builder: dynamic answer options, drag-to-reorder questions, live preview as you type
- Student exam taking (`/attempt-take`): countdown timer, question navigation, auto-save
- Sitting builder: expandable paper rows showing approval gates inline

**2. Drawers and Panels**
- StudentDrawer: click any student name anywhere → panel slides in with profile, courses, classes, exam results. Built once, used on People, Results, Course detail, Class detail.
- TeacherDrawer: same concept for teachers
- ExamDrawer: quick view of exam status and stats without navigating to full builder

**3. Real-Time Feedback**
- Form validation as you type (not after submit)
- Success/error toast notifications that fade out (replace redirect-with-query-param pattern)
- Optimistic updates: click "Approve" → shows approved instantly, server confirms in background

**4. Better Data Display**
- Charts: score distribution, pass/fail breakdown, average trends across sittings
- Sortable tables: click column headers to sort client-side
- Pagination: for schools with 500+ students
- Bulk actions: select multiple students → enrol in course, add to class, grant exam access

**5. Design System**
- Button component with variants (primary, secondary, danger, disabled)
- Modal component for confirmations (replace browser `confirm()` dialogs)
- Toast notifications
- Badge component for status indicators
- Empty state illustrations

**6. Mobile Responsiveness**
- Responsive pass using Tailwind `md:` prefixes
- Student exam-taking experience optimised for phones
- Admin pages usable on tablets

**7. Loading States and Performance**
- Skeleton placeholders while data loads (React Suspense)
- Parallel data fetching everywhere (Promise.all)
- Code splitting: heavy pages load on demand
- Session caching for frequently accessed data (school name, course list)

---

## Database

- **Database name:** `beta_b_db`
- **Database ID:** `e3d2f697-8bb3-4bf1-bc81-ebda379e1919`
- **Schema:** Same as original — see `db/schema.sql`
- **Data:** Copied from original `beta_db` at time of migration

### Environment Variables / Secrets
- `APP_SECRET` — pepper for password hashing (set via `wrangler secret put`)
- `CLOUDFLARE_API_TOKEN` — GitHub Actions secret for deployment
- `CLOUDFLARE_ACCOUNT_ID` — GitHub Actions secret for deployment

---

## Deployment

Every push to `master` triggers GitHub Actions:
1. Checkout code
2. `npm ci` (install dependencies)
3. `npx @opennextjs/cloudflare build` (build Next.js for Cloudflare)
4. `wrangler deploy` (deploy to Cloudflare Workers)

Build happens on Linux (Ubuntu) to avoid OpenNext Windows path issues.

Manual deploy from local: `npm run cf:deploy` (Windows — may have runtime issues).

---

## Admin Restructure (Completed in Migration)

The following restructure from the plan was implemented directly in Next.js:

1. **Courses** — Clean list → drill into detail page with 5 tabs (Details, Teachers, Students, Classes, Join Codes)
2. **Classes** — Detail page restructured into 3 tabs (Details, Students, Courses)
3. **Class-to-Course enrolment** — Bulk enrol from both course and class pages
4. **People** — 2 tabs (Members with filters + Add Person with email check)
5. **Join Codes** — 3 sections (Active Codes, Create Code with plain English, Pending Requests) + Duplicate button
6. **Sitting builder** — Approvals merged into Papers tab (gate badges per paper row)

See `docs/QAcademy Beta — Admin Restructure Plan.md` for full details.
