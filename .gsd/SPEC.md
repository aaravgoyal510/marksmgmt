# SPEC.md — Project Specification

> **Status**: `FINALIZED`
>
> 🔒 **Planning Lock**: Active. Specification finalized for unified full-stack consolidation.

## Vision
Consolidate the BVIMR Internal Assessment (IA) & Attendance portal from a split Express backend and Next.js frontend into a single unified, full-stack Next.js (App Router) application that deploys effortlessly to Vercel (serverless route handlers) while running seamlessly on local and self-hosted machines.

## Goals
1. **Full-Stack Monolith Architecture** — Unify `frontend/` and `backend/` into a single root Next.js project with App Router API routes (`src/app/api/...`) and existing role-based UI portals (`admin`, `hod`, `faculty`, `student`).
2. **Dual Deployment Compatibility** — Ensure the application can be deployed cleanly to Vercel (serverless functions, Prisma connection pooling with Supabase) as well as run locally or self-hosted via standard Node (`npm run dev` / `npm start` / Docker).
3. **Complete Logic & Security Parity** — Preserve 100% of existing business logic: configuration-driven `gradingEngine.ts`, section lock enforcement (HTTP 423), HOD server-side department scoping, attendance CSV dry-run slab validation, audit logging, and dynamic PDF/Excel generation.
4. **Test Suite Integrity** — Port all 17 test suites (77 test cases) into the unified project using Vitest, ensuring full regression coverage.

## Non-Goals (Out of Scope)
- Altering the Prisma database schema or changing BVIMR grading formulas and policies.
- Switching UI component libraries or rewriting frontend layouts.
- Replacing Supabase/PostgreSQL with another database provider.
- Admin bulk student CSV import column mapping (deferred per PRD).

## Users
- **Admin**: Institute-wide setup (departments, batches, faculty onboarding, password resets, credential exports).
- **HOD**: Department scoping, subject mapping, section offering assignments, grading policy configuration.
- **Faculty**: Mark entry grids, attendance CSV upload, and first-line query resolution.
- **Student**: Single-page stacked semester view with IA mark breakdown and grievance query submission.

## Constraints
- **Next.js App Router**: Must use Route Handlers (`src/app/api/**/route.ts`) replacing Express app & route routers.
- **Database Connection Pooling**: Prisma ORM with PostgreSQL (Supabase `DATABASE_URL` with connection pooling for Vercel serverless environments).
- **Single Root Build**: One unified `package.json`, one `tsconfig.json`, and single `npm install` / `npm run build`.
- **Runtime Environment**: Support Node.js 20+ runtime for local development and Vercel edge/serverless runtimes where applicable.

## Success Criteria
- [ ] Single root project structure without separate `frontend/` and `backend/` directories.
- [ ] Next.js API route handlers cover all endpoints for Auth, Admin, HOD, Faculty, Student, Marks, Attendance, Queries, and Reports.
- [ ] Full Vitest suite passes with all 77 tests green against the unified API/services.
- [ ] `npm run build` succeeds cleanly with zero TypeScript errors.
- [ ] Application starts locally (`npm run dev`) and runs successfully.

