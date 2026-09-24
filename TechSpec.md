# TechSpec.md — Technical Specification

## 1. Stack Overview
- **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS, Recharts (performance charts), deployed to **Vercel**.
- **Backend:** Express.js (Node/TypeScript), REST API, deployed to **Render** (note: free tier spins down on inactivity — expect a 30–60s cold start on the first request after idle).
- **Database:** PostgreSQL via **Supabase**, accessed through **Prisma ORM**.
- **File storage:** Supabase Storage (profile pictures) — same free tier as the DB, no separate service.
- **Auth:** JWT (access + refresh token), bcrypt password hashing. No signup route — accounts created only by Admin/HOD actions.
- **Email:** **Resend** (already used on Quiz Portal) — password reset links, notification digests if added later. Free tier: 3,000/month, 100/day.
- **SMS:** none for MVP — no viable free Indian SMS provider; self-service reset is email-only, SMS is a stretch goal.
- **Error tracking:** **Sentry** (already used on Quiz Portal) — reused here for production error visibility.
- **Excel generation:** `exceljs` — credential exports, report exports.
- **PDF generation:** `pdfkit` or `puppeteer` — per-student mark sheet.
- **CSV parsing:** `papaparse` or `csv-parse` — attendance import.
- **Timezone:** `Asia/Kolkata` explicitly for all term dates, attendance snapshot timestamps, and audit log timestamps.

This mirrors your Quiz Portal architecture (Next.js/Express split, Prisma+Supabase, JWT, Resend, Sentry) intentionally — reuse boilerplate and deployment config rather than re-solving solved problems.

## 2. Grading Engine — Core Logic (the heart of this system)

This must be a pure, config-driven calculation — **no hardcoded component counts, max marks, or totals anywhere in this logic.**

```typescript
type ScoreComponent = { id: string; group: "CES" | "INTERNAL"; maxMarks: number };
type Mark = { scoreComponentId: string; marksObtained: number };
type SlabRange = { minPercent: number; maxPercent: number; marks: number };

function groupScore(
  components: ScoreComponent[],
  marks: Mark[],
  group: "CES" | "INTERNAL",
  groupWeightage: number
): number {
  const groupComponents = components.filter((c) => c.group === group);
  const maxTotal = groupComponents.reduce((sum, c) => sum + c.maxMarks, 0);
  const obtainedTotal = groupComponents.reduce((sum, c) => {
    const mark = marks.find((m) => m.scoreComponentId === c.id);
    return sum + (mark?.marksObtained ?? 0);
  }, 0);
  if (maxTotal === 0) return 0;
  return (obtainedTotal / maxTotal) * groupWeightage;
}

function attendanceScore(attendancePercent: number, slabs: SlabRange[]): number | null {
  const match = slabs.find(
    (s) => attendancePercent >= s.minPercent && attendancePercent <= s.maxPercent
  );
  return match ? match.marks : null; // null = gap in slab, should never reach here post-import-validation
}

function totalIA(
  components: ScoreComponent[],
  marks: Mark[],
  cesWeightage: number,
  internalWeightage: number,
  attendancePercent: number,
  slabs: SlabRange[]
): number {
  const ces = groupScore(components, marks, "CES", cesWeightage);
  const internal = groupScore(components, marks, "INTERNAL", internalWeightage);
  const attendance = attendanceScore(attendancePercent, slabs) ?? 0;
  return ces + internal + attendance;
}
```

## 3. API Layer — Key Routes

### Auth
```
POST /api/auth/login                { username, password } → { accessToken, refreshToken, user }
POST /api/auth/refresh              { refreshToken } → { accessToken }
POST /api/auth/forgot-password      { email } → sends reset link via Resend
POST /api/auth/reset-password       { token, newPassword }
```

### Admin — Structure
```
POST /api/admin/departments                 { name, totalSemesters }
POST /api/admin/batches                     { departmentId, label, startYear }
POST /api/admin/batches/:id/promote         whole-batch semester bump
POST /api/admin/faculty                     { name, employeeId, email, homeDepartmentId, isHOD, hodDepartmentId }
GET  /api/admin/faculty/:id/credentials     downloadable .xlsx (username + generated password)
POST /api/admin/students/import             (placeholder — deferred, format TBD)
POST /api/admin/users/:id/force-reset       generates new password, returns downloadable .xlsx
```

### HOD — Academic Management (department-scoped, enforced server-side via HODAssignment lookup)
```
POST /api/hod/subjects                                  create subject { name, code, semesterNumber }
GET  /api/hod/subject-offerings?termId=                 status board for department
POST /api/hod/subject-offerings/:id/sections/:secId/assign-faculty   { facultyId }
POST /api/hod/subject-offerings/:id/policy               create/update GradingPolicy
POST /api/hod/subject-offerings/:id/policy/duplicate-last-term
POST /api/hod/subject-offerings/:id/policy/confirm
POST /api/hod/batches/:id/promote                        own-department only
GET  /api/hod/queries?status=ESCALATED
POST /api/hod/queries/:id/message
```

### Faculty — Marks
```
GET  /api/sections/:id/components              policy-driven column list for this section's offering
GET  /api/sections/:id/marks                    marks grid
PUT  /api/marks/bulk                            { entries: [{ scoreComponentId, studentId, marksObtained }] }
```
Bulk upsert is rejected with 423 Locked if `facultyId` is null or `GradingPolicy.confirmedAt` is null for the target section.

