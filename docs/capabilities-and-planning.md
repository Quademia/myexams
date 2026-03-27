# QAcademy Beta-B — Capabilities & Planning

*This document captures what the new stack offers, what we are already using, what remains untapped, and what to build next. Updated as the platform grows.*

---

## What the New Stack Offers

The move to Next.js, React, TypeScript, and Tailwind CSS gives us three things the old stack could never do cleanly:

1. **Client-side interactivity** — parts of a page can update instantly in the browser without a full reload
2. **Reusable components** — build a drawer, a table, a form once and use it everywhere
3. **Mixed rendering** — each page chooses the right approach: server-rendered for data accuracy, client-side for interactivity

---

## What We Are Already Using Well

### Server Components
Every page fetches data on the server and sends ready HTML to the browser. Fast, secure, accurate. Working well across all 37 routes.

### Server Actions
Every form submits to a server function without a separate API endpoint. No fetch calls, no API layer needed. Working well everywhere.

### TypeScript
Type checking on every database query and every component. Bugs caught at build time before they reach production.

### Tailwind CSS
Consistent styling utility classes across all pages. Foundation is in place — design sprint not done yet.

### Reusable Components
`Card`, `TabNav`, `SchoolLayout`, `QuestionFormFields`, `GradingEngine`, `ApproverFilter` and others already built and reused across pages.

### Client Components (targeted)
Used in a few places where interactivity was essential: `GradingEngine` (live sidebar + score total), `QuestionFormFields` (dynamic options), `ApproverFilter` (live filtering). These work well and demonstrate the pattern.

---

## What We Have Barely Touched

The majority of the app still behaves like the old build — every interaction causes a full page reload. This is the biggest untapped area of the new stack.

### Drawers — the highest impact feature
A drawer is a panel that slides in from the side without navigating away. Click a student on the People page — their full profile, courses, classes and exam history slides in. Click a teacher in the results pane — their context appears inline. Navigate away when you're done.

Currently every click navigates to a separate page and loses context. Drawers would transform the admin and teacher experience into something that feels like a serious institutional tool.

Key drawers to build:
- `StudentDrawer` — profile, courses, classes, exam attempts. Callable from People, Results, Classes, anywhere a student appears
- `TeacherDrawer` — profile, courses, exams. Callable from People, Course detail, anywhere a teacher appears

### Live Filtering
Currently changing a filter (role, status, course) causes a full page reload. With a client component the table updates instantly. Highest value on the People page and the Results tab.

### Drag to Reorder Questions
Currently teachers click up/down arrows to reorder questions — each click causes a full page reload. Drag and drop would make the exam builder feel fluid and professional.

### Confirm Dialogs
Currently destructive actions (delete question, remove student, revoke code) happen immediately with no confirmation. A `ConfirmButton` client component would add a safety step without a page reload.

### Inline Editing
Forms that expand inline rather than navigating to a separate edit page. Particularly useful in the exam builder and sitting builder.

---

## What We Have Not Used At All Yet

### PWA — Progressive Web App
With a small addition to the Next.js config, QAcademy becomes installable on a phone or desktop like a native app. Students add it to their home screen. No app store needed. Particularly powerful for the target market — schools in low-resource environments where a lightweight installable app beats a heavy native app.

### Optimistic UI
When a teacher clicks Approve, the button changes to Approved instantly — before the server confirms. If the server fails it reverts. Makes the platform feel fast and responsive. Currently everything waits for a full server round-trip.

### Loading States and Suspense
Pages can show skeleton loaders while data loads rather than a blank screen. Makes the platform feel polished and professional, especially on slower connections.

### Streaming
Next.js can stream parts of a page to the browser as they become ready. The page shell appears immediately and data loads progressively. Most useful on data-heavy pages like the Results tab and the Sittings results grid.

### JSON API Routes
If a mobile app or external school system ever needs to access QAcademy data, JSON API endpoints can be added at `src/app/api/`. The architecture already supports this cleanly. Not needed now but ready when the time comes.

---

## Honest Assessment

The migration gave us the foundation. In terms of actually using the power of the new stack, we are at roughly 40%. The app works correctly but still largely behaves like the old build from a user experience perspective.

The two things that would make the biggest difference to real users:

**Drawers** — clicking a student or teacher anywhere and seeing their full context in a panel without navigating away. This is what makes the admin experience feel like a serious institutional tool rather than a collection of web pages.

**Design polish** — the platform works but does not look like a product yet. Tailwind gives us the tools to make it look professional in one focused sprint. This matters enormously when selling to schools.

---

## Priority Order for Next Development

These are not rigid phases — they will be picked up based on what matters most at the time. But this is the current thinking on order:

1. **Confirm dialogs** — small, high safety value, unblocks destructive action confidence
2. **Live filtering** — People page and Results tab, immediate UX improvement
3. **Design polish sprint** — one focused sprint across the whole platform, consistent visual language
4. **StudentDrawer and TeacherDrawer** — the biggest UX leap, transforms the admin experience
5. **Drag to reorder questions** — makes the exam builder feel professional
6. **PWA installability** — adds real-world accessibility for schools
7. **School identity features** — logo, brand colour, custom domain per school
8. **Question Bank Bulk Import** — CSV/Excel upload for teachers
9. **Optimistic UI and loading states** — polish layer after features are stable
10. **JSON API routes** — when external integration or mobile app becomes relevant

---

## Key Principle

*Build features correctly first. Design makes it look better — React makes complex interactions smoother. Both matter, but in that order.*

