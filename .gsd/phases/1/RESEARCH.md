---
phase: 1
researched_at: 2026-11-13
discovery_level: 2
---

# Phase 1 Research: Full-Stack Unification & Monorepo Consolidation

## Objective
Answer core architectural and technical questions for consolidating the split Express backend (`backend/`) and Next.js frontend (`frontend/`) into a single unified root Next.js 14 App Router project with Route Handlers, a singleton Prisma Client optimized for Supabase connection pooling on Vercel serverless, and unified shared services (`gradingEngine`, `auth`, `sanitizer`) with Vitest test execution.

## Discovery Level
**Level 2** — Standard research across multi-directory structure, configuration merging, connection pooling paradigms, and test harness migration.

---

## Key Decisions

### Decision 1: Project Root & Layout Consolidation
**Question:** How should the monorepo be structured to eliminate separate `frontend/` and `backend/` directories without disrupting Next.js 14 conventions?
**Options Considered:**
1. *Keep monorepo workspaces (npm/turborepo/pnpm) with `apps/web` and `packages/core`*:
   - *Pros:* Clean package isolation.
   - *Cons:* Adds unnecessary workspace configuration overhead, complexity with Vercel deployment paths, and violates the SPEC goal of a single root Next.js project.
2. *Single unified root Next.js project with `src/app`, `src/lib`, `src/services`, `src/utils`*:
   - *Pros:* Direct Vercel zero-config deployment; single `package.json` and `tsconfig.json`; paths alias `@/*` seamlessly resolves across frontend React components, Route Handlers, and Vitest; eliminates dual server orchestration (`PORT=5000` + `3000`).
   - *Cons:* Requires merging dependencies and restructuring imports.
**Decision:** Option 2 — Consolidate into a single root Next.js project.
- Move `frontend/src/*` and `backend/src/*` into a unified `src/` directory.
- Move `backend/prisma/` to `/prisma/`.
- Merge root-level config files (`next.config.mjs`, `tailwind.config.js`, `postcss.config.js`, `tsconfig.json`).
- Root `package.json` manages all runtime and dev dependencies.
**Confidence:** High

