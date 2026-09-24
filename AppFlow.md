# AppFlow.md — Screen Map & User Journeys

## 1. Global Flow

```
Login (username + password, no signup)
   │
   ├── Student  → Semester View (all subjects stacked)
   ├── Faculty  → Faculty Dashboard
   ├── HOD      → HOD Dashboard (Faculty dashboard + department admin tab)
   └── Admin    → Admin Dashboard
```

First-login has no forced password change. A "Change Password" option always lives in profile settings for every role.

## 2. Student Journey

1. **Login** → lands on **Semester View**: every current-semester subject stacked one after another on a single scrollable page (no tab-switching).
2. Each subject block shows:
   - Component breakdown (CES scores, Internal exam score, computed weightages, Attendance %, Total IA) — column shape follows that subject's actual policy (e.g. 2 vs 3 CES columns).
   - Performance chart: simple bar breakdown of CES/Internal/Attendance contribution.
   - "Raise a query" action scoped to a specific component.
3. **Query flow**: student picks a component → writes a message → submitted to that subject's Faculty. Student can track status (Open / Escalated / Resolved) and see the response thread.
4. **Notifications**: bell icon — query replies, marks published for a subject.
5. **Profile**: profile picture, editable contact fields, change password. Read-only: batch, section, enrollment info.
6. Past (completed) semesters are **not shown** to students — current semester only.

## 3. Faculty Journey

1. **Login** → **Faculty Dashboard**: list of assigned Subject Offering Sections (across any department), each tagged with status if incomplete (waiting on policy, etc. — though Faculty can't fix that themselves, just see it).
2. **Enter Marks**
   - Select a Subject Offering Section → bulk grid, one row per enrolled student, one column per policy-defined component (CES-I, CES-II, ..., Internal).
   - Live-computed weighted columns + Total IA shown alongside as marks are entered.
   - Disabled entirely with an explanatory message if the section isn't yet unlocked (no Faculty assignment or no confirmed policy — though if Faculty is viewing it, assignment exists; policy may still be pending).
   - Edits to previously saved marks are allowed, logged to audit trail.
3. **Attendance Import**
   - Select Subject Offering Section → upload CSV (`ERP, PRN, Name, Attendance%`).
   - **Dry-run preview** screen: table of what will import, highlighted rows for slab gaps (blocked, need manual entry) and unmatched ERP numbers.
   - Confirm → commits, overwriting any previous attendance values for that section.
4. **Query Inbox**
   - List of open queries against Faculty's subjects, oldest first. Reply, mark resolved (with an optional mark correction that re-triggers the audit log), or escalate to HOD if unable to resolve.
5. **Class Analytics**: per Subject Offering Section — average marks per component, attendance distribution.

## 4. HOD Journey
*(An HOD account is a Faculty account with a department flag — everything in Section 3 above still applies, plus:)*

1. **HOD Dashboard tab**: **Subject-Term Status Board** for their department — every Subject Offering Section shown as **Unassigned / Policy Pending / Active**, at a glance.
2. **Subjects Management**: create/edit subjects for their department, map each to a semester number.
3. **Faculty Assignment**: for each Subject Offering Section, assign a Faculty member (any department) — this is what unlocks marks entry for that section.
4. **Grading Policy**: per Subject Offering — configure CES components (name + max marks), CES group weightage, Internal exam (max marks + weightage), attendance slab. **"Duplicate last term's policy"** one-click pre-fills from the subject's previous offering; HOD confirms or edits.
5. **Batch Promotion**: promote any batch within their own department to the next semester — this is what auto-creates the new Academic Term and its (initially empty/unassigned) Subject Offerings.
6. **Escalated Queries**: queries Faculty couldn't resolve land here. HOD can message the student and instruct Faculty, but cannot edit the mark directly.

## 5. Admin Journey

1. **Login** → **Admin Dashboard**: institute-wide stats (departments, batches, faculty, students).
2. **Department Management**: create a Department (= Program), set its `totalSemesters`.
3. **Batch Management**: create a Batch under a Department (e.g. "2025-28"), promote any batch (fallback to HOD's own-department promotion).
4. **Faculty Onboarding**: add Faculty (name, Employee ID username, home department, optional HOD flag + department), auto-generates password, downloadable credential Excel.
5. **Student Import**: *(deferred — placeholder screen for now, format TBD)*. Once available: CSV import including Section assignment at import time, auto-generates passwords, downloadable credential Excel per batch/section.
6. **Password Resets**: force-reset any account, re-download updated credential Excel.
7. **Cross-Department Reports**: view-only access to any department's reports/data for oversight, without academic editing powers (Admin never touches grading policy or marks).

## 6. Shared Components Across Roles
- Top nav, role-based menu, department context switcher for HOD/Faculty teaching across multiple departments.
- Notification bell (all roles except Admin, who gets institute-wide system notices instead).
- Responsive tables → card collapse on mobile (attendance CSV upload and marks review are the two flows most likely to happen on the go).
- Consistent status pill styling (Open/Escalated/Resolved, Unassigned/Policy Pending/Active, attendance thresholds) — see Design.md.