---

## Feature Opportunity Analysis

A critical analysis of every page and feature in the app, mapped against the new stack capabilities available to us. Ratings: H = High benefit, M = Medium benefit, L = Low benefit, — = Not applicable.

| Page / Feature | Drawer | Inline Rows | Toast | Live Filter | Confirm Dialog | Inline Edit | Bulk Actions | Optimistic UI |
|---|---|---|---|---|---|---|---|---|
| `/school` — Overview | — | — | — | — | — | — | — | — |
| `/school-courses` — List | — | — | H | — | — | — | — | — |
| `/school-course` — Teachers tab | H — click teacher opens TeacherDrawer | — | H | — | H — unassign | M — edit inline | — | M |
| `/school-course` — Students tab | H — click student opens StudentDrawer | — | H | M — filter by name | H — unenrol | — | H — bulk unenrol | M |
| `/school-course` — Classes tab | — | M — expand class to see students | H | — | H — unenrol class | — | — | M |
| `/school-course` — Join Codes tab | — | M — expand code to see uses | H | — | H — revoke | — | — | — |
| `/school-classes` — List | — | — | H | — | — | — | — | — |
| `/school-class` — Students tab | H — click student opens StudentDrawer | — | H | M — filter by name | H — remove | — | H — bulk remove | M |
| `/school-class` — Courses tab | — | M — expand course to see enrolment | H | — | H — unenrol course | — | — | M |
| `/school-people` — Members tab | H — click anyone opens PersonDrawer | — | H | Already exists | H — remove | — | H — bulk role change, bulk remove | M |
| `/school-people` — Add Person tab | — | — | H — "Person added" | — | — | — | — | — |
| `/school-join-codes` | — | M — expand code details | H | M — filter by type | H — revoke | — | — | — |
| `/school-sittings` — List | — | M — expand sitting summary | H | — | H — delete sitting | M — edit title inline | — | — |
| `/sitting-builder` — Settings tab | — | — | H — "Settings saved" | — | — | M — inline field edits | — | M |
| `/sitting-builder` — Papers tab | — | H — expand paper to see gate status | H | — | H — remove paper | — | — | M |
| `/sitting-builder` — Results tab | H — click student opens StudentDrawer | M — expand student row per paper | — | H — filter by student/paper | — | — | — | — |
| `/sitting-gate-settings` | — | — | H | — | H — remove approver | — | — | M |
| `/approvals` — Inbox | H — click exam opens ExamDrawer | — | H | — | — | — | — | H — approve feels instant |
| `/teacher` — Dashboard | H — click exam opens ExamPanel | — | H | M — filter by status | — | — | — | — |
| `/exam-builder` — Settings tab | — | — | H — "Settings saved" | — | — | H — inline field edits | — | M |
| `/exam-builder` — Questions tab | — | — | H | — | H — delete question | Already client-side | — | — |
| `/exam-builder` — Access tab | H — click student opens StudentDrawer | — | H | M | H — remove access | — | H — bulk add by class | M |
| `/exam-builder` — Results tab | H — click student opens StudentDrawer | M — expand attempt inline | H | Already exists | — | — | H — bulk export selected | M |
| `/exam-builder` — Approvals tab | — | M — expand gate status | H | — | — | — | — | H — submit for approval |
| `/exam-preview` | — | — | — | — | — | — | — | — |
| `/exam-grade` | — | — | H — "Grades saved" | — | — | Already client-side | — | Already client-side |
| `/exam-bank-picker` | — | M — expand question preview | H | Already exists | — | — | H — select multiple to add | — |
| `/question-bank` | — | M — expand question preview inline | H | Already exists | H — delete question | M — inline edit | H — bulk delete, bulk share | — |
| `/student` — Dashboard | — | M — expand sitting results | — | — | — | — | — | — |
| `/attempt-start` | — | — | — | — | — | — | — | — |
| `/attempt-take` | — | — | — | — | — | — | — | Already client-side |
| `/attempt-complete` | — | — | — | — | — | — | — | — |
| `/attempt-results` | — | — | — | — | — | — | — | — |
| `/attempt-review` | — | M — expand question feedback | — | — | — | — | — | — |
| `/sitting-results` | — | M — expand paper detail | — | — | — | — | — | — |
| `/sys` | — | M — expand user memberships | H | M — already has search | — | — | — | — |
| `/profile` | — | — | H — "Password changed" | — | — | — | — | — |

---

## Key Patterns From The Analysis

**Toast notifications** affect almost every single page. The easiest win on the entire list. One `Toast` component built once, used everywhere. Currently the platform is completely silent after every action.

**Confirm dialogs** affect every destructive action across 15+ pages. Currently everything deletes and removes immediately with no warning. One `ConfirmButton` component fixes all of them.

**StudentDrawer** appears on 7 different pages. Build it once and it transforms the experience on People, Course detail, Class detail, Results, Sitting builder results, and Exam access.

**Recommended build sequence based on impact vs effort:**

1. Toast notifications — one component, fixes every page, lowest effort
2. Confirm dialogs — one component, fixes every destructive action, low effort
3. StudentDrawer — larger build, highest single-component impact
4. TeacherDrawer — natural follow-on to StudentDrawer
5. Inline expanding rows — targeted additions per page after drawers exist
6. Bulk actions — high practical value for schools with many students
7. Inline editing — makes builders feel fluid
8. Optimistic UI — polish layer once everything else is stable
