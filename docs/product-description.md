# QAcademy — Product Description

*What the platform does today, written in plain English.*

---

## What Is QAcademy

QAcademy is an online exam platform built for schools and any organisation that needs to create, run, and grade formal exams for a known group of people. An administrator sets up the organisation, adds members, and assigns them roles. Teachers create exams with a variety of question types. Students take those exams online with a timer, and the platform handles scoring, grading, and results. Everything is isolated — each organisation gets its own private space, and no one can see another organisation's data.

---

## Who Uses It — The Four Roles

### System Administrator

This is the person who runs the entire QAcademy platform. There is only one system administrator, created during the very first setup. They can see every organisation (called a "school" in the platform) and every user across the whole system. They are responsible for creating new schools, assigning the first administrator to each school, and looking up users across the platform to manage their memberships.

### School Administrator

This is the person who runs a single school or organisation. When they log in, they see a dashboard showing how many students, teachers, courses, classes, and exam sittings their school has. They also see alerts if there are pending approval requests or people waiting to join. They are responsible for setting up the organisational structure — creating courses, classes, and join codes — and managing all the people in their school.

### Teacher

This is the person who creates and manages exams. When they log in, they see their dashboard showing all the exams they have created, the courses they are assigned to, and any pending approval requests. They also have access to a personal question bank. They are responsible for building exams, adding questions, publishing exams, grading student answers for written questions, and reviewing results.

### Student

This is the person who takes exams. When they log in, they see a dashboard showing all the exams they have been given access to, along with status indicators showing which exams are open, upcoming, completed, or closed. They also see any formal exam sittings they have participated in. They are responsible for taking exams within the allowed time, and viewing their results once released.

---

## What Each Role Can Do — Full Feature List

### System Administrator

**Managing schools:**
- Create a new school by giving it a name and assigning its first administrator
- View a list of every school on the platform with its status

**Managing users:**
- Search for any user across the entire platform by email
- View every school a user belongs to and what role they have in each
- Add a user to a school with a specific role (Student, Teacher, or School Administrator)
- Change a user's role in a school they already belong to
- Reactivate a user who was previously removed from a school

**Account management:**
- View their own profile
- Change their own password
- Log out

---

### School Administrator

**Managing courses:**
- View a list of all courses in the school with teacher and student counts
- Create a new course by giving it a title
- Edit a course's title
- Archive a course that is no longer active
- Restore an archived course back to active status

**Managing teachers within courses:**
- Assign a teacher to a course
- Remove a teacher from a course

**Managing students within courses:**
- Enrol an individual student into a course
- Remove a student from a course
- Enrol an entire class of students into a course in one action
- Remove an entire class of students from a course in one action

**Managing classes:**
- View a list of all classes in the school with student counts
- Create a new class with a name, year group, academic year, and description
- Edit a class's details
- Archive a class
- Restore an archived class

**Managing students within classes:**
- Add a student to a class
- Remove a student from a class
- Enrol all students in a class into a course in one action
- Remove all students in a class from a course in one action

**Managing people:**
- View all members of the school in a filterable list — filter by role, course, or class
- Change a member's role (Student, Teacher, or School Administrator)
- Remove a member from the school entirely, which also removes all their course enrolments and teaching assignments
- Add an existing platform user to the school by looking up their email
- Create a brand new user account and add them to the school with a chosen role and temporary password

**Managing join codes:**
- View all active join codes with usage counts
- Create a join code that lets someone join the school as a student or teacher
- Create a join code that enrols someone into a specific course
- Create a join code that assigns someone as a teacher for a specific course
- Choose whether a join code auto-approves or requires administrator approval
- Set an expiry date and maximum number of uses for each code
- Revoke a join code so it can no longer be used
- Duplicate an existing join code
- View pending join requests from people who used codes that require approval
- Approve or reject pending join requests
- View a history of past approvals and rejections

