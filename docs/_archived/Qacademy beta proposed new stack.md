# QAcademy Beta — New Stack Guide

*Updated: March 2026 — Migration complete*

This document explains the new technology stack, what each part does, how it all connects, and what features we've used so far versus what's still ahead.

---

## The Big Picture

The old app was one big JavaScript file per section (admin.js, sittings.js, exams.js) that built HTML as text strings and sent them to the browser. Every page reload fetched a fresh page from scratch.

The new app uses **React** and **Next.js** to break the UI into small, reusable pieces (components). Pages are individual files in folders. Styling is consistent via Tailwind CSS. TypeScript catches bugs before deployment.

**Same database. Same logic. Same features. Better structure.**

---

## What Is Each Technology?

### React — Building blocks for UI

React lets you build **components** — small, reusable pieces of UI. Instead of writing the same table HTML on 10 pages, you write it once as a component and reuse it everywhere.

**Example from our app:**

The tab navigation bar appears on courses (5 tabs), classes (3 tabs), people (2 tabs), sitting builder (3 tabs), and exam builder (7 tabs). In the old code, the tab HTML was copy-pasted on each page. In the new code:

```tsx
// Built once in src/components/TabNav.tsx
<TabNav tabs={[
  { label: "Details", value: "details", href: "..." },
  { label: "Teachers", value: "teachers", href: "..." },
]} activeTab="teachers" />
```

Same component, different data. Change the tab style once → it updates everywhere.

### Props — How components get their data

Props are values you pass to a component to tell it what to display. Think of a component as a template, and props as the blanks you fill in.

```tsx
// The Card component takes a "title" prop
<Card title="Enrolled Students">
  ...table goes here...
</Card>

// Same component, different title
<Card title="Assigned Teachers">
  ...different table here...
</Card>
```

In our app, `SchoolLayout` takes props for `auth` (the logged-in user), `active` (the current school), and `currentPath` (which nav link to highlight). Every school admin page passes these — the layout is consistent without any copy-pasting.

### Next.js — The framework that runs React

Next.js adds structure on top of React:

**File-based routing** — The folder structure IS the routing. No configuration, no if-chains.

```
src/app/
  login/page.tsx          → /login
  school/page.tsx         → /school
  school-courses/page.tsx → /school-courses
  school-course/page.tsx  → /school-course?course_id=X
```

In the old code, `[[path]].js` was a giant router that checked `if (path === "/school-courses")` etc. In Next.js, you just put a file in the right folder.

**Server Components** — Pages run on the server by default. They can query the database directly without an API layer. This is what we use for every page:

```tsx
// This runs on the server, not in the browser
export default async function SchoolCoursesPage() {
  const { all } = getDb();
  const courses = await all("SELECT * FROM courses WHERE tenant_id=?", [tid]);
  return <DataTable rows={courses} ... />;
}
```

**Server Actions** — Form submissions run on the server too. No separate API route needed.

```tsx
async function createCourseAction(formData: FormData) {
  "use server";  // This line makes it run on the server
  const title = formData.get("title") as string;
  await run("INSERT INTO courses ...", [title]);
  redirect("/school-courses");
}

// In the JSX:
<form action={createCourseAction}>
  <input name="title" />
  <button type="submit">Create</button>
</form>
```

In the old code, this required a separate `POST /school-create-course` route handler. In Next.js, the action lives right next to the form.

### TypeScript — JavaScript with type safety

TypeScript is JavaScript but it checks your code for mistakes before it runs.

```tsx
// We tell TypeScript what shape the data has
const user = await first<{ id: string; name: string; email: string }>(
  "SELECT id, name, email FROM users WHERE id=?", [userId]
);

// Now if we write user.emal (typo), TypeScript catches it immediately
// instead of crashing in production
```

Every database query in our app has typed results. Every component has typed props. Mistakes are caught at build time, not at runtime.

### Tailwind CSS — Styling with utility classes

Instead of writing CSS in separate files or inline `style=""` attributes, Tailwind uses small utility classes directly on elements.

**Old way:**
```html
<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:14px">
```

**Tailwind way:**
```tsx
<div className="flex items-center justify-between gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl">
```

Each class does one thing:
- `flex` → display: flex
- `items-center` → align-items: center
- `gap-3` → gap: 12px
- `bg-white` → white background
- `rounded-xl` → large border radius
- `hover:bg-teal-800` → darker on hover
- `text-sm` → small font size

**Where it lives:** `src/app/globals.css` has one line: `@import "tailwindcss";`. Tailwind scans our files and only includes the classes we actually use — the production CSS is tiny.

### Cloudflare Workers + OpenNext — Hosting

Next.js needs an adapter to run on Cloudflare. **OpenNext** takes the Next.js build output and transforms it into a format Cloudflare Workers can run.

