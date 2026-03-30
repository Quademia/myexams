# QAcademy Beta-B — System UI Capability Map

This document explains how the current stack should be used when planning and building interfaces.

It is meant to stop the product from becoming a collection of disconnected pages and to guide future UX decisions.

---

## 1. Core principle

The new stack should be used to build **software-style workspaces**, not just separate pages with forms.

That means the interface should prefer:
- one main workspace per role
- module switching inside the workspace
- actions in context
- drawers / modals / tabs / panels
- reusable components
- less page jumping

The goal is not visual complexity. The goal is a cleaner and more scalable user experience.

---

## 2. What the current stack enables

Current stack in this repo:
- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- NextAuth v5
- Cloudflare Workers via OpenNext
- D1 for data/auth storage

### What this stack enables in practice

#### A. Console-style interfaces
Examples:
- System Admin Console
- Teacher Console
- Student Dashboard Workspace
- School Admin Workspace

These should feel like real applications rather than loose pages.

#### B. Rich interaction patterns
The stack supports patterns such as:
- right drawers / slide-over panels
- modals
- tabbed workspaces
- inline detail panels
- split views
- command bars / action bars
- sticky toolbars
- searchable tables
- empty / loading / success / error states

#### C. Reusable component system
Once built well, the same UI building blocks should be reused across the app.

Examples:
- page shell
- sidebar
- topbar
- stat card
- data table
- drawer
- modal
- badge/chip
- empty state
- form section
- banner/alert

#### D. In-place actions
Where possible, users should not be forced through many separate pages to complete simple tasks.

Examples:
- create school in a drawer
- manage user access in a drawer
- preview school details in a side panel
- open result details without leaving the main workspace

---

## 3. Product-wide interaction standards

### 3.1 Use workspaces, not page sprawl
Preferred pattern:
- left navigation or top module bar
- one active workspace
- contextual right drawer for create/edit/detail actions

Avoid:
- too many separate pages for small actions
- long stacked admin pages with many unrelated forms always open

### 3.2 Use drawers for context-heavy actions
Use drawers for:
- create/edit forms
- detail views
- access management
- side-panel inspection of a record

Avoid nested drawers unless absolutely necessary.

Rule: one main drawer at a time.

### 3.3 Use modals for short confirmation / interruptive tasks
Use modals for:
- confirm delete
- confirm publish
- confirm suspend/activate
- small forms that do not need a full drawer

### 3.4 Use tabs for parallel sections within one module
Use tabs when content belongs to the same object/module.

Examples:
- Settings / Classes / Questions / Publish inside a builder
- Overview / Schools / Users inside System Admin

### 3.5 Use tables/lists for management modules
Admin-like modules should prefer:
- searchable tables
- row actions
- detail drawer from a row

Avoid turning management modules into long freeform pages.

### 3.6 Design all key states intentionally
Every important screen should consider:
- normal state
- empty state
- loading state
- error state
- no-access / pending state
- success state

---

## 4. System Admin — target direction

System Admin should be treated as a **desktop admin console**.

### Active modules now
- Overview
- Schools
- Users

### Future modules to expose visually but keep inactive for now
- Payments
- Sessions Audit
- Auth Audit
- Question Bank
- Settings

### Current real functionality that must remain intact
- create school + assign first school admin
- search/find users by email
- add/update memberships
- list schools

### Target interaction model
- left sidebar module navigation
- top utility bar
- central workspace
- right-side drawers for actions/details

### Current best direction

#### Overview
- stat cards
- recent schools
- quick actions

#### Schools
- schools table/list
- New School button
- New School drawer
- School Details drawer

#### Users
- user search
- user results table
- membership summary
- Manage Access drawer

---

## 5. School Admin / Teacher / Student implications

The same design philosophy should eventually apply to other roles.

### School Admin
Should become an operations workspace rather than a loose page collection.

### Teacher
Should become a teaching workspace with:
- classes
- exams/quizzes
- schedules
- student progress
- approval/review areas

### Student
Should become a simpler focused dashboard with:
- current school context
- active papers/exams
- results
- review/history
- notifications later

---

## 6. What not to overdo

The new stack supports many UI patterns, but the product should not become noisy.

Avoid:
- too many nested layers
- too many simultaneous panels
- fake modules that appear fully active but are not built
- over-fragmenting into many tiny pages for small actions
- building every component abstraction too early

Good rule:
1. prove the UX first
2. then extract reusable components
3. avoid over-architecting before patterns are stable

---

## 7. Practical build rule going forward

Before building a significant new interface:
1. define the page/workspace purpose
2. define the user role
3. define the module structure
4. define the actions
5. define the key states
6. decide whether actions belong in-page, modal, or drawer
7. only then implement

This can be done by:
- discussion in chat
- rough mockup / AI-generated UI draft / screenshot markup
- then implementation in code

Figma is optional. Clear planning is mandatory.

---

## 8. Immediate next UX priorities

### Priority 1
System Admin console shell
- Overview
- Schools
- Users
- drawers for actions/details

### Priority 2
Componentize proven System Admin patterns
- shell
- sidebar
- topbar
- drawer
- tables/panels

### Priority 3
Apply the same interaction language to future role workspaces
- School Admin
- Teacher
- Student

---

## 9. Summary

The new stack should be used to build:
- fewer disconnected pages
- more structured workspaces
- more reusable components
- more in-context actions
- better state handling
- scalable role-based consoles

The main design goal is:

**software-like UX with controlled complexity**