**Managing exam sittings:**
- View a list of all exam sittings with their status and paper count
- Create a new exam sitting
- Edit a sitting's title, academic year, and status
- Add an existing exam as a paper in a sitting
- Create a new exam directly within a sitting
- Remove a paper from a sitting
- Assign approvers to a paper's approval gates
- Remove approvers from a paper's approval gates
- Disable an entire approval gate for a paper
- View results across all papers in a sitting

**Reviewing approvals:**
- View a list of pending approval requests assigned to them
- Approve or reject approval requests with an optional note
- View the exam content when reviewing a questions gate approval
- View student answers when reviewing a grading gate approval
- Add per-question comments during an approval review

**School overview:**
- View a dashboard with counts of students, teachers, courses, classes, and sittings
- See alerts for pending approvals and pending join requests

**Account management:**
- Switch between schools if they belong to more than one
- View their own profile and school memberships
- Change their own password
- Log out

---

### Teacher

**Creating and configuring exams:**
- Create a new exam by choosing a course and giving it a title
- Edit an exam's settings: title, description, duration, maximum attempts, score display options, pass mark percentage, question shuffling, option shuffling, review permissions, navigation mode (free or sequential), results release policy (manual, immediate, or after close), opening and closing dates, late submission policy, and exam password
- Configure grade bands for an exam — for example, A for 80% and above, B for 60% to 79%, and so on
- Add custom result fields to an exam — additional information collected from each student before they start, such as student number or class name

**Building questions:**
- Add a multiple choice question with any number of options, one correct answer, and marks
- Add a multiple select question where more than one option can be correct, with partial marking available
- Add a true or false question
- Add a short answer question that requires manual grading
- Add an essay question that requires manual grading
- Set per-option feedback that students see after submission — explaining why each option is correct or incorrect
- Set a model answer for any question
- Set general feedback for any question
- Enable partial marking on multiple select questions so students get credit for each correct option selected
- Reorder questions using up and down arrows
- Edit any question
- Delete a question
- Add questions from the question bank instead of creating them from scratch

**Publishing and closing exams:**
- Publish a draft exam, making it visible and available to students
- Close a published exam so no new attempts can start
- Release results to students manually, or have them released automatically based on the chosen policy

**Controlling access:**
- Give an individual student access to an exam
- Give all students in a class access to an exam in one action
- Give all students enrolled in a course access to an exam in one action
- Remove a student's access to an exam

**Viewing and grading results:**
- View a summary of all submissions: total submitted, in progress, needs grading, and average score
- View a detailed table of every attempt with student name, score, percentage, grade, pass or fail, time taken, and submission date
- Filter results by grading status or pass/fail
- Sort results by any column
- Export all results to a spreadsheet file
- Open any submission to grade written questions — assign a score and write a teacher note for each short answer or essay question
- View a fully graded submission in read-only mode
- See a live running score total update as grades are entered

**Managing the question bank:**
- Create a new question in the personal question bank with any of the five question types
- Edit a question in the bank
- Delete a question from the bank
- Share a personal question with the whole school so other teachers can use it
- Make a shared question personal again
- Browse the school-wide question bank to see questions shared by other teachers
- Filter bank questions by type and visibility
- Pick questions from the bank to add to an exam

**Previewing exams:**
- Preview an exam as it will appear to students, with correct answers highlighted

**Reviewing approvals:**
- View pending approval requests in an approval inbox
- Approve or reject approval requests with an optional note
- Add per-question comments when reviewing questions or grading

**Account management:**
- Switch between schools if they belong to more than one
- View their own profile
- Change their own password
- Log out

---

### Student

**Taking exams:**
- View all assigned exams on the dashboard with status badges showing open, upcoming, completed, or closed
- See how many attempts remain for each exam
- Enter an exam password if the exam requires one
- Fill in custom fields before starting if the exam has them
- Read exam instructions before starting
- Start an exam attempt, which begins the countdown timer
- Answer multiple choice questions by selecting one option
- Answer multiple select questions by selecting one or more options
- Answer true or false questions
- Type a short answer response
- Type an essay response
- Navigate freely between questions in free navigation mode
- Move through questions one at a time in sequential navigation mode
- See a question grid showing which questions are answered, unanswered, or flagged
- Flag a question to come back to later
- See marks per question during the exam if the teacher enabled this
- Have answers saved automatically as the exam progresses
- Submit the exam when finished
- Have the exam auto-submitted when the timer runs out
- Take multiple attempts if the teacher allowed more than one

