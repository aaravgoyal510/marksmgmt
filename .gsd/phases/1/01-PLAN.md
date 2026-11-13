---
phase: 1
plan: 1
wave: 1
gap_closure: false
depends_on: []
files_modified:
  - package.json
  - tsconfig.json
  - next.config.mjs
  - tailwind.config.js
  - postcss.config.js
  - prisma/schema.prisma
  - prisma/seed.ts
  - src/lib/prisma.ts
autonomous: true
user_setup: []

must_haves:
  truths:
    - "Root package.json unifies all production and development dependencies across frontend and backend"
    - "Root Next.js, Tailwind, PostCSS, and TypeScript configurations are initialized with @/* path aliases"
    - "Prisma schema is configured with directUrl for Supabase connection pooling and Prisma Client is generated"
    - "Prisma Client is exported as a global singleton via src/lib/prisma.ts to prevent connection pool exhaustion"
  artifacts:
    - "package.json"
    - "tsconfig.json"
    - "next.config.mjs"
    - "tailwind.config.js"
    - "postcss.config.js"
    - "prisma/schema.prisma"
    - "prisma/seed.ts"
    - "src/lib/prisma.ts"
---

# Plan 1.01: Root Scaffold Unification & Prisma Client Singleton Setup

<objective>
Establish the unified root Next.js 14 project scaffold by merging package dependencies and build configurations, relocating the Prisma schema with Supabase `directUrl` pooling support, generating the Prisma Client, and creating the global client singleton in `src/lib/prisma.ts`.

Purpose: Eliminates separate dependency trees, aligns build configurations into a single root project, and ensures safe database connection management for both local development and Vercel serverless deployments.
Output: Consolidated `package.json`, root `tsconfig.json`, Next.js/Tailwind configs, root `prisma/schema.prisma`, generated Prisma client, and `src/lib/prisma.ts`.
</objective>

<context>
Load for context:
- .gsd/SPEC.md
- .gsd/phases/1/RESEARCH.md
- package.json
- frontend/package.json
- backend/package.json
- backend/prisma/schema.prisma
- backend/prisma/seed.ts
</context>

<tasks>

<task type="auto">
  <name>Unify root package dependencies and Next.js / TypeScript build configurations</name>
  <files>
    package.json
    tsconfig.json
    next.config.mjs
    tailwind.config.js
    postcss.config.js
  </files>
  <action>
    1. Merge `frontend/package.json` and `backend/package.json` into the root `package.json`:
       - Production dependencies: `next` (^14.2.15), `react` (^18.3.1), `react-dom` (^18.3.1), `@prisma/client` (^5.22.0), `bcrypt` (^5.1.1), `jsonwebtoken` (^9.0.2), `exceljs` (^4.4.0), `pdfkit` (^0.15.1), `papaparse` (^5.4.1), `resend` (^4.0.1), `zod` (^3.23.8), `lucide-react` (^0.454.0), `recharts` (^2.13.3), `clsx` (^2.1.1), `tailwind-merge` (^2.5.4).
       - Development dependencies: `prisma` (^5.22.0), `typescript` (^5.6.3), `@types/node` (^22.9.0), `@types/react` (^18.3.12), `@types/react-dom` (^18.3.1), `@types/bcrypt` (^5.0.2), `@types/jsonwebtoken` (^9.0.7), `@types/papaparse` (^5.3.15), `@types/pdfkit` (^0.13.5), `@types/supertest` (^7.2.1), `supertest` (^7.2.2), `vitest` (^2.1.5), `tsx` (^4.19.2), `tailwindcss` (^3.4.14), `postcss` (^8.4.47), `autoprefixer` (^10.4.20).
       - Scripts:
         - `"dev": "next dev"`
         - `"build": "next build"`
         - `"start": "next start"`
         - `"test": "vitest run"`
         - `"test:watch": "vitest"`
         - `"prisma:generate": "prisma generate"`
         - `"prisma:migrate": "prisma migrate dev"`
         - `"seed": "tsx prisma/seed.ts"`
    2. Copy `frontend/next.config.mjs`, `frontend/tailwind.config.js`, and `frontend/postcss.config.js` to project root.
    3. Create root `tsconfig.json` combining Next.js App Router settings with `@/*` pointing to `./src/*`, and add `"exclude": ["node_modules", "backend", "dist"]` so that legacy Express files in `backend/` do not trigger TypeScript errors during Next.js builds.
    4. Run `npm install` in the project root to install and link all dependencies into root `node_modules`.

    AVOID: Using shell operators like `&&` or `||` in npm scripts because PowerShell on Windows has different chaining behavior.
    USE: Unified root package scripts and cross-platform npm CLI commands.
  </action>
  <verify>
    npm run test -- --version
  </verify>
  <done>
    Root `package.json` contains unified dependencies, `node_modules` exists at root, Vitest binary is runnable, and `next.config.mjs`, `tailwind.config.js`, `postcss.config.js`, and `tsconfig.json` are present at root.
  </done>
