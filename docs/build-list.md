# QAcademy — Build List

*The working list of what to build, improve, and fix. Organised by priority. Updated as work progresses and new ideas emerge.*

---

## Ready to build

Features that have been planned and are ready to start.

- **StudentDrawer** — slide-in panel showing student profile, courses, classes, attempt history. Consumers: admin People section, Class detail, Course students tab, Sitting results
- **TeacherDrawer** — slide-in panel showing teacher profile, courses, exams. Consumers: admin People section, Course teachers tab
- **Email verification on signup** — any email can currently be used without verification
- **Email notifications** — results released, exam scheduled, approval requests. Platform is completely silent right now
- **Error handling and user-facing error messages** — pages crash on query failures, users don't know what went wrong

---

## Ideas and improvements

Things spotted during work sessions. Not yet planned in detail.

- **Student dashboard overview** — welcome banner, quick stats (exams assigned, completed, results available), action items (resume in-progress, new results), recent activity. Currently My Exams is the dashboard
- **Student result summary drawer/modal** — quick view of score/grade/pass-fail without navigating away from student dashboard
- **Student attempt review modal** — review submitted answers inline (student-facing)
- **Sequential question navigation in exam preview** — step through questions one at a time
- **Comment badge on Results pane** — show a badge where grading gate comments exist
- **Approver overall note in Approvals pane**
- **System admin accessing exam builder without active school** — needs clean fix
- **Remove `/setup` link from login page** before real production launch
- **`/choose-school` still links to archived `/profile` page** — needs updating or removing

---

## Deferred

Decided to build later. Reason noted for each.

- **Email invitations** — invite specific people by email with single-use links. Practical only after bulk CSV import is built
- **Bulk CSV import (members)** — schools have existing data, manual entry doesn't scale. Needed before email invitations are useful
- **Bulk CSV import (questions)** — Question Bank bulk import from spreadsheet
- **Aggregate reporting** — class averages, question performance, cohort comparisons. Needs data to be meaningful
- **Self-service school/organisation signup** — currently only system admin can create tenants. Not needed until product goes public
- **Microsoft SSO for organisational accounts** — requires publisher verification in Azure. Personal accounts work already
- **Certificates / downloadable result on pass** — expected by non-school contexts
- **Data export per tenant** — organisations must be able to take their data if they leave
- **UI/design polish sprint + PWA installability** — visual consistency pass and mobile app-like install
- **Terminology settings per tenant** — let organisations choose their own labels (student vs candidate, etc.)
- **Plan and usage management** — commercial readiness, prevent abuse, enable pricing tiers
- **Resend account + sending identity** — password reset sends from `QAcademy <noreply@qacademynurses.com>`, i.e. very likely gamma's Resend account and its verified domain. A retired brand on a user-facing email, and a live path depending on another product's infrastructure. Resend's free plan allows one verified domain per account and gamma's slot is taken, so MyExams cannot verify its own without paying. Fix mirrors MyNclex: own account under `admin@quademia.com`, `quademia.com` verified, from-address updated. Code change plus key swap — but on a live login path, so its own session. See `docs/cloning.md` §0

---

*Last updated: 2026-08-19 — Resend sending identity deferred (see Deferred). Previously 2026-04-01.*