- `wrangler.jsonc` — tells Cloudflare about our D1 database binding
- `open-next.config.ts` — tells OpenNext how to build
- `.github/workflows/deploy.yml` — builds on Linux (Windows has path issues) and deploys

---

## How Our App Is Structured

### `src/app/` — Pages

Every folder is a route. Every `page.tsx` file renders a page. Every `route.ts` file handles an action (like logout) without rendering UI.

**What we built:** 33 routes covering login, system admin, school admin (courses, classes, people, join codes, sittings), exam builder, grading, question bank, student dashboard, teacher dashboard, approvals inbox, and more.

### `src/components/` — Reusable pieces

Built once, used across many pages:

| Component | What it does | Where it's used |
|-----------|-------------|----------------|
| `Card` | White rounded box wrapping content | Every single page |
| `TabNav` | Tab bar for switching sections | Courses (5 tabs), classes (3), people (2), sitting builder (3), exam builder (7) |
| `DataTable` | Table with headers, rows, empty state | Available for any table |
| `PageHeader` | Title + optional back link | Course detail, class detail |
| `SchoolLayout` | Header (school name, role, links) + nav bar | All 8 school admin pages |

**Example of reuse:** `SchoolLayout` wraps every `/school-*` page. It shows the school name, role badge, switch school link, profile link, logout link, and the 6-item nav bar. In the old code, this was 35 lines of HTML duplicated on every admin page. Now it's:

```tsx
<SchoolLayout auth={auth} active={active} currentPath="/school-courses">
  {/* page content */}
</SchoolLayout>
```

### `src/lib/` — Shared backend logic

| File | What it does | Old equivalent |
|------|-------------|---------------|
| `db.ts` | `first()`, `all()`, `run()` for querying D1 | The DB helpers in `shared.js` |
| `auth.ts` | Read session cookie, look up user, check memberships, crypto helpers | `loadAuth()`, `requireLogin()`, `pbkdf2Hex()` etc. in `shared.js` |
| `env.ts` | Access `APP_SECRET` from Cloudflare env vars | `env.APP_SECRET` in the old code |

---

## What We've Used So Far

### Server Components (every page)
Every page queries the database directly on the server and returns HTML. No client-side JavaScript needed for basic rendering. This is why every page in the build output shows `f (Dynamic)` — it's server-rendered on demand.

### Server Actions (every form)
Every form submission — create course, assign teacher, enrol student, approve request, change password, etc. — uses a Server Action. The function runs on the server, does the database work, and redirects. No separate API endpoint needed.

### File-based routing (33 routes)
Each route is a folder with a `page.tsx`. The URL structure IS the folder structure.

### TypeScript (everywhere)
Every database query has typed results. Every component has typed props. Build fails if there's a type error — bugs caught before deployment.

### Tailwind CSS (everywhere)
All styling uses Tailwind utility classes. Consistent colors (teal-700 primary), consistent spacing, consistent rounded corners across every page.

### Reusable components (5 built)
`Card`, `TabNav`, `DataTable`, `PageHeader`, `SchoolLayout` — used across dozens of pages.

---

## What We Haven't Used Yet (But Will)

### Client Components (`"use client"`)

So far, every page is a **Server Component** — it runs on the server and sends HTML to the browser. There's no JavaScript running in the browser (except Next.js's minimal hydration).

**Client Components** run in the browser. They can:
- Respond to clicks, keypresses, mouse movements
- Update the UI instantly without a page reload
- Maintain local state (open/closed, selected item, timer countdown)

**Where we'll use them:**

1. **`/attempt-take` — Exam taking interface**
   - Countdown timer ticking every second
   - Question navigation (click Q1, Q2, Q3... without page reload)
   - Auto-save answers as the student types
   - Warning when time is running low

2. **Live filtering on People page**
   - Currently: change a filter → full page reload
   - With client component: change a filter → table updates instantly, no reload

3. **Expandable rows on Papers tab**
   - Click a paper → approval gates expand inline
   - No page reload, no separate page

4. **Dynamic question builder**
   - Add/remove answer options without reloading
   - Drag to reorder questions
   - Live preview as you type

**How it works:**
```tsx
"use client";  // This line makes it run in the browser

import { useState } from "react";

function FilterBar({ initialRole }) {
  const [role, setRole] = useState(initialRole);

  return (
    <select value={role} onChange={(e) => setRole(e.target.value)}>
      <option value="">All</option>
      <option value="STUDENT">Student</option>
      <option value="TEACHER">Teacher</option>
    </select>
  );
}
```

### `useState` and `useEffect` — React Hooks

These are React's tools for managing interactivity in Client Components:

