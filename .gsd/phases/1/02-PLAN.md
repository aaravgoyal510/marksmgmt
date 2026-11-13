---
phase: 1
plan: 2
wave: 2
gap_closure: false
depends_on:
  - "01"
files_modified:
  - src/app/layout.tsx
  - src/app/page.tsx
  - src/app/globals.css
  - src/app/admin/page.tsx
  - src/app/hod/page.tsx
  - src/app/faculty/page.tsx
  - src/app/student/page.tsx
  - src/components/HeaderNav.tsx
  - src/lib/api.ts
  - src/lib/slabValidation.ts
  - src/services/gradingEngine.ts
  - src/services/authService.ts
  - src/utils/password.ts
  - src/utils/sanitizer.ts
  - vitest.config.ts
  - tests/unit/gradingEngine.test.ts
  - tests/unit/authLockout.test.ts
  - tests/unit/frontendSlabValidation.test.ts
autonomous: true
user_setup: []

must_haves:
  truths:
    - "Frontend UI pages, components, and client libraries are located under src/ and compile cleanly via tsc"
    - "Core services (gradingEngine, authService) and utilities (password, sanitizer) are consolidated into src/services/ and src/utils/"
    - "AuthService imports and utilizes the singleton { prisma } from @/lib/prisma instead of instantiating new PrismaClient"
    - "Root Vitest runner executes with @/* path aliases and passes all ported unit tests"
  artifacts:
    - "src/app/layout.tsx"
    - "src/app/page.tsx"
    - "src/components/HeaderNav.tsx"
    - "src/lib/api.ts"
    - "src/services/gradingEngine.ts"
    - "src/services/authService.ts"
    - "src/utils/password.ts"
    - "src/utils/sanitizer.ts"
    - "vitest.config.ts"
    - "tests/unit/gradingEngine.test.ts"
    - "tests/unit/authLockout.test.ts"
    - "tests/unit/frontendSlabValidation.test.ts"
---

# Plan 1.02: UI Tree Consolidation, Core Shared Services Migration & Test Runner Configuration

<objective>
Migrate all frontend pages, components, and client utilities into the root `src/` hierarchy, relocate core shared domain services (`gradingEngine`, `authService`, `password`, `sanitizer`) to `src/services/` and `src/utils/` while binding them to the `@/lib/prisma` singleton, and configure the root Vitest test runner to verify core unit test suites.

Purpose: Completes the unification of application code under a single root project, preserves all client interfaces and domain computation formulas, and establishes working unit test verification before route handler migration.
Output: Consolidated `src/app/`, `src/components/`, `src/services/`, `src/utils/`, `vitest.config.ts`, and green test execution in `tests/unit/`.
</objective>

<context>
Load for context:
- .gsd/SPEC.md
- .gsd/phases/1/RESEARCH.md
- .gsd/phases/1/01-PLAN.md
- frontend/src/app/
- frontend/src/components/
- frontend/src/lib/
- backend/src/services/
- backend/src/utils/
- backend/tests/gradingEngine.test.ts
- backend/tests/authLockout.test.ts
- backend/tests/frontendSlabValidation.test.ts
</context>

<tasks>

<task type="auto">
  <name>Relocate frontend application pages, components, and static assets to root src/ and public/</name>
  <files>
    src/app/layout.tsx
    src/app/page.tsx
    src/app/globals.css
    src/app/admin/page.tsx
    src/app/hod/page.tsx
    src/app/faculty/page.tsx
    src/app/student/page.tsx
    src/components/HeaderNav.tsx
    src/lib/api.ts
    src/lib/slabValidation.ts
  </files>
  <action>
    1. Copy or move directory contents from `frontend/src/app/` into `src/app/`:
       - `layout.tsx`, `page.tsx`, `globals.css`
       - `admin/page.tsx`
       - `hod/page.tsx`
       - `faculty/page.tsx`
       - `student/page.tsx`
    2. Copy or move `frontend/src/components/HeaderNav.tsx` to `src/components/HeaderNav.tsx`.
    3. Copy or move `frontend/src/lib/api.ts` and `frontend/src/lib/slabValidation.ts` to `src/lib/`.
    4. If `frontend/public/` contains any files, copy them to root `public/` (or ensure `public/` exists).
    5. Verify that all components and pages correctly resolve `@/components/HeaderNav`, `@/lib/api`, and `@/lib/slabValidation` via the `@/*` alias defined in `tsconfig.json`.

    AVOID: Altering the JSX structures, Tailwind styling, or API call paths in the frontend components.
    USE: Preserving the exact implementation of the existing UI portals while moving them under the root `src/` directory.
  </action>
  <verify>
    npx tsc --noEmit
  </verify>
  <done>
    All frontend portal pages and components exist under `src/` and pass TypeScript validation with zero compiler errors.
  </done>
</task>