**Viewing results:**
- See a confirmation screen immediately after submitting
- View a result slip showing score, percentage, grade, and pass or fail status once results are released
- See time taken and submission date
- See custom field answers on the result slip
- Review answers after submission if the teacher enabled review — see which answers were correct, which were wrong, per-option feedback, model answers, and teacher notes
- View sitting results across all papers in a formal exam sitting

**Account management:**
- Switch between schools if they belong to more than one
- View their own profile
- Change their own password
- Log out

---

## The Complete Exam Lifecycle

The journey of an exam from creation to results follows these steps:

**Step 1 — A teacher creates the exam.** From their dashboard, the teacher selects a course and gives the exam a title. The exam starts in draft status, invisible to students.

**Step 2 — The teacher configures settings.** In the exam builder, the teacher sets the duration, number of allowed attempts, pass mark, score display options, whether questions and options should be shuffled, the navigation mode, and the results release policy. They can also set opening and closing dates, an exam password, and grade bands.

**Step 3 — The teacher adds questions.** Using the questions tab, the teacher adds questions one by one — choosing from multiple choice, multiple select, true/false, short answer, or essay. Each question gets a mark value. The teacher can set correct answers, per-option feedback, model answers, and enable partial marking. They can also pull questions from the question bank. Every question created here is automatically saved to the teacher's personal question bank for future reuse.

**Step 4 — The teacher controls access.** On the access tab, the teacher specifies which students can take this exam. They can add students individually, add an entire class, or add all students enrolled in a course.

**Step 5 — The teacher publishes the exam.** On the publish tab, the teacher clicks Publish. The exam must have at least one question. Once published, students with access can see it on their dashboard and start attempting it.

**Step 6 — A student takes the exam.** The student sees the exam on their dashboard, clicks Start, enters the exam password if required, fills in any custom fields, reads the instructions, and begins. A countdown timer appears. They work through the questions, and their answers are saved automatically as they go. When finished, they click Submit — or the exam auto-submits when time runs out.

**Step 7 — Automatic grading happens immediately.** For multiple choice, multiple select, and true/false questions, the platform scores them automatically the moment the exam is submitted. The student sees a confirmation screen.

**Step 8 — The teacher grades written questions.** If the exam contains short answer or essay questions, the teacher opens the grading screen from the results tab. They see the student's answer alongside the model answer, and assign a score and optional teacher note for each question. A live sidebar shows which questions still need grading and a running score total.

**Step 9 — Results are released to students.** Depending on the release policy the teacher chose, results are released immediately on submission, automatically when the exam closes, or manually when the teacher clicks Release Results. Once released, students can view their score, percentage, grade, and pass or fail status. If the teacher enabled review, students can also see which answers were correct, read per-option feedback, and view model answers.

**Step 10 — Approval gates (if configured).** If the exam is part of a formal sitting with approval gates, additional oversight steps happen. Before the exam is published, designated approvers may need to review and approve the questions. Before results are released, approvers may need to review the grading. This is described in detail in the approval gate section below.

---

## Sittings — Formal Exam Sessions

A sitting is a way to group multiple exams together into a single formal exam session. Think of a school running end-of-term exams — there might be a Mathematics paper, an English paper, and a Science paper, all part of the same sitting called "Term 1 Final Exams 2026."

A school administrator creates a sitting, then adds exams to it as papers. Each paper can have its own approval gates — people who must review and sign off on the questions, grading, or results before they go live.

Sittings start in draft status and can be moved to active or closed. The sitting builder has three tabs: settings for the title and status, papers for managing which exams are included, and results for viewing submissions across all papers.

For students, sittings appear on their dashboard as a separate section. They can click into a sitting to see their results across all the papers in that sitting in one place, rather than checking each exam individually.

