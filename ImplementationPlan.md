# ImplementationPlan.md — Phased Timeline

## Phase 0: Discovery & Setup (Days 1–2)
- Repo scaffold: `frontend/` (Next.js) + `backend/` (Express), shared `.env.example`.
- Supabase project + Prisma schema from Schema.md, first migration.
- Seed script: 1 Admin, 2 Departments (different `totalSemesters`, e.g. BCA=6, MCA=4 — to stress-test the "no hardcoded 6" requirement immediately), 2 Batches, a handful of Faculty (one dual-role HOD), ~15 seed students per batch, 3–4 Subjects with different CES counts/max marks to prove the policy engine is genuinely configurable from day one.

## Phase 1: Auth & Structure (Days 3–6)
- JWT auth, no-signup account creation, random password generator (ambiguous-char-free), login lockout (5 attempts → reset-or-24h-wait).
- Admin: Department CRUD, Batch CRUD + promote, Faculty onboarding (+ HOD flag), credential Excel export, force-reset.
- Role-based route protection, **HOD department-scoping enforced server-side** (not just UI-hidden) — write a test for this specifically, it's the easiest thing to get subtly wrong.

## Phase 2: Academic Structure (Days 7–9)
- HOD: Subject CRUD + semester mapping.
- AcademicTerm auto-creation on batch promotion (create-or-reuse logic).
- SubjectOffering + SubjectOfferingSection scaffolding, Faculty assignment per section.
- HOD Status Board (Unassigned/Policy Pending/Active).

## Phase 3: Grading Policy Engine (Days 10–13)
- GradingPolicy + ScoreComponent + AttendanceSlabRange CRUD, HOD policy builder UI with live total computation and slab gap/overlap validation.
- "Duplicate last term's policy" action.
- Core grading engine pure functions (Section 2 of TechSpec) — **write these test-first**, since correctness here is the whole point of the project. Test with genuinely different configs (2 CES vs 3 CES, 40 vs 50 internal) to prove no hardcoding leaked in.
- Locking logic: marks/attendance routes reject with 423 until faculty + confirmed policy both exist.

## Phase 4: Marks Module (Days 14–16)
- Faculty: bulk marks entry grid, dynamic columns from policy, live-computed weighted values.
- Audit log wiring for mark edits.
- Student: semester view with per-subject breakdown (uses the same grading engine functions, read-only).

## Phase 5: Attendance Module (Days 17–19)
- CSV upload → dry-run preview (ready / blocked-slab-gap / unmatched rows) → commit (overwrite pattern, no history table).
- Student: attendance % shown within their subject breakdown.

## Phase 6: Queries & Notifications (Days 20–22)
- Query creation (student → faculty), thread messages, escalate action (faculty or student-triggered), HOD instruct-only response (no direct mark edit — enforce server-side).
- Notification table + bell UI: query replies, marks published, import blocked rows, offering unlocked. Simple polling to start; revisit Supabase Realtime later if it feels laggy.

## Phase 7: Reports & QoL (Days 23–25)
- Dynamic-column report export (CSV/XLSX) per Subject Offering.
- Per-student PDF mark sheet (pdfkit/puppeteer), styled like the original Excel.
- Student performance bar chart (Recharts).
- Profile screens: picture upload (Supabase Storage), editable fields, change password.

## Phase 8: Testing & Polish (Days 26–28)
- Full Jest/Vitest suite: grading engine, attendance dry-run, lockout logic, HOD department-scoping.
- **Verification standard**: Aarav runs `npm test` and `npm run build` himself, pastes raw terminal output — not summarized by the coding agent.
- Manual QA: full walkthrough of a batch promotion (new AcademicTerm appears, offerings show Unassigned) → HOD assigns faculty + confirms policy → Faculty enters marks + imports attendance → Student sees live breakdown → raises a query → Faculty resolves → escalation path tested separately.
- Mobile responsiveness pass on attendance import and marks-check flows specifically.

## Phase 9: Deployment (Days 29–30)
- Backend → Render, frontend → Vercel, `Asia/Kolkata` timezone confirmed across term dates and audit timestamps.
- Sentry wired in production.
- Final smoke test across all four roles on production URLs.

## Deferred to a Later Update
- **Student bulk import via CSV** — format not yet finalized (waiting on the real file). Everything else (Faculty onboarding, credential export, attendance import) ships without it; students can be added manually via a single-entry Admin form in the meantime if needed for early testing.
- SMS-based password reset (no viable free Indian provider).
- Snapshot history for attendance (currently overwrite-only, by design).

## Standing Rules (carried over from your other projects)
- Test/build verification is run by Aarav himself in terminal, raw output pasted — never a coding-agent summary. Everything else stays with the agent.
- These six docs are the authoritative reference — point Antigravity at this folder before it writes any code.
- Scope additions beyond this plan require explicit approval after core reliability work is done.
