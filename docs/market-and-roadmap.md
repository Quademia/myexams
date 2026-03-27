# QAcademy — Market Position & Roadmap

*This document captures where the product stands today, what is genuinely missing, the market opportunity, and the strategic directions available. Updated as the platform grows.*

---

## What QAcademy Is Today

A closed-group multi-tenant exam platform. Any organisation where the administrator knows their members in advance can use it — schools, corporations, training companies, professional bodies with existing membership lists.

### What closed-group means

The administrator controls who is in the system before any exam happens. Members join via a join code or are added manually. They get a role. They take exams. This works perfectly for:

- Schools running ongoing student assessment
- Corporations testing employees after training
- Training companies assessing learners
- Professional bodies testing existing members
- Universities and colleges managing departmental exams

### The core is genuinely strong

The exam engine, grading pipeline, approval gates, and sittings system are ahead of many competitors. Specifically:

- 5 question types with partial marking, per-option feedback, model answers
- Auto-grading for objective questions, manual grading for essay and short answer
- Grade bands, custom result fields, score display options
- QUESTIONS / GRADING / RESULTS approval gates — a formal oversight system most platforms do not have
- Sittings — grouping exams into formal sessions, a concept absent from most school platforms
- Multi-tenant isolation — every organisation gets a completely separate space
- Role-based access — School Admin, Teacher, Student with appropriate permissions per role

### What makes it feel school-oriented

Three things make it feel school-specific rather than generic:

1. **Terminology** — student, teacher, course, class. These map directly to candidate, assessor, programme, cohort in any other context. The data model is identical — only the labels differ.
2. **Onboarding assumption** — people must be added to the organisation before they can take an exam. Works for closed groups, does not work for walk-in candidates.
3. **No self-registration** — there is no way for a member of the public to find an exam, register, and sit it without being manually added first.

---

## What Is Genuinely Missing — Production Readiness

The migration to the new stack was essential preparation — it cleared architectural blockers and put the platform on solid ground. But the migration moved what existed into a better structure. It did not add capability. The product today is still early stage in several important areas.

### Must have before any real organisation uses it in production

| Gap | Why it matters |
|---|---|
| Password reset / forgot password | Users locked out permanently if they forget password |
| Email notifications — results released, exam scheduled | Platform is completely silent — users have no idea anything happened |
| Rate limiting on login | Brute force attacks on passwords currently possible |
| Proper error handling and user-facing error messages | Pages crash on query failures, users do not know what went wrong |
| Bulk student/member import from CSV | Schools and organisations have existing data — manual entry is not viable at scale |

### Should have before charging money

| Gap | Why it matters |
|---|---|
| Email verification on signup | Any email can be used without verification |
| Aggregate reporting — class averages, question performance, cohort comparisons | Schools and organisations make curriculum and training decisions from this data |
| Data export per tenant | Organisations must be able to take their data if they leave |
| Self-service school/organisation signup | Currently only a system admin can create a new tenant — not scalable |
| Certificate or downloadable result on pass | Expected by almost every non-school context |
| Account lockout after failed login attempts | Basic security requirement |

### Nice to have for competitive positioning

| Gap | Why it matters |
|---|---|
| Audit trail — who changed what and when | Required by formal exam bodies and regulated industries |
| Session management — view and revoke active sessions | Security and compliance |
| Usage limits and plan management | Commercial readiness — prevent abuse, enable pricing tiers |
| Advanced analytics — trends over time, cohort comparisons | Differentiator for serious institutional clients |
| Proctoring — basic anti-cheat, copy-paste prevention | Expected by high-stakes exam contexts |
| Accessibility — screen reader support, keyboard navigation | Required by many institutions and public sector organisations |

---

## The Two Strategic Directions

### Direction 1 — Broaden the closed-group market

Keep the same model but make it explicitly generic. Remove the school-specific feel and open it to any organisation that manages a known group of people.