<task type="auto">
  <name>Migrate core shared services and utilities into src/services/ and src/utils/ with singleton Prisma</name>
  <files>
    src/services/gradingEngine.ts
    src/services/authService.ts
    src/utils/password.ts
    src/utils/sanitizer.ts
  </files>
  <action>
    1. Create directories `src/services/` and `src/utils/`.
    2. Copy `backend/src/services/gradingEngine.ts` to `src/services/gradingEngine.ts`.
       - Keep pure calculation functions (`groupScore`, `attendanceScore`, `totalIA`, `validateSlabs`) completely identical.
    3. Copy `backend/src/utils/password.ts` to `src/utils/password.ts`.
    4. Copy `backend/src/utils/sanitizer.ts` to `src/utils/sanitizer.ts`.
    5. Copy `backend/src/services/authService.ts` to `src/services/authService.ts`:
       - Replace `import { PrismaClient, Role } from "@prisma/client"; const prisma = new PrismaClient();` with `import { Role } from "@prisma/client"; import { prisma } from "@/lib/prisma";`.
       - Update the import for password utilities from `../utils/password` to `@/utils/password`.
       - Keep all authentication and lockout logic (`MAX_FAILED_LOGIN_ATTEMPTS = 10`, `failedAttemptsMap`, `login`, `createTokens`) intact.

    AVOID: Re-instantiating `new PrismaClient()` inside `authService.ts` or modifying any BVIMR grading formula logic.
    USE: The `@/lib/prisma` singleton and clean `@/*` path aliases.
  </action>
  <verify>
    npx tsx -e "import { groupScore } from './src/services/gradingEngine'; import { AuthService } from './src/services/authService'; import { sanitizeTextInput } from './src/utils/sanitizer'; console.log('Services loaded successfully:', typeof groupScore, typeof AuthService, typeof sanitizeTextInput);"
  </verify>
  <done>
    `gradingEngine.ts`, `authService.ts`, `password.ts`, and `sanitizer.ts` exist under `src/` and export their respective functions without syntax or import errors.
  </done>
</task>

<task type="auto">
  <name>Configure root vitest.config.ts and verify unit test execution</name>
  <files>
    vitest.config.ts
    tests/unit/gradingEngine.test.ts
    tests/unit/authLockout.test.ts
    tests/unit/frontendSlabValidation.test.ts
  </files>
  <action>
    1. Create root `vitest.config.ts` configured for the unified monorepo:
       ```typescript
       import { defineConfig } from "vitest/config";
       import path from "path";

       export default defineConfig({
         test: {
           globals: true,
           environment: "node",
           include: ["tests/**/*.test.ts"],
         },
         resolve: {
           alias: {
             "@": path.resolve(__dirname, "./src"),
           },
         },
       });
       ```
    2. Create `tests/unit/` directory.
    3. Port the pure unit test suites:
       - Copy `backend/tests/gradingEngine.test.ts` to `tests/unit/gradingEngine.test.ts`. Update the import to `from "@/services/gradingEngine";`.
       - Copy `backend/tests/frontendSlabValidation.test.ts` to `tests/unit/frontendSlabValidation.test.ts`. Update the import to `from "@/lib/slabValidation";`.
       - Copy `backend/tests/authLockout.test.ts` to `tests/unit/authLockout.test.ts`. Update imports to `from "@/utils/password";` and `from "@/services/authService";`. Update the Prisma mock to mock `@/lib/prisma` so it matches the singleton refactor:
         ```typescript
         vi.mock("@/lib/prisma", () => {
           return {
             prisma: {
               user: {
                 findUnique: vi.fn(),
               },
             },
           };
         });
         ```
         In the test, import `{ prisma } from "@/lib/prisma";` and configure `(prisma.user.findUnique as any).mockResolvedValue(null);`.
    4. Run `npx vitest run tests/unit` to verify that all unit test suites execute and pass.
    5. Retain `backend/` in place so that Phase 2 can migrate controllers and routes into Route Handlers, and Phase 3 can port the remaining 14 test suites.

    AVOID: Deleting `backend/` prematurely before Phase 2 route handlers are implemented.
    USE: Root `vitest.config.ts` with `@/*` aliases for fast, clean unit test execution.
  </action>
  <verify>
    npx vitest run tests/unit
  </verify>
  <done>
    `vitest.config.ts` is configured, 3 unit test suites in `tests/unit/` run cleanly, and all tests pass with exit code 0.
  </done>
</task>

</tasks>

<verification>
After all tasks complete, verify:
- [ ] `src/app/`, `src/components/`, `src/services/`, and `src/utils/` exist and compile with `npx tsc --noEmit`
- [ ] `src/services/authService.ts` imports `{ prisma } from "@/lib/prisma"`
- [ ] `npx vitest run tests/unit` succeeds with all unit tests passing green
</verification>

<success_criteria>
- [ ] All 3 tasks verified passing
- [ ] Must-haves confirmed
- [ ] Unit tests pass with 0 failures
</success_criteria>
