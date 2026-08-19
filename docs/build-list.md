# QAcademy — Build List

*The working list of what to build, improve, and fix. Organised by priority. Updated as work progresses and new ideas emerge.*

---

## Where things stand — last session 2026-08-19

**That session was infrastructure, not app work. No feature code changed.**

The repo moved from `mybackpacc-byte/qacademy-beta-b` into the **`Quademia`** org
and was renamed **`myexams`**; the local folder is now `C:\Users\confi\myexams`.
The Cloudflare Worker was renamed **`qacademy-beta-b` → `myexams-dev`** *in the
dashboard*, which turned out to be possible — it preserved the Worker, its
secrets and its D1 binding, so `APP_SECRET` was never at risk. `wrangler.jsonc`
was updated to match, because wrangler deploys **by name** and a mismatch would
have created a second Worker and silently stopped updating the live one.

⚠ **The rename moved the hostname** to `myexams-dev.mybackpacc.workers.dev` (the
old host 404s), so **both** OAuth redirect URIs had to be re-registered. Both are
done and verified. Full reasoning for the name — and why `exams` beat `schools` —
is in `README.md` → *Name & Lineage*.

⭐ **The lesson worth carrying:** every problem that day came from something not
being written down, not from anything being hard. The rename took minutes;
finding which Microsoft account held the Azure registration took the rest of the
session. `docs/cloning.md` **§0 Account ownership** now exists so it cannot
repeat — it names who owns Cloudflare, Google and Azure, and records the trick
that recovered the client ID without any dashboard access.

### Carried forward — infrastructure and naming

- **`school` → organisation-neutral wording sweep** — ⭐ **needs its own session.**
  706 occurrences across 47 files, plus the route folders `(admin)/school`,
  `(auth)/choose-school`, `(auth)/switch-school`, and `README.md`'s data
  dictionary glossing `tenants` as "Schools". ⓘ The **schema is already right** —
  the table is `tenants`, never `schools` — so this is presentation-layer only,
  and it is the change that makes the product read the way the rename argues it
  should.
- **Brand pass: "QAcademy" → Quademia** — separate from the sweep above and easy
  to conflate. `docs/cloning.md`, `docs/product-description.md`,
  `docs/market-and-roadmap.md` and this file are all still titled "QAcademy",
  the retired company name. ⚠ Not to be confused with the Worker names and the
  `qacademynurses.com` sending domain, which are live identities.
- **`package.json` still reads `qacademy-beta-b`** — cosmetic. ⚠ Its name must
  change in step with `package-lock.json` or `npm ci` can fail in the deploy, so
  do it as its own commit.
- **D1 database is still named `beta_b_db`** — cosmetic only; the binding is by
  **id** (`e3d2f697-…`), so nothing depends on the name.
- **The prod clone has never been made.** `myexams` (no suffix) and
  `exams.quademia.com` are both reserved for it. `docs/cloning.md` is the
  runbook; its §0 lists the two things to settle **before** starting — folding
  the Google client into the family's one `Quademia` Cloud project, and moving
  the Azure registration off a personal Hotmail account onto
  `admin@quademia.com`.
- **`deploy.yml` uses `actions/checkout@v4` and `actions/setup-node@v4`**, which
  target Node 20 — deprecated, and GitHub now force-runs them on Node 24. Both
  deploys that day were green, so this is a tidy-up, not a fault.
- **Resend sending identity** — see *Deferred* below. App behaviour rather than
  infrastructure, which is why it was not done alongside the move.

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

*Last updated: 2026-08-19 — added *Where things stand* (the repo/Worker rename session and everything carried forward from it); Resend sending identity deferred. Previously 2026-04-01.*