- **`useState`** — remembers a value between renders. Example: which tab is selected, whether a drawer is open, the current timer value.
- **`useEffect`** — runs code when the component loads or when something changes. Example: start a timer when the exam begins, fetch data when a filter changes.

```tsx
// Timer example for exam taking
const [timeLeft, setTimeLeft] = useState(3600); // 60 minutes in seconds

useEffect(() => {
  const timer = setInterval(() => {
    setTimeLeft(prev => prev - 1);
  }, 1000);
  return () => clearInterval(timer);
}, []);
```

### Drawers and Panels

A **drawer** is a panel that slides in from the side without navigating away. Imagine clicking a student's name on the People page and a panel slides in showing their profile, courses, classes, and exam results — all without leaving the People page.

```tsx
// Future: StudentDrawer component
<StudentDrawer
  studentId={student.id}
  isOpen={drawerOpen}
  onClose={() => setDrawerOpen(false)}
/>
```

This is built as a Client Component with `useState` to track open/closed state.

### Optimistic Updates

When a user clicks "Approve" on an approval, the button could change to "Approved" instantly (optimistic) while the server request happens in the background. If the server fails, it reverts. This makes the UI feel instant.

### Loading States and Suspense

React has built-in support for showing loading spinners while data is being fetched:

```tsx
import { Suspense } from "react";

<Suspense fallback={<div>Loading results...</div>}>
  <ResultsTable examId={examId} />
</Suspense>
```

The page renders immediately with a loading message, then swaps in the real content when the data arrives.

### API Routes (if needed)

We haven't needed separate API routes yet because Server Actions handle all form submissions. But if we need the mobile app or external systems to access our data, we'd add:

```
src/app/api/
  school/courses/route.ts      → GET /api/school/courses (JSON)
  school/courses/[id]/route.ts → GET /api/school/courses/123 (JSON)
```

These return JSON instead of HTML — same database queries, different output format.

---

## How It All Connects — A Real Example

Here's what happens when a school admin visits `/school-courses` and creates a new course:

1. **Browser** requests `https://qacademy-beta-b.mybackpacc.workers.dev/school-courses`
2. **Cloudflare Workers** receives the request and runs the OpenNext handler
3. **Next.js** sees the URL matches `src/app/school-courses/page.tsx`
4. **`page.tsx`** is a Server Component — it runs on the server:
   - Calls `requireAuth()` from `src/lib/auth.ts` → reads `qa_sess` cookie → queries sessions table
   - Calls `pickActiveMembership()` → gets the active school
   - Calls `getDb().all(...)` from `src/lib/db.ts` → queries courses table via D1
   - Returns JSX that includes `<SchoolLayout>`, `<Card>`, and the course table
5. **Next.js** renders the JSX to HTML and sends it to the browser
6. **Browser** shows the page — courses list + create form
7. **Admin** types "Medical Nursing" and clicks Create
8. **Browser** submits the form to the `createCourseAction` Server Action
9. **Server Action** runs on the server:
   - Checks auth again
   - Inserts into courses table
   - Calls `redirect("/school-courses")`
10. **Browser** navigates back to the courses list — now showing the new course

No API layer. No fetch calls. No client-side JavaScript (for this flow). Just server-rendered pages with server-handled forms.

When we add Client Components later (like live filtering), steps 6-10 would happen without a full page reload — the table would update in-place.

---

## Summary

| Question | Answer |
|----------|--------|
| What is React? | A library for building reusable UI components |
| What are props? | Data you pass to a component to tell it what to display |
| What is Next.js? | React + server rendering + file-based routing + server actions |
| What is TypeScript? | JavaScript with type checking — catches bugs before deployment |
| What is Tailwind CSS? | Styling via utility classes instead of CSS files or inline styles |
| What is a Server Component? | A component that runs on the server (what we use now) |
| What is a Client Component? | A component that runs in the browser (what we'll use for interactivity) |
| What is a Server Action? | A function that runs on the server when a form is submitted |
| What are hooks? | `useState`, `useEffect` — React tools for managing interactivity |
| What are drawers? | Panels that slide in without navigating away |
| What is OpenNext? | Adapter that makes Next.js run on Cloudflare Workers |
| Where is the styling? | In Tailwind classes on each element, imported via `src/app/globals.css` |
| Where are the pages? | `src/app/<route>/page.tsx` — one file per URL |
| Where are the components? | `src/components/` — reusable across all pages |
| Where is the database logic? | `src/lib/db.ts` (queries) + `src/lib/auth.ts` (sessions) |
| What haven't we used yet? | Client Components, useState, useEffect, drawers, live filtering, API routes |
| What's the one placeholder? | `/attempt-take` — the interactive exam-taking interface |

*QAcademy Beta — Stack Guide — March 2026*
