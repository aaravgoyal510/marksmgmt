# PRD.md — Internal Assessment (IA) & Attendance Portal

## 1. Problem Statement
BVIMR currently computes Internal Assessment (IA) marks in per-subject Excel sheets — CES tests, an internal exam, and attendance combined into a weighted "Total IA Marks." This is manually maintained, has no student visibility, no structured grievance process, and the grading formula itself (number of CES tests, max marks, weightages, attendance-to-marks conversion) **changes by policy every semester and varies by subject**. A hardcoded formula would break within a year.

This project replaces that workflow with a web portal, designed from day one to run **multiple departments long-term without code changes** when policy, program structure, or grading rules shift.

## 2. Reference Format
Derived from BVIMR's actual "Semester Wise Consolidated Report" (`BCA_V_SEM_CONSOLIDATED_LIST.xlsx`):
`Enrollment No | PRN | Name | Section | CES-I | CES-II | Weightage of CES | Internal-I | Weightage of Internals | Attendance | Total IA Marks`

The raw scores (CES tests, internal exam, attendance %) are faculty-entered. The weighted columns are **derived from a configurable policy**, not fixed code.

## 3. Roles

| Role | Scope | Responsibilities |
|---|---|---|
| **Admin** | Institute-wide | Creates Departments (programs), creates/promotes Batches (any dept), onboards Faculty (assigns home department, sets HOD flags), imports Students via CSV *(format TBD — deferred to a later update)*, assigns students to Sections at import time, force-resets passwords, downloads credential Excel files |
| **HOD** | Own department only (a Faculty account with a department flag) | Creates/edits Subjects and their semester mapping, assigns Faculty to each Subject-Offering-Section, configures Grading Policy per Subject-Offering, promotes batches within their own department, receives escalated queries (instruct-only, cannot edit marks) |
| **Faculty** | Their assigned Subject-Offering-Sections, across any department | Enters CES/Internal marks, uploads attendance CSV per subject-section, responds to student queries first-line, makes actual mark corrections |
| **Student** | Own record only | Views current semester's subjects (all stacked on one page) with full IA breakdown, raises queries against a specific mark |

A person can simultaneously be a Faculty member teaching subjects in multiple departments and an HOD of exactly one department — HOD powers are scoped to that one department; their teaching assignments elsewhere are normal Faculty work.

## 4. Core Data Model Concepts (see Schema.md for full detail)
- **Department = Program** (1:1) — e.g. BCA, MCA — each with its own `totalSemesters` (6 for BCA, 4 for MCA, 8 for a B.Tech, etc.). Batch duration is derived (`totalSemesters / 2` years), never hardcoded.
- **Batch** (e.g. "2025-28") — permanently tied to one Department, has a promotable `currentSemester`. Promotion moves the *whole batch* at once. Individual students can have a `semesterOverride` for repeaters, without leaving their batch.
- **Section** — free-text label (M, AFT, etc.), assigned to students at import time by Admin.
- **Subject** — belongs to a Department, mapped to a semester number, managed by HOD.
- **Academic Term** — created automatically when a batch is promoted into a semester (or reused if one already exists for that department + semester). Groups that semester's Subject Offerings.
- **Subject Offering** — a subject's instance within one Academic Term. Carries the Grading Policy (shared across all its sections) and requires all its Sections to have Faculty assigned before it "unlocks."
- **Subject Offering Section** — a specific Section's teaching assignment within a Subject Offering. Different sections of the same subject can have different Faculty.

## 5. Core Features (MVP)

### 5.1 Grading Policy Engine
Per Subject Offering, HOD configures:
- Any number of **CES components** (name + max marks each), combined proportionally into a target **CES group weightage**.
- **Internal exam** component (max marks + target weightage) — max marks vary per subject (40, 50, etc.), not fixed.
- **Attendance slab** — HOD-defined table of % ranges → marks, up to a target attendance weightage.
- **Total IA marks** — simply whatever the above components sum to (no hardcoded "40"), validated/displayed at save time.
- Policy defaults from the *previous* offering of the same subject (one-click "duplicate last term's policy"), which HOD can confirm as-is or edit.

### 5.2 Marks Entry (Faculty)
- Bulk grid per Subject Offering Section: raw CES/Internal scores in, live-computed weighted columns + Total IA out.
- Locked entirely until that Subject Offering Section has both a Faculty assignment **and** a confirmed Grading Policy.
- Edits after initial entry are logged to an audit trail (who, when, old → new).

### 5.3 Attendance Import (CSV)
- Format (confirmed from a real sample): `ERP No, PRN, Name, Attendance%` — a dated snapshot ("as on [date]"), not per-lecture data.
- Faculty uploads per Subject Offering Section they teach. **Each new upload overwrites the previous value** — no snapshot history kept.
- Matched to enrolled students by ERP/PRN; Name is shown for human verification only.
- **Dry-run preview** before committing: shows what will import, and flags any row whose % falls in a gap in the HOD's slab (not covered by any range) — those rows are **blocked from import** and flagged for manual entry, never silently defaulted.