**What needs to be built:**
- Terminology settings per tenant — organisations choose their own labels (student vs candidate vs employee vs member)
- Email notifications throughout the platform
- Certificates and PDF result slips
- Aggregate analytics and reporting
- Bulk import for members and questions
- Self-service organisation signup
- Plan and usage management

**Market this opens:**
Corporate training and assessment, professional associations, government licensing, tutoring companies, private education providers, universities and colleges.

**Effort:** Medium — builds on top of what exists. No architectural changes needed.

**Recommended:** Pursue this first. It is the closest to what exists, lower effort, and opens a significantly larger addressable market.

---

### Direction 2 — Open-group exam delivery (the Pearson VUE model)

A fundamentally different access layer on top of the same exam engine. Organisations own exams. Exam centres deliver them. Candidates walk in with no prior account.

**What the experience looks like:**
1. A candidate registers for an exam online — name, email, ID number, chosen centre, chosen date
2. They arrive at the exam centre
3. A proctor looks them up by booking reference or ID, verifies their identity, checks them in
4. The candidate sits at a kiosk — sees a start screen with their name and exam details
5. They confirm their identity and the exam begins via a one-time session token — no password needed
6. On completion they receive an on-screen result and optionally a printed or emailed certificate
7. The exam owner receives the result in their reporting dashboard

**What needs to be built:**
- Candidate self-registration and booking system
- Exam centre management — separate entity from tenant, with address, capacity, approved status
- Proctor dashboard — check-in, monitor progress, handle incidents
- Kiosk start screen — identity confirmation, session token flow
- One-time session token system replacing the normal login flow
- Public-facing exam catalogue — candidates browse available exams and book
- Certificate and result delivery system
- Commercial layer — exam owner pays per candidate, centre gets a fee, platform takes a cut

**Market this opens:**
Professional certification bodies, government licensing exams, medical and legal boards, high-stakes public assessment, recruitment screening at scale.

**Effort:** Significant — requires new concepts (exam centre, booking, session token, proctor role) that do not exist in the current architecture.

**Recommended:** Pursue after Direction 1 is solid. The exam engine foundation is shared. Direction 1 validates the platform commercially before the larger investment.

---

## Recommended Build Sequence

This is not a rigid plan — priorities will shift based on real user feedback. But this is the current strategic thinking.

### Stage 1 — Production readiness (current focus)
Make the platform safe and complete enough for real organisations to use:
- Password reset
- Email notifications (results, exam schedule, approval requests)
- Rate limiting and basic security hardening
- Error handling and user-facing messages
- Bulk import for members and questions

### Stage 2 — UI and experience
Make the platform look and feel like a product:
- Design sprint — consistent visual language across all pages
- Toast notifications
- Confirm dialogs on destructive actions
- Drawer components — StudentDrawer, TeacherDrawer
- Teacher single context experience
- Mobile experience polish
- PWA installability

### Stage 3 — Broaden the market (Direction 1)
Open the platform to any organisation:
- Terminology settings per tenant
- Self-service organisation signup
- Certificates and PDF result slips
- Aggregate reporting and analytics
- Data export per tenant
- Plan and usage management

### Stage 4 — Open-group delivery (Direction 2)
Build the Pearson VUE layer:
- Candidate registration and booking
- Exam centre management
- Proctor dashboard
- Kiosk start screen and session token flow
- Public exam catalogue
- Commercial and payment layer

---

## Positioning

QAcademy sits in a genuine gap in the market.

Most exam platforms pick one market and go deep. Moodle is for education. Typeform is for surveys. Certify is for corporate training. None of them do the full formal exam workflow — approval gates, sittings, grading pipeline — that QAcademy already has.

QAcademy is formal enough for serious exam contexts but simple enough for small organisations without IT resources. That combination is rare.

The target positioning: **"Run formal exams for any organisation — without the complexity of enterprise platforms or the cost of custom development."**

Moodle — the platform most schools currently use — requires teachers and admins to navigate dozens of nested pages to do basic things. QAcademy's current structure is already significantly better. The platform works correctly and the workflows make sense. The gap between now and a compelling product is closing — not opening.

---

*Last updated: March 2026*