### Faculty — Attendance
```
POST /api/sections/:id/attendance/preview       CSV upload → dry-run result (import-ready rows, blocked rows, unmatched rows)
POST /api/sections/:id/attendance/commit         commits a previously-previewed import
```

### Student
```
GET /api/students/me/semester-view              all current-semester subjects with full breakdown
POST /api/queries                                { subjectOfferingSectionId, scoreComponentId?, message }
POST /api/queries/:id/escalate
```

### Reports
```
GET /api/reports/subject-offerings/:id/export?format=csv|xlsx    dynamic columns from policy
GET /api/reports/students/:id/subject-offerings/:offeringId/pdf  per-student mark sheet
```

## 4. Auth Middleware Pattern (Express)
```typescript
export function requireAuth(roles?: string[]) {
  return (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "No token" });
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as any;
      if (roles && !roles.includes(payload.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      req.user = payload;
      next();
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }
  };
}

// HOD department-scoping — checked server-side on every HOD route, not just hidden in the UI
export async function requireHODOf(departmentIdParam: string) {
  return async (req, res, next) => {
    const assignment = await prisma.hODAssignment.findFirst({
      where: { facultyId: req.user.facultyId, departmentId: req.params[departmentIdParam] },
    });
    if (!assignment) return res.status(403).json({ error: "Not HOD of this department" });
    next();
  };
}
```

## 5. Random Password Generator
```typescript
// Excludes ambiguous characters: 0/O, 1/l/I — this gets printed and read by hand
const SAFE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

function generatePassword(length = 10): string {
  return Array.from({ length }, () =>
    SAFE_CHARS[Math.floor(Math.random() * SAFE_CHARS.length)]
  ).join("");
}
```

## 6. Login Lockout
```typescript
// Track failed attempts per user (in DB or Redis). On the 5th consecutive failure:
// respond with a choice, don't auto-lock silently.
if (failedAttempts >= 5) {
  return res.status(423).json({
    error: "Account locked after 5 failed attempts",
    options: ["request-password-reset", "wait-24h"],
  });
}
```

## 7. Attendance CSV Dry-Run Pattern
```typescript
async function previewAttendanceImport(sectionId: string, rows: CsvRow[]) {
  const policy = await getPolicyForSection(sectionId);
  const enrolled = await getEnrolledStudents(sectionId);

  return rows.map((row) => {
    const student = enrolled.find((s) => s.erpNo === row.erp || s.prn === row.prn);
    if (!student) return { ...row, status: "UNMATCHED" };

    const slabMatch = policy.attendanceSlabs.find(
      (s) => row.attendance >= s.minPercent && row.attendance <= s.maxPercent
    );
    if (!slabMatch) return { ...row, studentId: student.id, status: "BLOCKED_SLAB_GAP" };

    return { ...row, studentId: student.id, status: "READY", marksPreview: slabMatch.marks };
  });
}
```

## 8. Grading Policy "Duplicate Last Term" Pattern
```typescript
async function duplicatePolicyFromLastTerm(subjectId: string, newOfferingId: string) {
  const previousOffering = await prisma.subjectOffering.findFirst({
    where: { subjectId },
    orderBy: { academicTerm: { createdAt: "desc" } },
    include: { gradingPolicy: { include: { scoreComponents: true, attendanceSlabs: true } } },
  });
  if (!previousOffering?.gradingPolicy) return null; // nothing to duplicate, HOD starts fresh

  const { scoreComponents, attendanceSlabs, ...policyFields } = previousOffering.gradingPolicy;
  return prisma.gradingPolicy.create({
    data: {
      subjectOfferingId: newOfferingId,
      cesGroupWeightage: policyFields.cesGroupWeightage,
      internalWeightage: policyFields.internalWeightage,
      attendanceWeightage: policyFields.attendanceWeightage,
      confirmedAt: null, // still requires fresh HOD confirmation
      scoreComponents: { create: scoreComponents.map(({ group, name, maxMarks, order }) => ({ group, name, maxMarks, order })) },
      attendanceSlabs: { create: attendanceSlabs.map(({ minPercent, maxPercent, marks }) => ({ minPercent, maxPercent, marks })) },
    },
  });
}
```

## 9. Environment Variables
```
DATABASE_URL=
JWT_SECRET=
JWT_REFRESH_SECRET=
RESEND_API_KEY=
SENTRY_DSN=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
FRONTEND_URL=
```

## 10. Deployment Notes
- Backend → Render: root `backend/`, build `npm install && npx prisma generate && npm run build`, start `npm start`, run `npx prisma migrate deploy` as a release step.
- Frontend → Vercel: root `frontend/`, framework preset **Next.js**.
- Testing: Jest/Vitest suite for the grading engine (pure functions, easiest to test thoroughly), attendance dry-run logic, and lockout logic. **Aarav runs `npm test` and `npm run build` himself and pastes raw terminal output** — the coding agent does not self-report test results, matching the standing rule from Quiz Portal/EchoSphere. Everything else (writing code, scaffolding, migrations, config) is done by the agent.