</task>

<task type="auto">
  <name>Setup root Prisma schema with directUrl pooling and generate client</name>
  <files>
    prisma/schema.prisma
    prisma/seed.ts
  </files>
  <action>
    1. Create root `prisma/` directory.
    2. Copy `backend/prisma/schema.prisma` to `prisma/schema.prisma`.
    3. Update the `datasource db` block in `prisma/schema.prisma` to add `directUrl = env("DIRECT_URL")`:
       ```prisma
       datasource db {
         provider  = "postgresql"
         url       = env("DATABASE_URL")
         directUrl = env("DIRECT_URL")
       }
       ```
       Leave all models, enums, indexes, and relations completely intact.
    4. Copy `backend/prisma/seed.ts` to `prisma/seed.ts`.
    5. Run `npx prisma generate` from the root directory to generate the Prisma client into `node_modules/@prisma/client`.

    AVOID: Modifying any database models, table names, or enum types in `schema.prisma`.
    USE: Exact preservation of the existing BVIMR schema structure, adding only `directUrl` for Supabase connection pooling compatibility on Vercel.
  </action>
  <verify>
    npx prisma generate
  </verify>
  <done>
    `prisma/schema.prisma` contains `directUrl = env("DIRECT_URL")`, `prisma/seed.ts` exists, and `npx prisma generate` completes with exit code 0.
  </done>
</task>

<task type="auto">
  <name>Implement global singleton Prisma Client in src/lib/prisma.ts</name>
  <files>
    src/lib/prisma.ts
  </files>
  <action>
    1. Ensure `src/lib/` directory exists.
    2. Create `src/lib/prisma.ts` implementing the Next.js / serverless global singleton pattern:
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

    AVOID: Creating separate `new PrismaClient()` instances in route handlers or services, which rapidly exhausts Supabase PostgreSQL connection limits.
    USE: The `globalThis` singleton export so connection pools are preserved across hot reloads and serverless function invocations.
  </action>
  <verify>
    npx tsx -e "import { prisma } from './src/lib/prisma'; console.log('Prisma singleton initialized:', !!prisma);"
  </verify>
  <done>
    `src/lib/prisma.ts` exports `prisma` as a global singleton and imports cleanly in Node/TypeScript without errors.
  </done>
</task>

</tasks>

<verification>
After all tasks complete, verify:
- [ ] Root `package.json` contains merged frontend and backend dependencies
- [ ] `node_modules/@prisma/client` exists and `npx prisma generate` succeeds
- [ ] `src/lib/prisma.ts` imports and instantiates cleanly
- [ ] `next.config.mjs`, `tailwind.config.js`, `postcss.config.js`, and `tsconfig.json` are present at root
</verification>

<success_criteria>
- [ ] All 3 tasks verified passing
- [ ] Must-haves confirmed
- [ ] No regressions in dependency resolution
</success_criteria>
