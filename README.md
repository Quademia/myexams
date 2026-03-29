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
    auth-events.ts  ← login attempt logging + rate limiting (auth_events table)
    sessions.ts     ← D1 session tracking — create, count, expire, revocation check
    reset-log.ts    ← password reset request logging + rate limiting
    env.ts          ← Cloudflare environment variable access

  auth.ts           ← NextAuth v5 config — Credentials, Google, Microsoft providers

  components/
    ui/
      IdleTimeout.tsx ← client-side idle timeout with cross-tab sync

  types/
    next-auth.d.ts  ← NextAuth type extensions (session.user.id, active_tenant_id, session_token)

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
- `qa_users` is the platform user table for app access decisions (active users, roles, memberships)
- Credentials provider checks passwords against `qa_users` using PBKDF2 + APP_SECRET pepper (single hash in `authorize()` — never duplicated)
- Google/Microsoft SSO are **login methods for existing ACTIVE `qa_users` accounts only** — unregistered emails are rejected and redirected back to `/login?error=NoAccount`
- `active_tenant_id` (current school) is stored as a custom field in the JWT and updated via `unstable_update`
- Root route `/` is read-only routing logic. If a logged-in user has exactly one membership but no `active_tenant_id`, `/` redirects to `/switch-school?tenant_id=...`; the `/switch-school` route handler performs `setActiveTenant()` safely, then redirects back to `/`

### Join flow (`/join`)
- Supports three paths:
  - existing user **Login & join**
  - new user **Create account & join**
  - already logged-in user **Join**
- **Create account path is new-email only**:
  - if email already exists as ACTIVE in `qa_users`, account creation stops immediately
  - user is redirected with: `Account already exists. Please log in to join.`
  - no join side effects occur before ownership is proven (no membership/enrolment/teacher assignment/pending request writes)
- **Login & join path verifies password first**, then applies join side effects
- Existing accounts are never silently reused from the create-account path

### Session tracking & security
- **D1 session rows** — every successful login creates a row in `sessions` with `qa_user_id`, `created_at`, `last_seen_at`, `absolute_expires_at`, IP hash, and parsed User-Agent. `last_seen_at` is set once at login (not continuously updated)
- **Concurrent session limit** — max 2 active sessions per user. Checked in the `signIn` callback before allowing login. Blocked attempts are logged and a session row is created then immediately expired for audit trail
- **Session revocation** — the `jwt` callback checks `isSessionExpired()` on every request. If the D1 row was force-expired (e.g. by password reset), the JWT is gutted and the user is redirected to `/login`
- **Password reset kills all sessions** — `expireAllUserSessions()` marks all active D1 rows as expired with reason `"password_reset"`, forcing re-login on all devices
- **Idle timeout** — client-side `IdleTimeout` component monitors activity (mouse, keyboard, touch, scroll). Shows a warning modal before auto-logout. Uses `BroadcastChannel` for cross-tab sync so activity in one tab keeps other tabs alive
- **Login rate limiting** — `checkLoginRateLimit()` counts failed attempts across three dimensions (identifier, IP hash, user ID) in two windows: 5 failures in 10 min or 10 in 24 hr blocks login
- **Password reset rate limiting** — `checkResetRateLimit()` blocks after 1 request in 10 min or 3 in 24 hr
- **Auth event logging** — every login attempt (success, failure, SSO) is logged to `auth_events` with timestamp, IP hash, User-Agent, error code, and outcome. All logging is fire-and-forget — never blocks auth
- **Password reset logging** — every reset request is logged to `password_reset_log` with hashed token, IP hash, and status
- **Privacy** — IPs are always SHA-256 hashed before storage (never raw). User-Agents are parsed to readable format ("Windows 10/11 / Chrome 123") and also hashed for the `ua_hash` column

### Auth tables in D1
| Table | Purpose |
|---|---|
| `users` | NextAuth identity records |
| `accounts` | Links OAuth providers to users |
| `sessions` | D1 session tracking — concurrent limits, revocation, IP/UA metadata |
| `verification_tokens` | Password reset tokens (SHA-256 hashed) with audit columns |
| `auth_events` | Login attempt audit log — used for rate limiting |
| `password_reset_log` | Password reset request audit log — used for rate limiting |

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