### Decision 2: Prisma Client Lifecycle for Serverless & Local
**Question:** How to instantiate and configure Prisma Client to support both long-running Node.js (local dev hot reload) and Vercel serverless execution with Supabase connection pooling?
**Options Considered:**
1. *Instantiate `new PrismaClient()` per file/request (current pattern)*:
   - *Pros:* None.
   - *Cons:* Currently 14 separate files call `new PrismaClient()` ([backend/src/controllers/adminController.ts:7](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/controllers/adminController.ts#L7), [backend/src/services/authService.ts:5](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/services/authService.ts#L5)). In Next.js fast-refresh or serverless lambdas, this causes rapid PostgreSQL connection pool exhaustion.
2. *Global singleton with dual Supabase pooler URLs (`DATABASE_URL` + `DIRECT_URL`)*:
   - *Pros:* Attaches client instance to `globalThis` in development so hot-reloads reuse the socket. In production/serverless, each container instantiates a single client connected via Supabase PgBouncer/Supavisor (`DATABASE_URL` with `?pgbouncer=true&connection_limit=1`), while migrations use `DIRECT_URL`.
   - *Cons:* Requires updating `prisma/schema.prisma` datasource config.
**Decision:** Option 2 — Global singleton in `src/lib/prisma.ts` with `directUrl` support in `prisma/schema.prisma`.
**Confidence:** High

### Decision 3: Express Route Migration to App Router Route Handlers
**Question:** How to migrate Express controllers and middleware into Next.js App Router Route Handlers?
**Options Considered:**
1. *Run Express inside a Next.js catch-all route handler (`src/app/api/[...slug]/route.ts`)*:
   - *Pros:* Minimal initial rewrite of Express routing code.
   - *Cons:* High overhead, poor cold starts in serverless, bypasses native streaming/edge capabilities, problematic cookie and header handling in Next.js 14, and violates SPEC Goal 1 and Constraint 1.
2. *Native Next.js App Router Route Handlers (`src/app/api/**/route.ts`)*:
   - *Pros:* Idiomatic Next.js architecture; optimal serverless tree-shaking; standard `NextRequest` and `NextResponse` APIs; cleaner auth and guard composition via helper functions.
   - *Cons:* Requires adapting Express `(req, res)` handlers and middleware (`requireAuth`, `requireHODOfDepartment`, `requireUnlockedSection`).
**Decision:** Option 2 — Native Route Handlers in `src/app/api/...`. For Phase 1, establish directory conventions, shared utilities, and helper abstractions; route handler conversion proceeds in Phase 2.
**Confidence:** High

### Decision 4: Vitest Configuration & Execution in Unified Root
**Question:** How should the test runner be configured in the unified root to support existing 17 test suites (77 tests)?
**Options Considered:**
1. *Retain Jest / Supertest only*:
   - *Pros:* Matches legacy Express tests.
   - *Cons:* Slow startup, ESM/TypeScript compilation issues with Next.js 14.
2. *Unified Vitest configuration with path aliases and dual testing capability*:
   - *Pros:* Blazing fast; native TypeScript/ESM; path aliases `@/*` resolve `./src/*`; supports testing pure unit functions (`gradingEngine.ts`, `sanitizer.ts`, `password.ts`), direct route handler testing with `NextRequest`, and temporary Express/controller integration tests.
   - *Cons:* Requires configuring `vitest.config.ts` with resolve aliases matching `tsconfig.json`.
**Decision:** Option 2 — Root `vitest.config.ts` with `@/*` alias support.
**Confidence:** High

---

## Findings

### 1. Monorepo Consolidation & Directory Mapping

#### Current Structure
- Express backend resides in `backend/` ([backend/package.json:1-46](file:///C:/Users/admin/Desktop/internal marks calculated/backend/package.json#L1-L46)), with Prisma at `backend/prisma/schema.prisma` and tests at `backend/tests/`.
- Frontend Next.js app resides in `frontend/` ([frontend/package.json:1-29](file:///C:/Users/admin/Desktop/internal marks calculated/frontend/package.json#L1-L29)), with pages at `frontend/src/app/` and client helpers at `frontend/src/lib/`.
- Root `package.json` contains only delegation scripts (`npm --prefix backend test`) ([package.json:5-8](file:///C:/Users/admin/Desktop/internal marks calculated/package.json#L5-L8)).

#### Unified Target Structure
```
/
├── prisma/
│   ├── schema.prisma              <-- From backend/prisma/schema.prisma
│   └── seed.ts                    <-- From backend/prisma/seed.ts
├── public/                        <-- From frontend/public/
├── src/
│   ├── app/                       <-- Next.js 14 App Router
│   │   ├── (auth & dashboards)    <-- frontend/src/app/ (admin, hod, faculty, student)
│   │   └── api/                   <-- Next.js App Router Route Handlers (app/api/**/route.ts)
│   ├── components/                <-- From frontend/src/components/ (HeaderNav.tsx, etc.)
│   ├── lib/                       <-- Shared libraries
│   │   ├── prisma.ts              <-- Prisma Client global singleton
│   │   ├── api.ts                 <-- Frontend API client pointing to relative /api
│   │   ├── auth.ts                <-- Token verification & role checking helpers
│   │   └── lock.ts                <-- Section unlock verification helper
│   ├── services/                  <-- Pure/shared domain services
│   │   ├── gradingEngine.ts       <-- From backend/src/services/gradingEngine.ts
│   │   └── authService.ts         <-- From backend/src/services/authService.ts
│   └── utils/                     <-- Core utility functions
│       ├── password.ts            <-- From backend/src/utils/password.ts
│       └── sanitizer.ts           <-- From backend/src/utils/sanitizer.ts
├── tests/                         <-- From backend/tests/
├── vitest.config.ts               <-- Root Vitest config with @/ path aliases
├── next.config.mjs                <-- From frontend/next.config.mjs
├── tailwind.config.js             <-- From frontend/tailwind.config.js
├── postcss.config.js              <-- From frontend/postcss.config.js
├── tsconfig.json                  <-- Unified Next.js + Node TypeScript config
└── package.json                   <-- Unified root package.json
```

#### Route Handlers Mapping Matrix (Express -> Next.js App Router)
The Express backend mounts 9 route groups ([backend/src/app.ts:63-74](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/app.ts#L63-L74)). In Next.js App Router, these map cleanly to:

| Express Route / Method | Route File | Handler Export |
|------------------------|------------|----------------|
| `GET /health` ([backend/src/app.ts:54](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/app.ts#L54)) | `src/app/api/health/route.ts` | `GET` |
| `POST /api/auth/login` ([backend/src/routes/authRoutes.ts:7](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/authRoutes.ts#L7)) | `src/app/api/auth/login/route.ts` | `POST` |
| `POST /api/auth/logout` ([backend/src/routes/authRoutes.ts:8](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/authRoutes.ts#L8)) | `src/app/api/auth/logout/route.ts` | `POST` |
| `GET /api/auth/me` ([backend/src/routes/authRoutes.ts:10](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/authRoutes.ts#L10)) | `src/app/api/auth/me/route.ts` | `GET` |
| `POST /api/auth/refresh` ([backend/src/routes/authRoutes.ts:11](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/authRoutes.ts#L11)) | `src/app/api/auth/refresh/route.ts` | `POST` |
| `POST /api/auth/forgot-password` ([backend/src/routes/authRoutes.ts:12](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/authRoutes.ts#L12)) | `src/app/api/auth/forgot-password/route.ts` | `POST` |
| `POST /api/auth/reset-password` ([backend/src/routes/authRoutes.ts:13](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/authRoutes.ts#L13)) | `src/app/api/auth/reset-password/route.ts` | `POST` |
| `POST /api/auth/clear-lockouts` ([backend/src/routes/authRoutes.ts:9](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/authRoutes.ts#L9)) | `src/app/api/auth/clear-lockouts/route.ts` | `POST` |
| `GET, POST /api/admin/departments` ([backend/src/routes/adminRoutes.ts:24-25](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/adminRoutes.ts#L24-L25)) | `src/app/api/admin/departments/route.ts` | `GET`, `POST` |
| `POST /api/admin/batches` ([backend/src/routes/adminRoutes.ts:27](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/adminRoutes.ts#L27)) | `src/app/api/admin/batches/route.ts` | `POST` |
| `POST /api/admin/batches/:id/promote` ([backend/src/routes/adminRoutes.ts:28](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/adminRoutes.ts#L28)) | `src/app/api/admin/batches/[id]/promote/route.ts` | `POST` |
| `POST /api/admin/batches/:id/sections` ([backend/src/routes/adminRoutes.ts:29](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/adminRoutes.ts#L29)) | `src/app/api/admin/batches/[id]/sections/route.ts` | `POST` |
| `GET, POST /api/admin/faculty` ([backend/src/routes/adminRoutes.ts:31-32](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/adminRoutes.ts#L31-L32)) | `src/app/api/admin/faculty/route.ts` | `GET`, `POST` |
| `POST /api/admin/faculty/:id/assign-hod` ([backend/src/routes/adminRoutes.ts:33](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/adminRoutes.ts#L33)) | `src/app/api/admin/faculty/[id]/assign-hod/route.ts` | `POST` |
| `GET /api/admin/faculty/:id/credentials` ([backend/src/routes/adminRoutes.ts:34](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/adminRoutes.ts#L34)) | `src/app/api/admin/faculty/[id]/credentials/route.ts` | `GET` |
| `GET /api/admin/students` ([backend/src/routes/adminRoutes.ts:36](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/adminRoutes.ts#L36)) | `src/app/api/admin/students/route.ts` | `GET` |
| `PUT /api/admin/students/:id/semester-override` ([backend/src/routes/adminRoutes.ts:37](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/adminRoutes.ts#L37)) | `src/app/api/admin/students/[id]/semester-override/route.ts` | `PUT` |
| `POST /api/admin/users/:id/force-reset` ([backend/src/routes/adminRoutes.ts:39](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/adminRoutes.ts#L39)) | `src/app/api/admin/users/[id]/force-reset/route.ts` | `POST` |
| `GET, POST /api/hod/subjects` ([backend/src/routes/hodRoutes.ts:25-26](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/hodRoutes.ts#L25-L26)) | `src/app/api/hod/subjects/route.ts` | `GET`, `POST` |
| `GET /api/hod/faculty-list` ([backend/src/routes/hodRoutes.ts:27](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/hodRoutes.ts#L27)) | `src/app/api/hod/faculty-list/route.ts` | `GET` |
| `GET /api/hod/subject-offerings` ([backend/src/routes/hodRoutes.ts:28](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/hodRoutes.ts#L28)) | `src/app/api/hod/subject-offerings/route.ts` | `GET` |
| `POST /api/hod/subject-offerings/:offeringId/sections/:sectionId/assign-faculty` ([backend/src/routes/hodRoutes.ts:29-32](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/hodRoutes.ts#L29-L32)) | `src/app/api/hod/subject-offerings/[offeringId]/sections/[sectionId]/assign-faculty/route.ts` | `POST` |
| `POST /api/hod/batches/:batchId/promote` ([backend/src/routes/hodRoutes.ts:33](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/hodRoutes.ts#L33)) | `src/app/api/hod/batches/[batchId]/promote/route.ts` | `POST` |
| `GET, POST /api/hod/subject-offerings/:offeringId/policy` ([backend/src/routes/hodRoutes.ts:36,40](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/hodRoutes.ts#L36)) | `src/app/api/hod/subject-offerings/[offeringId]/policy/route.ts` | `GET`, `POST` |
| `POST /api/hod/subject-offerings/:offeringId/policy/confirm` ([backend/src/routes/hodRoutes.ts:38](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/hodRoutes.ts#L38)) | `src/app/api/hod/subject-offerings/[offeringId]/policy/confirm/route.ts` | `POST` |
| `POST /api/hod/subject-offerings/:offeringId/policy/unconfirm` ([backend/src/routes/hodRoutes.ts:39](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/hodRoutes.ts#L39)) | `src/app/api/hod/subject-offerings/[offeringId]/policy/unconfirm/route.ts` | `POST` |
| `POST /api/hod/subject-offerings/:offeringId/policy/duplicate-last-term` ([backend/src/routes/hodRoutes.ts:37](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/hodRoutes.ts#L37)) | `src/app/api/hod/subject-offerings/[offeringId]/policy/duplicate-last-term/route.ts` | `POST` |
| `GET /api/faculty/my-sections` ([backend/src/routes/facultyRoutes.ts:21](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/facultyRoutes.ts#L21)) | `src/app/api/faculty/my-sections/route.ts` | `GET` |
| `GET /api/sections/:id/components` ([backend/src/routes/facultyRoutes.ts:22](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/facultyRoutes.ts#L22)) | `src/app/api/sections/[id]/components/route.ts` | `GET` |
| `GET /api/sections/:id/marks` ([backend/src/routes/facultyRoutes.ts:23](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/facultyRoutes.ts#L23)) | `src/app/api/sections/[id]/marks/route.ts` | `GET` |
| `PUT /api/marks/bulk` ([backend/src/routes/facultyRoutes.ts:26-30](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/facultyRoutes.ts#L26-L30)) | `src/app/api/marks/bulk/route.ts` | `PUT` |
| `POST /api/sections/:id/attendance/preview` ([backend/src/routes/facultyRoutes.ts:33](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/facultyRoutes.ts#L33)) | `src/app/api/sections/[id]/attendance/preview/route.ts` | `POST` |
| `POST /api/sections/:id/attendance/commit` ([backend/src/routes/facultyRoutes.ts:34-38](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/facultyRoutes.ts#L34-L38)) | `src/app/api/sections/[id]/attendance/commit/route.ts` | `POST` |
| `GET /api/students/me/semester-view` ([backend/src/routes/studentRoutes.ts:11](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/studentRoutes.ts#L11)) | `src/app/api/students/me/semester-view/route.ts` | `GET` |
| `GET, POST /api/queries` ([backend/src/routes/queryRoutes.ts:15-16](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/queryRoutes.ts#L15-L16)) | `src/app/api/queries/route.ts` | `GET`, `POST` |
| `POST /api/queries/:id/messages` ([backend/src/routes/queryRoutes.ts:17](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/queryRoutes.ts#L17)) | `src/app/api/queries/[id]/messages/route.ts` | `POST` |
| `POST /api/queries/:id/escalate` ([backend/src/routes/queryRoutes.ts:18](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/queryRoutes.ts#L18)) | `src/app/api/queries/[id]/escalate/route.ts` | `POST` |
| `POST /api/queries/:id/resolve` ([backend/src/routes/queryRoutes.ts:19](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/queryRoutes.ts#L19)) | `src/app/api/queries/[id]/resolve/route.ts` | `POST` |
| `GET /api/notifications` ([backend/src/routes/notificationRoutes.ts:9](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/notificationRoutes.ts#L9)) | `src/app/api/notifications/route.ts` | `GET` |
| `PUT /api/notifications/:id/read` ([backend/src/routes/notificationRoutes.ts:10](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/notificationRoutes.ts#L10)) | `src/app/api/notifications/[id]/read/route.ts` | `PUT` |
| `GET /api/reports/subject-offerings/:id/export` ([backend/src/routes/reportsRoutes.ts:9-13](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/reportsRoutes.ts#L9-L13)) | `src/app/api/reports/subject-offerings/[id]/export/route.ts` | `GET` |
| `GET /api/reports/students/:studentId/subject-offerings/:offeringId/pdf` ([backend/src/routes/reportsRoutes.ts:16-20](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/reportsRoutes.ts#L16-L20)) | `src/app/api/reports/students/[studentId]/subject-offerings/[offeringId]/pdf/route.ts` | `GET` |
| `GET, PUT /api/profile/me` ([backend/src/routes/profileRoutes.ts:9-10](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/profileRoutes.ts#L9-L10)) | `src/app/api/profile/me/route.ts` | `GET`, `PUT` |
| `POST /api/profile/change-password` ([backend/src/routes/profileRoutes.ts:11](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/routes/profileRoutes.ts#L11)) | `src/app/api/profile/change-password/route.ts` | `POST` |

---

### 2. Prisma Client Singleton & Supabase Connection Pooling

#### Supabase Connection Pooling Configuration
Supabase provides two connection strings:
1. **Transaction Pooler (Port 6543)** — Used by Prisma in serverless functions (Vercel). Requires `?pgbouncer=true` so Prisma avoids prepared statements.
   `DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"`
2. **Session / Direct Connection (Port 5432)** — Used by Prisma Migrate and CLI commands (`prisma migrate`, `prisma db push`, `prisma db seed`) which require direct PostgreSQL session features.
   `DIRECT_URL="postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres"`

#### `prisma/schema.prisma` Update
The datasource configuration must support `directUrl`:
```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

#### Singleton Implementation (`src/lib/prisma.ts`)
To prevent connection exhaustion across Next.js dev server hot-reloads and Vercel serverless containers:
```typescript
import { PrismaClient } from "@prisma/client";

const prismaClientSingleton = () => {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
};

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton> | undefined;
} & typeof global;

export const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = prisma;
}

export default prisma;
```

#### Remediation of 14 Scattered Instantiations
Every file that previously called `new PrismaClient()` must import `{ prisma } from "@/lib/prisma"`:
- [backend/src/controllers/adminController.ts:7](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/controllers/adminController.ts#L7)
- [backend/src/controllers/attendanceController.ts:6](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/controllers/attendanceController.ts#L6)
- [backend/src/controllers/authController.ts:107](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/controllers/authController.ts#L107)
- [backend/src/controllers/hodController.ts:4](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/controllers/hodController.ts#L4)
- [backend/src/controllers/marksController.ts:5](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/controllers/marksController.ts#L5)
- [backend/src/controllers/notificationController.ts:4](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/controllers/notificationController.ts#L4)
- [backend/src/controllers/policyController.ts:5](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/controllers/policyController.ts#L5)
- [backend/src/controllers/profileController.ts:5](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/controllers/profileController.ts#L5)
- [backend/src/controllers/queryController.ts:5](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/controllers/queryController.ts#L5)
- [backend/src/controllers/reportsController.ts:8](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/controllers/reportsController.ts#L8)
- [backend/src/controllers/studentController.ts:5](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/controllers/studentController.ts#L5)
- [backend/src/middleware/auth.ts:5](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/middleware/auth.ts#L5)
- [backend/src/middleware/lock.ts:4](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/middleware/lock.ts#L4)
- [backend/src/services/authService.ts:5](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/services/authService.ts#L5)

---

### 3. Shared Services & Vitest Runner in the Unified Root

#### Shared Services Assessment
1. **`gradingEngine.ts`** ([backend/src/services/gradingEngine.ts:1-153](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/services/gradingEngine.ts#L1-L153)):
   - Pure functional computation (`groupScore`, `attendanceScore`, `totalIA`, `validateSlabs`).
   - Zero external library dependencies.
   - Can be imported directly by both Route Handlers (`src/app/api/...`) and frontend client components (`src/app/hod/page.tsx`, `src/app/faculty/page.tsx`), obsoleting duplicated client-side slab validation ([frontend/src/lib/slabValidation.ts](file:///C:/Users/admin/Desktop/internal marks calculated/frontend/src/lib/slabValidation.ts)).
2. **`authService.ts`** ([backend/src/services/authService.ts:1-174](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/services/authService.ts#L1-L174)):
   - Manages password verification, lockout tracking (`failedAttemptsMap`), and JWT issuance.
   - Needs `{ prisma }` injected via singleton.
3. **`sanitizer.ts`** ([backend/src/utils/sanitizer.ts:1-14](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/utils/sanitizer.ts#L1-L14)):
   - Pure string utility preventing Stored XSS.
4. **`password.ts`** ([backend/src/utils/password.ts:1-19](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/utils/password.ts#L1-L19)):
   - Safe alphabet credential generation and bcrypt hashing.

#### Test Suite Composition (17 Test Files)
Analysis of the 17 test files in `backend/tests/`:
- **3 Pure Unit Tests**: `gradingEngine.test.ts`, `authLockout.test.ts`, `frontendSlabValidation.test.ts`. Test pure logic, mock `prisma` or pure functions.
- **8 Mocked Controller Tests**: `adminExtensions.test.ts`, `attendanceImport.test.ts`, `hodAcademic.test.ts`, `hodScoping.test.ts`, `marksAndAudit.test.ts`, `policyAndLock.test.ts`, `queriesAndNotifications.test.ts`, `reportsAndProfile.test.ts`. Pass simulated `(req as Request, res as Response)`.
- **6 Supertest Integration Tests**: `batchSectionScoping.test.ts`, `edgeCasesAudit.test.ts`, `hodDirectMarkEditRoute.test.ts`, `roleAgnosticProfile.test.ts`, `routeIntegration.test.ts`, `securityBoundary.test.ts`. Import `app` from `../src/app` and issue HTTP calls via Supertest.

#### Vitest Configuration (`vitest.config.ts`)
```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

---

## Patterns to Follow

1. **Path Alias Uniformity**: Always use `@/services/...`, `@/lib/...`, `@/components/...` in imports across both server and client modules.
2. **Explicit Server Boundary**: Keep server-only secrets and database access out of client components. Mark route handler helpers or DB utilities with `import "server-only"` if needed.
3. **Database URL Separation**: Enforce `DATABASE_URL` (pooler) for serverless queries and `DIRECT_URL` for migration scripts in all environment files.
4. **Next.js Native Response Formats**: Route handlers return `NextResponse.json(data, { status })` for JSON, and `new NextResponse(buffer, { headers })` for file downloads (ExcelJS / PDFKit).

---

## Anti-Patterns to Avoid

1. **Multiple `new PrismaClient()` Instances**: Never instantiate `new PrismaClient()` in Route Handlers or services. Always import the singleton from `@/lib/prisma`.
2. **Direct Process Exit in Serverless**: Avoid `process.exit(1)` inside route handler execution paths ([backend/src/app.ts:23](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/app.ts#L23)) as it kills the serverless container abruptly. Handle configuration errors via threw errors or standard responses.
3. **Hardcoded API URLs**: Do not hardcode `http://localhost:5000/api` in client code ([frontend/src/lib/api.ts:1](file:///C:/Users/admin/Desktop/internal marks calculated/frontend/src/lib/api.ts#L1)). Use relative `/api` paths for unified Next.js deployment.
4. **Chaining Commands in Scripts**: Do not use `&&` or `||` in `package.json` scripts if cross-platform Windows PowerShell compatibility is required.

---

## Dependencies Identified

Consolidated root `package.json` dependencies:

### Production Dependencies
| Package | Version | Purpose |
|---------|---------|---------|
| `next` | `^14.2.15` | Next.js framework (App Router & Route Handlers) |
| `react` | `^18.3.1` | React runtime |
| `react-dom` | `^18.3.1` | React DOM renderer |
| `@prisma/client` | `^5.22.0` | Database ORM client |
| `bcrypt` | `^5.1.1` | Password hashing & comparison |
| `jsonwebtoken` | `^9.0.2` | JWT generation & verification |
| `exceljs` | `^4.4.0` | Excel sheet export |
| `pdfkit` | `^0.15.1` | PDF mark sheet generation |
| `papaparse` | `^5.4.1` | CSV attendance parsing |
| `resend` | `^4.0.1` | Transactional email delivery |
| `zod` | `^3.23.8` | Schema validation |
| `lucide-react` | `^0.454.0` | UI icons |
| `recharts` | `^2.13.3` | Chart visualizations |
| `clsx` | `^2.1.1` | CSS className helper |
| `tailwind-merge` | `^2.5.4` | Tailwind utility merger |

### Development Dependencies
| Package | Version | Purpose |
|---------|---------|---------|
| `prisma` | `^5.22.0` | Prisma CLI for migrations & generation |
| `typescript` | `^5.6.3` | TypeScript compiler |
| `@types/node` | `^22.9.0` | Node.js type definitions |
| `@types/react` | `^18.3.12` | React type definitions |
| `@types/react-dom` | `^18.3.1` | React DOM type definitions |
| `@types/bcrypt` | `^5.0.2` | Bcrypt type definitions |
| `@types/jsonwebtoken` | `^9.0.7` | JWT type definitions |
| `@types/papaparse` | `^5.3.15` | Papaparse type definitions |
| `@types/pdfkit` | `^0.13.5` | PDFKit type definitions |
| `vitest` | `^2.1.5` | Unit and integration test runner |
| `tsx` | `^4.19.2` | Fast TypeScript runner for seeding |
| `tailwindcss` | `^3.4.14` | Tailwind CSS compiler |
| `postcss` | `^8.4.47` | CSS transformation |
| `autoprefixer` | `^10.4.20` | CSS autoprefixing |
| `supertest` | `^7.2.2` | HTTP assertions for transition test execution |
| `@types/supertest` | `^7.2.1` | Supertest types |

---

## Risks

- **Serverless Excel/PDF Memory Footprint**: Large Excel or PDF exports may consume considerable memory. Mitigation: Streaming or chunked buffers in route handlers with 2MB-10MB limits.
- **In-Memory Lockout Map**: `AuthService` currently stores failed attempts in a process `Map` ([backend/src/services/authService.ts:10](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/services/authService.ts#L10)). In multi-instance serverless, memory is not shared across lambda instances. Mitigation: Document this serverless behavior; DB-backed or Redis tracking can be added later if needed.
- **Double-Mounting Legacy Routes**: In the Express app, `facultyRoutes` was mounted at both `/api/faculty` and `/api` ([backend/src/app.ts:73-74](file:///C:/Users/admin/Desktop/internal marks calculated/backend/src/app.ts#L73-L74)). Migration must preserve both path structures or map frontend calls to consistent canonical endpoints.

---

## Recommendations for Phase 1 Plan

1. **Phase 1 Execution Scope**:
   - Create root `package.json` merging dependencies from `backend/package.json` and `frontend/package.json`.
   - Setup unified `tsconfig.json` with `@/*` pointing to `./src/*`.
   - Setup `prisma/` at the project root (`prisma/schema.prisma` with `directUrl` support) and run `npx prisma generate`.
   - Create `src/lib/prisma.ts` with the global singleton.
   - Relocate `frontend/src/*` into `src/`.
   - Relocate `backend/src/services/` and `backend/src/utils/` into `src/services/` and `src/utils/`.
   - Update `AuthService` and utilities to import singleton `{ prisma } from "@/lib/prisma"`.
   - Configure root `vitest.config.ts` with `@/*` aliases and verify test runner executes.
   - Clean up or stage legacy backend folders for Phase 2 controller-to-route-handler conversion.
