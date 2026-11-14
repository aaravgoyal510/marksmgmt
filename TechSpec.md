# TechSpec.md — Technical Specification

## 1. Stack Overview
- **Full-Stack Application:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Lucide Icons, deployed to **Vercel** or containerized serverless Node runtime.
- **Backend Architecture:** Native Next.js Route Handlers (`src/app/api/*`) and Edge Middleware (`src/middleware.ts`).
- **Database:** PostgreSQL via **Supabase**, accessed through **Prisma ORM**.
- **File storage:** Supabase Storage (profile pictures) — same free tier as the DB, no separate service.
- **Auth:** JWT (access + refresh tokens in HttpOnly cookies), bcrypt password hashing. DB-backed failed login tracking with 5-attempt threshold lockout (`MAX_FAILED_LOGIN_ATTEMPTS = 5`). No signup route — accounts created only by Admin/HOD actions.
- **Email:** **Resend** — password reset links with graceful fallback when unconfigured.
- **SMS:** none for MVP — self-service reset is email-only, SMS is a stretch goal.
- **Error tracking:** Sentry — for production runtime error visibility.
- **Excel generation:** `exceljs` — credential exports, student onboarding templates, and report exports.
- **PDF generation:** `pdfkit` / dynamic PDF route handler (`/api/reports/students/[id]/.../pdf`) — per-student mark sheet.
- **CSV parsing:** Robust regex/line-based streaming parser — attendance import and student bulk import.
- **Timezone:** `Asia/Kolkata` explicitly for all term dates, attendance snapshot timestamps, and audit log timestamps.

The architecture consolidates all functionality into a unified Next.js 14 full-stack App Router codebase, combining UI pages, serverless API route handlers, and edge security middleware.

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

## 4. Auth & Guards Pattern (Next.js Route Handlers & Middleware)
```typescript
export function verifyAuth(req: NextRequest, roles?: Role[]): AuthResult {
  let token = req.cookies.get("accessToken")?.value;
  const authHeader = req.headers.get("authorization");
  if (!token && authHeader?.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  if (!token) {
    return { ok: false, error: NextResponse.json({ error: "Missing or invalid token" }, { status: 401 }) };
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    if (roles && roles.length > 0 && !roles.includes(decoded.role)) {
      return { ok: false, error: NextResponse.json({ error: "Forbidden: Insufficient permissions" }, { status: 403 }) };
    }
    return { ok: true, user: decoded };
  } catch {
    return { ok: false, error: NextResponse.json({ error: "Invalid or expired token" }, { status: 401 }) };
  }
}

// HOD department-scoping — checked server-side on every HOD route handler
export async function verifyHOD(user: JwtPayload, departmentId: string | null | undefined): Promise<HODResult> {
  const assignment = await prisma.hODAssignment.findFirst({
    where: { facultyId: user.facultyId, departmentId },
  });
  if (!assignment) {
    return { ok: false, error: NextResponse.json({ error: "Forbidden: Not HOD of this department" }, { status: 403 }) };
  }
  return { ok: true };
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
See `.env.example` for full list of variables, defaults, and requirements:
```
DATABASE_URL=
DIRECT_URL=
JWT_SECRET=
JWT_REFRESH_SECRET=
ADMIN_INITIAL_PASSWORD=
CRON_SECRET=
QUERY_SLA_HOURS=
ALLOW_DEMO_SEED=
RESEND_API_KEY=
EMAIL_FROM=
SMTP_HOST=
SENTRY_DSN=
SENTRY_AUTH_TOKEN=
```

## 10. Key v1.1 Operational Routes & Features
- **Marks Publish Flow**: `POST /api/sections/[id]/marks/publish` & `DELETE` (Teaching faculty release marks to student semester-view; unpublish revokes visibility).
- **Bulk Marks Import**: `POST /api/sections/[id]/marks/import/preview` & `.../commit` (CSV and Excel matching, dynamic policy component headers).
- **Batch Promotion Dry-Run**: `GET /api/admin/batches/[id]/promote/preview` & `GET /api/hod/batches/[batchId]/promote/preview`.
- **Account Deactivation**: `POST /api/admin/users/[id]/deactivate` & `.../reactivate`.
- **Session Revocation**: `POST /api/auth/logout-everywhere` (increments `tokenVersion` on user record, immediately revoking refresh capability).
- **Query SLA Cron**: `GET /api/cron/query-sla` (Protected by `CRON_SECRET`, checks 48h faculty reminder and 96h auto-escalation). Grievance escalation via `POST /api/queries/[id]/escalate` is restricted to owning student or assigned teaching faculty.
- **Section Analytics**: `GET /api/sections/[id]/analytics` (Assigned faculty & department HOD only, at-risk and grade distributions).
- **Cumulative Transcript PDF**: `GET /api/students/[id]/transcript/pdf` (Multi-term consolidated PDF report, published sections only; accessible to student for their own record via IDOR guard and staff: Admin or HOD of the student's department).
- **Role-Aware Help**: `/help` (Comprehensive guide and calculation formula).

## 11. Deployment Notes
- Consolidated App → Vercel / Node: root directory, build `prisma generate && next build`, start `next start`, run `npx prisma migrate deploy` as a release step.
- Testing: Jest/Vitest suite for the grading engine (pure functions, easiest to test thoroughly), attendance dry-run logic, and lockout logic. **Aarav runs `npm test` and `npm run build` himself and pastes raw terminal output** — the coding agent does not self-report test results, matching the standing rule from Quiz Portal/EchoSphere. Everything else (writing code, scaffolding, migrations, config) is done by the agent.
