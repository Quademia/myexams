# QAcademy Beta-B — Next.js Migration

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

## Stack

| Layer | Tool |
|---|---|
| Frontend + Routing | Next.js 16 App Router |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Backend Logic | Next.js Server Actions + Route Handlers |
| Authentication | NextAuth v5 (Auth.js) |
| Database | Cloudflare D1 (SQLite) |
| Hosting | Cloudflare Workers (via OpenNext) |
| Email | Resend |
| CI/CD | GitHub Actions (Ubuntu) |
| Code Repository | GitHub |

---

## Repo Structure
```
src/
  app/
    (auth)/         ← login, logout, setup, profile, join, choose-school, switch-school, health
    (sys)/          ← system admin
    (admin)/        ← school admin pages
    (exams)/        ← exam builder, grading, results, question bank, approvals
    (student)/      ← student dashboard + exam taking flow
    (teacher)/      ← teacher dashboard
    api/auth/       ← NextAuth catch-all route handler

  components/
    layout/         ← SchoolLayout
    ui/             ← Card, TabNav, DataTable, PageHeader
    exam/           ← ExamEngine, GradingEngine, QuestionFormFields, etc.

  lib/
    db.ts           ← D1 database helpers (first, all, run)
    auth.ts         ← getAuth, requireAuth, pickActiveMembership, setActiveTenant, crypto helpers
    env.ts          ← Cloudflare environment variable access

  auth.ts           ← NextAuth v5 config — Credentials, Google, Microsoft providers

  types/
    next-auth.d.ts  ← NextAuth type extensions (session.user.id, active_tenant_id)

db/
  schema.sql        ← Reference schema

docs/
.github/workflows/
  deploy.yml        ← Build on Ubuntu, deploy to Cloudflare Workers

wrangler.jsonc
open-next.config.ts
next.config.ts
```

---

## Authentication System — COMPLETE

NextAuth v5 (Auth.js) handles all authentication. Three login methods:

| Method | Status |
|---|---|
| Email + password | ✅ Working |
| Google SSO | ✅ Working |
| Microsoft SSO (personal accounts) | ✅ Working |

### How it works
- NextAuth manages identity via JWT cookies — no database session lookup on every request
- `src/auth.ts` — NextAuth config with Credentials, Google, and Microsoft Entra ID providers
- `src/lib/auth.ts` — platform auth helpers (`getAuth`, `requireAuth`, `pickActiveMembership`, `setActiveTenant`) — same function names and return types as before, now backed by NextAuth
- Credentials provider checks passwords against `qa_users` using PBKDF2 + APP_SECRET pepper
- Google/Microsoft SSO auto-creates a `qa_users` row on first login via the `signIn` callback
- `active_tenant_id` (current school) is stored as a custom field in the JWT and updated via `unstable_update`

### NextAuth tables in D1
| Table | Purpose |
|---|---|
| `users` | NextAuth identity records |
| `accounts` | Links OAuth providers to users |
| `sessions` | NextAuth session storage (not actively used with JWT strategy) |
| `verification_tokens` | Email verification and password reset tokens |

### Required Cloudflare secrets
| Secret | Purpose |
|---|---|
| `APP_SECRET` | Pepper for PBKDF2 password hashing |
| `AUTH_SECRET` | NextAuth JWT signing key |
| `AUTH_TRUST_HOST` | `true` — required for Cloudflare Workers |
| `AUTH_GOOGLE_ID` | Google OAuth Client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth Client Secret |
| `AUTH_MICROSOFT_ENTRA_ID_ID` | Azure Application (client) ID |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | Azure Client Secret value (not ID) |
| `RESEND_API_KEY` | Resend API key for transactional email |

---

## Database Tables

### Auth tables (NextAuth)
`users`, `accounts`, `sessions`, `verification_tokens`

### Platform tables
| Table | Purpose |
|---|---|
| `qa_users` | Platform users — name, email, password hash, is_system_admin, auth_id, school_email |
| `tenants` | Schools |
| `memberships` | User ↔ school ↔ role |
| `sessions` | NextAuth sessions |
| `courses` | Subjects within a school |
| `course_teachers` | Teacher ↔ course |
| `enrollments` | Student ↔ course |
| `classes` | Class groups |
| `class_students` | Student ↔ class |
| `join_codes` | Invite codes |
| `join_requests` | Pending approvals |
| `exams` | Exam metadata + settings |
| `exam_grade_bands` | Grade bands per exam |
| `exam_custom_fields` | Custom fields per exam |
| `exam_questions` | Questions per exam |
| `exam_question_options` | Answer options per question |
| `exam_access` | Explicit student access per exam |
| `exam_attempts` | Student exam attempts |
| `exam_answers` | Student answers per attempt |
| `exam_sittings` | Sitting groups |
| `exam_sitting_papers` | Papers within a sitting |
| `sitting_approval_gates` | Approval gate configuration |
| `sitting_approval_responses` | Approver decisions |
| `sitting_approval_comments` | Per-question approver comments |
| `question_bank` | Reusable question bank |
| `question_bank_options` | Options for bank questions |

---

## All Routes

### Auth & Navigation

