---
milestone: v1.0-fullstack-unification
version: 1.0.0
updated: 2026-11-13
---

# Roadmap

> **Current Phase:** Phase 1: Full-Stack Unification & Monorepo Consolidation
> **Status:** planning

## Must-Haves (from SPEC)

- [ ] Unified single root Next.js 14 App Router project (no separate backend / frontend servers).
- [ ] Next.js Route Handlers (`app/api/**/route.ts`) implementing all Express REST endpoints with full authentication, role scoping, and lock enforcement.
- [ ] Prisma client configured with Supabase connection pooling for Vercel serverless execution.
- [ ] 100% test parity with 77+ Vitest tests passing.
- [ ] Clean `npm run build` and flawless local execution (`npm run dev` and `npm start`).

---

## Phases

### Phase 1: Full-Stack Unification & Monorepo Consolidation
**Status**: ⬜ Not Started
**Objective**: Consolidate `frontend/` and `backend/` into a single root Next.js project. Merge `package.json`, TypeScript configurations, Prisma schema/migrations, and core shared utilities (`gradingEngine`, `password`, `sanitizer`).
**Requirements**: SPEC Goals 1, 2

### Phase 2: API Route Handlers Migration & Middleware
**Status**: ⬜ Not Started
**Objective**: Migrate Express controllers and routes into Next.js App Router Route Handlers (`src/app/api/...`), adapting JWT auth middleware, HOD department scoping, and section lock enforcement (HTTP 423) for NextRequest/NextResponse.
**Requirements**: SPEC Goal 3

### Phase 3: Client Portal Integration & Test Suite Port
**Status**: ⬜ Not Started
**Objective**: Update frontend API client (`lib/api.ts`) to target relative route handlers `/api/...`, adapt test helpers, and port all 17 test suites (77 tests) to run seamlessly against the unified codebase.
**Requirements**: SPEC Goal 4

### Phase 4: Vercel & Production Verification
**Status**: ⬜ Not Started
**Objective**: Configure Prisma connection pooling (Supabase transaction/session modes), verify `npm run build`, and document local self-hosted and Vercel deployment procedures.
**Requirements**: SPEC Goal 2