Sittings are a grouping and oversight tool — the platform delivers results per individual paper, not as a combined sitting score.

---

## The Approval Gate System

The approval gate system adds formal oversight to the exam process. It is designed for situations where a school or organisation needs someone other than the exam creator to review and sign off before things go live.

There are three gates:

**Questions gate** — an approver reviews the exam questions before the exam is published. They see all the questions, correct answers, and marking schemes, and can leave per-question comments. They then approve or reject with a note. This ensures the quality and accuracy of exam content before students see it.

**Grading gate** — an approver reviews how a teacher graded written questions before results are released. They see the student's answers, the teacher's scores and notes, and can leave per-question comments. They then approve or reject. This ensures grading fairness and consistency.

**Results gate** — an approver reviews the final results before they are released to students. They see the complete set of results and can approve or reject. This ensures the final output is correct before students see their grades.

Each gate can have one or more approvers assigned. Approvers see pending requests in their approval inbox and can approve or reject with an optional note. Gates are optional — a school only enables the ones they need. If no approvers are assigned to a gate, that gate is inactive and has no effect.

This system exists because formal exam contexts — particularly in schools and professional bodies — require oversight. A single teacher should not be the sole authority on question quality, grading fairness, and result accuracy. The gate system makes this oversight structured and traceable.

---

## The Question Bank

The question bank is a personal and shared library of questions that teachers can build up over time and reuse across multiple exams.

Every teacher has access to the question bank. When a teacher creates a question inside an exam, that question is automatically saved to their personal bank. They can also create questions directly in the bank without attaching them to any exam.

Questions in the bank are either personal or shared. A personal question is visible only to the teacher who created it. A shared question is visible to every teacher in the school. A teacher can toggle a question between personal and shared at any time.

When building an exam, a teacher can browse the question bank — including questions shared by other teachers — and add them to the exam with one click. This saves time and encourages consistency across exams.

The bank supports all five question types, and questions can be filtered by type and visibility. Only the teacher who created a question can edit, delete, or change its sharing status.

---

## Join Codes — How People Join

Join codes are the primary way new people are added to a school or course without the administrator manually creating their account.

A school administrator creates a join code and chooses what it does:

- **Join the school as a student** — the person becomes a student member of the school
- **Join the school as a teacher** — the person becomes a teacher member of the school
- **Enrol in a specific course** — the person is enrolled as a student in a particular course
- **Be assigned as a teacher for a specific course** — the person is assigned to teach a particular course

Each code has settings: whether it auto-approves instantly or requires administrator approval first, when it expires, and how many times it can be used.

When someone uses a join code, they go to the join page, enter the code, and see a preview showing which school and role the code is for. If they already have an account, they log in and the code takes effect. If they do not have an account, they create one on the same page — name, email, and password — and the code takes effect immediately after.

If the code requires approval, the person's request appears in the administrator's pending requests queue. The administrator can then approve or reject it. If the code auto-approves, the person is added immediately with no waiting.

Join codes are particularly useful for schools onboarding large numbers of students — the administrator creates one code, shares it with the class, and everyone joins themselves.

---

## What Makes QAcademy Distinctive

**Approval gates** — a structured oversight system where designated people must review and sign off on exam questions, grading, and results before they reach students. Most exam platforms have nothing like this. It is a formal quality control system built into the platform.

**Sittings** — the ability to group multiple exams into a formal session, assign approval gates per paper, and let students view results across all papers in one place. Most school platforms treat exams as completely independent items with no grouping concept.

**Five question types with rich feedback** — multiple choice, multiple select, true/false, short answer, and essay, all with per-option feedback explaining why each answer is correct or incorrect, model answers, general feedback, and partial marking. Students do not just see a score — they understand what they got wrong and why.

**Automatic and manual grading in one exam** — objective questions are graded instantly on submission, while written questions wait for teacher grading. The teacher sees a clear grading interface with a live score sidebar showing progress.

**Multi-tenant isolation** — every school or organisation gets a completely separate space. Data never leaks between organisations. A single platform serves unlimited schools.