### Auth & security tables
| Table | Purpose |
|---|---|
| `users` | NextAuth identity records |
| `accounts` | Links OAuth providers to users |
| `sessions` | D1 session tracking — concurrent limits, revocation, IP/UA metadata |
| `verification_tokens` | Password reset tokens (hashed) with audit columns |
| `auth_events` | Login attempt audit log — rate limiting queries |
| `password_reset_log` | Password reset request audit log — rate limiting queries |

### Platform tables
| Table | Purpose |
|---|---|
| `qa_users` | Platform users — name, email, password hash, is_system_admin, auth_id |
| `tenants` | Schools |
| `memberships` | User ↔ school ↔ role |
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
| `/login` | Email + password + Google SSO + Microsoft SSO + rate limiting + max sessions check + "Forgot your password?" link | ✅ Verified 2026-03-29 |
| `/forgot-password` | Forgot password — rate limited, token hashed before storage, email sent via Resend | ✅ Verified 2026-03-29 |
| `/reset-password` | Reset password — validates hashed token, updates password, expires all sessions | ✅ Verified 2026-03-29 |
| `/logout` | Expires D1 session row, destroys NextAuth JWT cookie, redirects to login | ✅ Verified 2026-03-29 |
| `/setup` | First-time platform setup — creates System Admin | ✅ Verified 2026-03-26 |
| `/profile` | View profile, change password | ✅ Verified |
| `/no-access` | Shown when user has no school memberships | ✅ Verified |
| `/choose-school` | Pick active school (multi-school users) | ✅ Verified |
| `/switch-school` | Route handler that sets active tenant in JWT via `setActiveTenant()`, then redirects to `/` | ✅ Verified |
| `/join` | Join code flow: login+join, create-account+join (new emails only), and logged-in join; existing emails on create-account are redirected to login path | ✅ Verified |
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
- **Fire-and-forget logging** — all auth event and session writes are wrapped in try/catch. Logging failures must never block login or password reset flows
- **IPs are always hashed** — SHA-256 before storage, never raw. Consistent across `auth_events`, `sessions`, `verification_tokens`, and `password_reset_log`
- **Reset tokens are always hashed** — raw token goes in the email link, SHA-256 hash goes in the database. If DB is breached, attacker can't forge reset links
- **Session revocation via D1 check** — JWT cookies are self-contained, so we check D1 on every request to detect force-expired sessions (password reset, admin action). Lightweight single-row SELECT
- **Cross-tab idle sync via BroadcastChannel** — activity in any tab resets the idle timer in all tabs (same browser only). Prevents stale-tab logout while user is active elsewhere
- **Closure variable bridges signIn→jwt callbacks** — the `signIn` callback has access to request headers but the `jwt` callback (which creates the session row) doesn't. A closure variable passes IP/UA metadata between them

---

## What's Next

### Immediate — Prompt 3
- ~~Password reset flow — token generated, stored in `verification_tokens`, email sent via Resend, validated on reset page~~ ✅ Done 2026-03-28
- ~~Session & security hardening — rate limiting, auth event logging, concurrent session limits, idle timeout, session revocation on password reset, cross-tab sync, IP hashing, token hashing~~ ✅ Done 2026-03-29
- Email verification on signup

### Immediate — Prompt 4
- ~~Fix `/join` page — old custom session behavior and unsafe account reuse on create-account path~~ ✅ Done 2026-03-29 (`signIn`-based flow with existing-email guard)

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
- ~~NextAuth type declarations — extend properly via `next-auth.d.ts`~~ ✅ Done 2026-03-29 (session.user.id, active_tenant_id, session_token)
- Microsoft SSO for organisational accounts — requires publisher verification in Azure
- Toast notifications
- StudentDrawer and TeacherDrawer components
- Aggregate reporting
- Self-service school signup

---

*Last updated: 2026-03-29 — Session & security hardening complete and verified (rate limiting, session tracking, idle timeout, cross-tab sync, session revocation on password reset).*