| Route | Description | Status |
|---|---|---|
| `/` | Smart redirect — role-based routing to correct dashboard | ✅ Verified |
| `/login` | Email + password + Google SSO + Microsoft SSO + "Forgot your password?" link + green success banner on `?message=password-reset` | ✅ Verified 2026-03-28 |
| `/forgot-password` | Forgot password — enter email, sends reset link via Resend | ✅ Verified 2026-03-28 |
| `/reset-password` | Reset password — validates token, updates password in `qa_users` | ✅ Verified 2026-03-28 |
| `/logout` | Destroys NextAuth session, redirect to login | ✅ Verified 2026-03-28 |
| `/setup` | First-time platform setup — creates System Admin | ✅ Verified 2026-03-26 |
| `/profile` | View profile, change password | ✅ Verified |
| `/no-access` | Shown when user has no school memberships | ✅ Verified |
| `/choose-school` | Pick active school (multi-school users) | ✅ Verified |
| `/switch-school` | Sets active tenant in JWT, redirects to `/` | ✅ Verified |
| `/join` | Public join code entry — ⚠️ needs updating for NextAuth (Prompt 4) | ⚠️ Needs fix |
| `/health` | Diagnostic route — DB connectivity, response time, timestamp | ✅ Verified |

---

### System Admin

| Route | Description | Status |
|---|---|---|
| `/sys` | Create schools, search users, manage memberships | ✅ Verified |

---

### School Admin

| Route | Description | Status |
|---|---|---|
| `/school` | Overview dashboard — stats + pending approval banner | ✅ Verified |
| `/school-courses` | Course list + create | ✅ Verified |
| `/school-course` | Course detail — 5 tabs | ✅ Verified |
| `/school-classes` | Class list + create | ✅ Verified |
| `/school-class` | Class detail — 3 tabs | ✅ Verified |
| `/school-people` | Members + Add Person | ✅ Verified |
| `/school-join-codes` | Active codes, create, pending requests | ✅ Verified |
| `/school-sittings` | Sittings list + create | ✅ Verified |

---

### Sittings & Approvals

| Route | Description | Status |
|---|---|---|
| `/sittings` | Sittings management | ✅ Verified |
| `/sitting-builder` | 3 tabs: Settings, Papers, Results | ✅ Verified |
| `/sitting-gate-settings` | Assign approvers to gates | ✅ Verified |
| `/sitting-results` | Student results across a sitting | ✅ Verified |
| `/approvals` | Approval inbox | ✅ Verified |
| `/exam-preview` | Read-only preview + approver review mode | ✅ Verified |

---

### Exams & Grading

| Route | Description | Status |
|---|---|---|
| `/exam-builder` | 7 tabs: Settings, Questions, Preview, Publish, Access, Results, Approvals | ✅ Verified |
| `/exam-create` | POST — creates exam, redirects to builder | ✅ Verified |
| `/exam-grade` | Grading interface — grade / view / approver mode | ✅ Verified |
| `/exam-results-csv` | CSV export of results | ✅ Verified |
| `/exam-bank-picker` | Browse and add from question bank | ✅ Verified |
| `/question-bank` | Create, edit, delete, share questions | ✅ Verified |
| `/exam-access-*` | Add/remove student and class access | ✅ Verified |
| `/exam-gate-submit` | Teacher submits gate for approval | ✅ Verified |

---

### Student Flow

| Route | Description | Status |
|---|---|---|
| `/student` | Student dashboard — available exams + results | ✅ Verified |
| `/attempt-start` | Pre-exam flow — password, custom fields, instructions | ✅ Verified |
| `/attempt-take` | Live exam engine — timer, navigation, autosave | ✅ Verified |
| `/attempt-complete` | Submission confirmation | ✅ Verified |
| `/attempt-results` | Results page | ✅ Verified |
| `/attempt-review` | Review answers after submission | ✅ Verified |

---

### Teacher Flow

| Route | Description | Status |
|---|---|---|
| `/teacher` | Teacher dashboard — exam list + approvals | ✅ Verified |

---

## Key Decisions & Patterns

- **Server actions must never be passed as props to client components** — causes runtime crashes
- **`await res.json()` returns `unknown` under TypeScript strict mode** — always apply type assertions
- **`qa_users` is the platform user table** — renamed from `users` to avoid conflict with NextAuth's own `users` table. The primary key is `id` — there is no `user_id` column on this table
- **NextAuth JWT strategy** — sessions live in cookies, not D1. Required for Cloudflare Workers edge runtime
- **`AUTH_SECRET` must never be empty** — NextAuth will crash silently with a "server configuration" error
- **Secrets must never go in `wrangler.jsonc`** — even as empty placeholders, they overwrite real Cloudflare secrets on every deploy
- **Microsoft SSO uses personal accounts only** — issuer is hardcoded to `https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0`
- **Azure Client Secret — copy the Value, not the ID** — they look similar in the Azure portal
- **All commits go directly to `master`** — never create a new branch
- **GitHub Actions builds on Ubuntu** — OpenNext has Windows path issues

---

## What's Next

### Immediate — Prompt 3
- ~~Password reset flow — token generated, stored in `verification_tokens`, email sent via Resend, validated on reset page~~ ✅ Done 2026-03-28
- Email verification on signup

### Immediate — Prompt 4
- Fix `/join` page — still has old custom session code (`qa_sess` cookie + old `sessions` INSERT). Needs updating to use NextAuth `signIn` after account creation

### Deferred Phase 2
- Confirm dialogs on destructive actions — needs client-side `ConfirmButton` component
- Sequential question navigation in exam preview
- 💬 badge on Results pane where grading gate comments exist
- Approver overall note in Approvals pane
- Remove `/setup` link from login page before real production launch
- System admin accessing exam builder without active school — needs clean fix

### Future
- Phase 10 — Question Bank bulk CSV import
- Phase 11 — UI/design polish sprint + PWA installability
- NextAuth type declarations — extend properly via `next-auth.d.ts` (partially done)
- Microsoft SSO for organisational accounts — requires publisher verification in Azure
- Toast notifications
- StudentDrawer and TeacherDrawer components
- Aggregate reporting
- Self-service school signup

---

*Last updated: 2026-03-28 — Password reset flow complete and verified.*