### 5.4 Student View + Query/Grievance
- Student's landing page: all current-semester subjects stacked one after another on a single page, each with full IA breakdown.
- Student raises a query against a specific component, addressed to that subject's Faculty first.
- If unresolved, student (or Faculty) escalates to the department's HOD. HOD can instruct but **never edits marks directly** — only Faculty can make the actual correction, preserving a clean audit trail of who did what.
- Students never see past (completed) semesters in this view — that's Faculty/HOD/Admin-only, for record-keeping.

### 5.5 Reports (HOD/Admin)
- Consolidated report per Subject Offering, columns **generated dynamically** from that offering's actual policy shape (e.g. 2 CES columns for one subject, 3 for another) — not a fixed layout.
- Exportable in a format matching the original Excel structure, for continued submission to the university.
- Per-student downloadable PDF mark sheet, styled like the Excel report.
- Full history of past terms/offerings visible to Faculty/HOD/Admin (re-verification, transcripts) — never wiped on promotion.

### 5.6 Auth & Accounts
- **No signup** — accounts created only by Admin (Faculty/HOD) or via Admin's student CSV import.
- **Username**: ERP/Enrollment No for students, Employee ID for Faculty/HOD/Admin.
- **Password**: randomly generated at creation (ambiguous characters like `0/O`, `1/l/I` excluded, since it's read off a printed handout), distributed 1:1 — **no forced change on first login**, since it's never shared/guessable.
- **Credential distribution**: Admin can bulk-download an Excel of `username, password` per batch/section right after creation.
- **Password reset**: self-service via registered email, or Admin/HOD force-reset as fallback (same downloadable-Excel mechanism). SMS-based reset is a stretch goal, not MVP (no viable free SMS provider in India).
- **Login lockout**: 5 failed attempts → user chooses between an immediate reset flow or a 24-hour cooldown wait.
- **Profile**: profile picture, editable basic fields, optional change-password screen.

### 5.7 Quality-of-Life Additions
- In-app notifications: query replies, marks published, attendance rows blocked on import, subject-offering unlocked.
- CSV dry-run preview (attendance import).
- Downloadable per-student PDF mark sheet.
- HOD status board: every Subject Offering Section shown as Unassigned / Policy Pending / Active at a glance.
- Student performance chart: simple bar breakdown of CES/Internal/Attendance per subject.
- "Duplicate last term's policy" one-click action for HOD.

### 5.8 Rollout & Production Readiness (v1.1)
- **Controlled Marks Release**: Marks are published to students explicitly by teaching faculty (`POST /api/sections/[id]/marks/publish`). Unpublished sections display "Not yet published" and omit marks from student semester views and PDFs.
- **Bulk Marks Upload**: Faculty can upload component marks via CSV or Excel (.xlsx) with header normalization (`normalizeComponentHeader`), preview row validation (`READY`, `UNMATCHED`, `OUT_OF_BOUNDS`, `BLANK`), and transactional commit under audit logging.
- **Batch Promotion Dry-Run**: Administrators and HODs preview target semester, offerings created, and student overrides prior to committing promotions.
- **Account Lifecycle & Security**: Admin soft-deactivation (`isActive: false`), global session revocation (`POST /api/auth/logout-everywhere` with `tokenVersion`), and strict 15-minute access token lifespan.
- **Automated Grievance SLA**: Nightly cron (`/api/cron/query-sla`) reminds faculty at 48 hours and auto-escalates to HOD at 96 hours.
- **Department & Section Analytics**: Recharts and Tailwind visual distributions (averages, median, standard deviation, grade bands, and attendance shortfall detection) for faculty and HODs.
- **Consolidated Student Transcript**: Staff can export multi-term transcripts (`/api/students/[id]/transcript/pdf`) consolidating all published offerings.
- **Interactive Role Help**: Accessible `/help` center with walkthroughs and exact grade formula verification.

## 6. Out of Scope (MVP)
- External/semester exam marks.
- Multi-institute support (single-institute by design, permanently).
- SMS-based password reset.
- Student bulk-import CSV logic — **deferred to a later update**, format not yet finalized. Everything else (Faculty CSV import, attendance CSV import, credential Excel export) is in scope now.
- Timetable-linked/per-lecture attendance (CSV snapshot import only).

## 7. Success Criteria
- HOD can configure or duplicate-and-edit a Subject Offering's grading policy in under 5 minutes.
- Faculty can bulk-enter marks for a class and see a live-computed Total IA matching what the policy defines — no hardcoded assumptions about component count or max marks anywhere in the code path.
- Attendance CSV import correctly applies the slab, blocks and flags any out-of-range rows, and shows a dry-run preview before committing.
- A student can view their full current-semester IA breakdown and successfully raise and escalate a query.
- Department/program structure (e.g. adding a new 4-semester MCA department) requires **zero code changes** — purely Admin/HOD configuration.