**Join codes with approval control** — a flexible system for onboarding people that ranges from instant auto-approve to administrator-reviewed approval, with usage limits and expiry dates.

**Grade bands and custom result fields** — teachers can define grade boundaries (A, B, C, etc.) and add custom fields collected from students before each exam, all of which appear on the result slip.

**CSV export of results** — teachers can download a spreadsheet of all submissions with scores, grades, time taken, and custom field values.

**Multiple attempts** — teachers can allow students to take an exam more than once, with each attempt tracked separately.

---

## What The Platform Cannot Do Yet

~~There is no way for a user to reset a forgotten password.~~ **Done** — users can reset their own password via a secure email link. Tokens are hashed before storage, single-use, and expire after 1 hour. All existing sessions are killed on password reset.

The platform sends no emails other than password reset — no notifications when an exam is published, when results are released, when an approval is needed, or when a join request is pending. Users must log in to discover anything has happened.

~~There is no rate limiting on the login page.~~ **Done** — login is rate limited across three dimensions (email, IP, user ID). 5 failures in 10 minutes or 10 in 24 hours blocks further attempts. Every login attempt is logged to an audit table.

There is no email verification — any email address can be used to create an account without proving ownership.

~~There is no account lockout after repeated failed login attempts.~~ **Done** — rate limiting blocks login after repeated failures. Concurrent sessions are limited to 2 per user.

There is no way to import students or questions in bulk from a spreadsheet — every person and every question must be added one at a time.

There is no aggregate reporting — no class averages, no question-level performance analysis, no cohort comparisons. Teachers see individual results but cannot see trends.

There is no data export for an entire school — if an organisation wanted to take all their data and leave, there is no built-in way to do that.

There is no self-service signup for new schools — only the system administrator can create a new school. This means the platform cannot scale without manual intervention.

There is no certificate or downloadable result document — students can view results on screen but cannot download or print a formal certificate.

~~There is no audit trail.~~ **Partially done** — every login attempt and password reset request is logged with timestamp, IP hash, User-Agent, and outcome. Data change auditing (who edited what) is not yet built.

~~There is no session management.~~ **Done** — D1 session tracking with concurrent limits (max 2 active sessions), automatic session revocation on password reset, and idle timeout with cross-tab sync. Users cannot yet view their own active sessions in a UI, but the backend tracking and enforcement is complete.

There is no confirmation dialog on destructive actions — clicking Remove, Delete, or Revoke takes effect immediately with no warning or undo option.

The platform gives no visible feedback after most actions — there is no success message after saving settings, adding a person, or completing a grading session. The page simply reloads.

There is no drag-and-drop for reordering questions — teachers must use up and down arrow buttons, each of which causes a full page reload.

The visual design is functional but not polished — the platform works correctly but does not yet look like a finished commercial product.

There is no mobile-specific design — the platform works on phones but is not optimised for small screens.

The platform cannot be installed as an app on a phone or desktop — it is a website only.

There is no proctoring or anti-cheating capability — no copy-paste prevention, no tab-switching detection, no webcam monitoring.

There is no accessibility support — no screen reader optimisation, no keyboard-only navigation.

There is no way for a member of the public to find and register for an exam — the platform only works for people who have already been added to an organisation.

---

## Summary

QAcademy is a working multi-tenant exam platform with a genuinely strong core. The exam engine supports five question types with rich feedback, automatic and manual grading, grade bands, and multiple attempts. The approval gate system and sittings are features that most competitors do not have at all. The multi-tenant architecture means it can serve unlimited schools from a single platform. The join code system makes onboarding practical for real schools. Authentication and security are now production-grade — NextAuth v5 with email+password and SSO, password reset, rate limiting, concurrent session limits, idle timeout, session revocation, and full auth event logging. What remains are email notifications, bulk import, visual polish, and email verification — the gaps that separate a secure working platform from a fully polished product. Any organisation willing to work within those current limitations could use it today for real exams.

---

*Last updated: 2026-03-29 — Security features marked as done (password reset, rate limiting, session management, audit logging).*
