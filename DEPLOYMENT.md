# Production Deployment & Operations Manual

This guide provides authoritative, production-grade instructions for deploying and operating the **Internal Assessment Portal** on **Vercel** (serverless) and **Local / Self-Hosted Node.js / VM** environments, connected to **Supabase PostgreSQL** via connection pooling.

---

## 1. Architecture & Topology

The application is structured as a unified, monolithic Next.js 14 App Router full-stack web application:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Client Browser / User Portals                         │
│   • Admin Portal (/admin)             • Faculty Portal (/faculty)           │
│   • HOD Portal (/hod)                 • Student Portal (/student)           │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTPS / JSON / Cookies
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                 Next.js 14 Full-Stack Monorepo (Root src/)                  │
│                                                                             │
│   UI Layer: React 18 Server & Client Components, Tailwind CSS, Lucide icons │
│   API Route Handlers (47 endpoints under /src/app/api/**):                  │
│     • Auth & Session Management (/api/auth/**)                              │
│     • Academic Entities (/api/admin/**)                                     │
│     • Marks Entry & Calculations (/api/marks/**)                            │
│     • Grievance Workflow (/api/queries/**)                                  │
│     • Analytics & Reports (/api/reports/**)                                 │
│   Document Engines: PDFKit (AFM fonts) & ExcelJS (Workbook streaming)       │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Prisma ORM (Client v5.22.0)
                                       │
            ┌──────────────────────────┴──────────────────────────┐
            │                                                     │
DATABASE_URL│ Port 6543 (Transaction Pooler)           DIRECT_URL│ Port 5432 (Session)
            ▼                                                     ▼
┌──────────────────────────────────────┐        ┌─────────────────────────────┐
│  Supabase Supavisor Connection Pool  │        │   Prisma CLI & Migrations   │
│   • Multiplexes serverless lambdas   │        │   • prisma migrate deploy   │
│   • ?pgbouncer=true&connection_limit=1│       │   • Advisory transactional  │
└──────────────────┬───────────────────┘        │     DDL locks               │
                   │ Persistent pooled conn     └──────────────┬──────────────┘
                   ▼                                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Supabase PostgreSQL 15+ Database                         │
│                    (Relational Schema: 14 Models)                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Core Architecture Components
- **Framework**: Next.js 14.2 (App Router, Node.js 20+ runtime).
- **Frontend**: React 18, Tailwind CSS, Lucide React icons, Recharts for analytics.
- **Backend API**: 50+ Next.js Serverless Route Handlers in `src/app/api/**` and Edge Security Middleware in `src/middleware.ts`.
- **Database & ORM**: PostgreSQL with Prisma ORM (`@prisma/client` and `prisma` CLI).
- **Connection Management**: Supabase Supavisor transaction pooler for runtime queries, direct session connection for DDL migrations.
- **Document Generation**: PDFKit (serverless runtime with `export const runtime = "nodejs"`) for student report cards and ExcelJS for class mark sheets.
- **Authentication & Session Controls**: Stateless HTTP-only JWT cookies (15-minute access token, 7-day refresh token) with role-based route guards (`STUDENT`, `FACULTY`, `ADMIN`).
- **Session Lifecycle & Global Revocation (`/api/auth/logout-everywhere`)**: Access tokens are signed JWTs with a strict 15-minute validity window, enabling zero-database-lookup synchronous route verification. Refresh tokens embed `tokenVersion` and strictly validate `isActive` and `tokenVersion` against PostgreSQL on each refresh (`/api/auth/refresh`). Invoking `POST /api/auth/logout-everywhere` increments `tokenVersion` in PostgreSQL, immediately invalidating all outstanding refresh tokens across all devices. Outstanding 15-minute access tokens expire naturally within a maximum of 15 minutes, guaranteeing total session termination across all devices.
- **Production Telemetry**: Sentry Next.js integration (`@sentry/nextjs`) initialized via `withSentryConfig` in `next.config.mjs` and Next.js `instrumentation.ts`. When `SENTRY_DSN` is unset, Sentry gracefully stays inert without blocking application runtime or build steps.

---

## 2. Prerequisites & System Requirements

### Runtime Prerequisites
- **Node.js**: `v20.x` LTS or later (e.g., Node 20.9.0+).
- **Package Manager**: `npm v10.x` or later.
- **Git**: Installed and configured.

### Database Prerequisites
- **Supabase Project** (recommended for production) or **PostgreSQL 15+** instance.
- Direct database credentials (`postgres` role or equivalent with DDL privileges).
- Supavisor connection string (provided in the Supabase Dashboard under Project Settings -> Database -> Connection Pooling).

---

## 3. Environment Variables Reference Matrix

| Variable | Required In | Format / Description | Example |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | Production & Dev | Transaction-pooled PostgreSQL URL (Port 6543 via Supavisor). Must include `?pgbouncer=true&connection_limit=1`. | `postgresql://postgres.[REF]:[PASS]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | Production & Dev | Direct PostgreSQL connection string (Port 5432) for DDL migrations and CLI commands. | `postgresql://postgres.[REF]:[PASS]@aws-0-[REGION].supabase.co:5432/postgres` |
| `JWT_SECRET` | Production & Dev | Cryptographically secure secret key for signing 15-minute access JWTs (min 32 characters). | `$(openssl rand -hex 32)` |
| `JWT_REFRESH_SECRET` | Production & Dev | Cryptographically secure secret key for signing 7-day refresh JWTs (min 32 characters). | `$(openssl rand -hex 32)` |
| `ADMIN_INITIAL_PASSWORD` | Production (Optional) | Password assigned to initial admin user created during database seeding. | `SecureAdminSecretPass2026!` |
| `RESEND_API_KEY` | Production (Optional) | Resend API key for transactional emails (query status notifications). | `re_123456789abcdef` |
| `NEXT_PUBLIC_API_URL` | Optional | Base URL for API requests. Leave unset to default to relative `/api` paths. | `https://your-domain.vercel.app` |
| `NODE_ENV` | Production & Dev | Runtime environment mode. Set automatically by Vercel. | `production` or `development` |

### Database URL Distinction
- **`DATABASE_URL` (Port 6543)**: Used by the Prisma Client at runtime within serverless functions. Supavisor transaction pooler multiplexes ephemeral lambdas onto a small pool of database connections. The `?pgbouncer=true` parameter signals Prisma to disable prepared statements, and `connection_limit=1` prevents individual lambdas from starving the pool.
- **`DIRECT_URL` (Port 5432)**: Used exclusively by Prisma CLI for migrations (`npm run prisma:deploy`, `npx prisma migrate dev`). Migration tools require session-level locks and schema inspection queries that are incompatible with transaction poolers.

---

## 4. Vercel Serverless Deployment Guide

### Step 1: Push Repository to GitHub
Ensure all code and migrations are committed:
```bash
git push origin main
```

### Step 2: Import Project in Vercel
1. Log in to your [Vercel Dashboard](https://vercel.com).
2. Click **Add New...** -> **Project**.
3. Select your Git repository containing the IA Portal monorepo.
4. Set the **Framework Preset** to **Next.js**.
5. Leave the **Root Directory** as `./` (repository root).

### Step 3: Configure Build & Output Settings
The project scripts in `package.json` handle build requirements automatically:
- **Build Command**: `npm run build` (executes `prisma generate && next build`)
- **Install Command**: `npm install` (triggers `postinstall: "prisma generate"`)
- **Output Directory**: `.next` (default)

### Step 4: Add Environment Variables in Vercel
In the Vercel project configuration screen, open the **Environment Variables** panel and add:

```env
DATABASE_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].supabase.co:5432/postgres"
JWT_SECRET="<generate-with-openssl-rand-hex-32>"
JWT_REFRESH_SECRET="<generate-with-openssl-rand-hex-32>"
ADMIN_INITIAL_PASSWORD="<strong-temporary-admin-password>"
```

Select **Production**, **Preview**, and **Development** targets as appropriate.

### Step 5: Run Production Database Migrations

Depending on the state of your target database, execute one of the two paths below using your direct connection string (`DIRECT_URL`):

#### Path A: Fresh Database (Brand New Production Setup)
For a newly provisioned PostgreSQL instance:
```bash
# 1. Apply all versioned migrations (including baseline 20261101000000_init)
npx prisma migrate deploy

# 2. Seed the initial Administrator account
npm run seed:prod
```

#### Path B: Existing Development Database (Initialized via db push)
If your database schema was already pushed during earlier prototyping without migration tracking:
```bash
# 1. Mark the baseline migration as already applied without executing DDL:
npx prisma migrate resolve --applied 20261101000000_init

# 2. Apply all subsequent incremental migrations cleanly (all use IF NOT EXISTS):
npx prisma migrate deploy
```

### Step 6: Deploy & Verify
1. Click **Deploy**. Vercel will install dependencies, run `prisma generate`, and compile all 50+ serverless route handlers, edge middleware, and pages.
2. Once deployment completes, navigate to your production URL:
   - Verify health check: `https://<your-project>.vercel.app/api/health` returns `{"status":"ok", "timestamp":"..."}`.
   - Navigate to the login screen and log in with your seeded administrator credentials.
3. Configure your **Custom Domain** and automated SSL certificates under **Settings -> Domains**.

---

## 5. Local & Self-Hosted Deployment Guide (Node.js / Docker / VM)

To deploy the IA Portal on a persistent Virtual Machine (Ubuntu / Debian / AWS EC2 / DigitalOcean Droplet) or local workstation:

### Step 1: Clone Repository & Install Dependencies
```bash
git clone https://github.com/your-org/internal-marks-calculated.git
cd internal-marks-calculated
npm install
```

### Step 2: Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Edit `.env` to configure your local or hosted database:
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/ia_portal?schema=public"
DIRECT_URL="postgresql://postgres:password@localhost:5432/ia_portal?schema=public"
JWT_SECRET="replace-with-a-random-32-byte-hex-string"
JWT_REFRESH_SECRET="replace-with-another-random-32-byte-hex-string"
ADMIN_INITIAL_PASSWORD="SecureLocalAdminPassword123!"
```

### Step 3: Run Migrations & Seed Database
```bash
# Apply migrations to database
npm run prisma:deploy

# Seed initial admin and test data
npm run seed
```

### Step 4: Build & Start Production Server
```bash
# Compile Next.js production build
npm run build

# Start production HTTP server (listens on port 3000)
npm run start
```

### Step 5: Process Management with PM2 (Recommended for VMs)
To keep the application running continuously with automatic restarts across reboots:
```bash
# Install PM2 globally
npm install -g pm2

# Start the application
pm2 start npm --name "ia-portal" -- start

# Configure startup hook
pm2 startup
pm2 save
```

### Step 6: Reverse Proxy Setup (Nginx)
When self-hosting behind Nginx, configure SSL termination and ensure cookie and proxy headers are forwarded correctly:

```nginx
server {
    listen 80;
    server_name iaportal.yourcollege.edu;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name iaportal.yourcollege.edu;

    ssl_certificate /etc/letsencrypt/live/iaportal.yourcollege.edu/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/iaportal.yourcollege.edu/privkey.pem;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 6. Database Migration & Seeding Runbook

### Migration Protocol
1. **Local Schema Iteration**:
   When developing new models or modifying existing fields:
   ```bash
   npx prisma migrate dev --name <descriptive_name>
   ```
   This generates a SQL migration file in `prisma/migrations/` and updates the Prisma Client.

2. **Production Schema Deployment**:
   Never execute `prisma migrate dev` against production databases. Instead, execute:
   ```bash
   npm run prisma:deploy
   ```
   This invokes `prisma migrate deploy`, which reads pending migration files and applies them sequentially without prompting. Ensure `DIRECT_URL` is configured to point directly to PostgreSQL port 5432.

3. **Database Seeding**:
   Execute the idempotent seed script to establish the base admin user, departments, programs, and initial academic years:
   ```bash
   npm run seed
   ```
   - Default admin credentials: Email `admin@institution.edu`, Password specified in `ADMIN_INITIAL_PASSWORD`.
   - **Important**: Log in as admin immediately following deployment to update passwords and enroll faculty coordinators.

---

## 7. Operational Troubleshooting Guide

### 1. Prisma Error `P2024`: Connection Timeout
- **Symptom**: Server logs show `PrismaClientInitializationError: Timed out fetching a new connection from the connection pool` or `Error code: P2024`.
- **Cause**: High concurrency in serverless functions exhausting direct PostgreSQL connection limits, or omitting pooler parameters.
- **Resolution**:
  1. Verify `DATABASE_URL` targets port **6543** (Supavisor pooler) rather than 5432.
  2. Confirm query parameters `?pgbouncer=true&connection_limit=1` are present at the end of `DATABASE_URL`.
  3. Ensure migrations use `DIRECT_URL` (port 5432) so that schema locks do not stall runtime pooler slots.

### 2. Cookie Authentication Behind Reverse Proxies
- **Symptom**: User logs in successfully, but subsequent requests to protected routes return `401 Unauthorized`.
- **Cause**: The `accessToken` and `refreshToken` cookies are configured with `SameSite: "strict"` and `secure: process.env.NODE_ENV === "production"`. If traffic reaches the application over HTTP without `X-Forwarded-Proto: https`, browsers drop secure cookies.
- **Resolution**:
  1. Verify the reverse proxy terminates SSL and includes `proxy_set_header X-Forwarded-Proto https;`.
  2. If testing a production build locally over plain HTTP, test with `localhost` (browsers treat `localhost` as a secure context) or provide an SSL certificate.

### 3. Document Generator Binary Handling (PDFKit & ExcelJS)
- **Symptom**: PDF generation throws `Error: ENOENT: no such file or directory, open '.../data/Helvetica.afm'` or Excel export fails on serverless runtimes.
- **Cause**: Webpack bundling native Node.js CJS modules and asset files incorrectly.
- **Resolution**:
  1. Verify `next.config.mjs` contains:
     ```javascript
     experimental: {
       serverComponentsExternalPackages: ['pdfkit', 'exceljs'],
     }
     ```
  2. Ensure the PDF route handler declares:
     ```typescript
     export const runtime = "nodejs";
     export const dynamic = "force-dynamic";
     ```
  3. Confirm that the binary buffer is wrapped in `new Uint8Array(pdfBuffer)` when constructing the `NextResponse`.

### 4. Health Check Static Caching
- **Symptom**: Calling `/api/health` repeatedly returns an identical, outdated timestamp.
- **Cause**: Next.js statically optimized the route handler during `next build`.
- **Resolution**: Verify [src/app/api/health/route.ts](file:///C:/Users/admin/Desktop/internal%20marks%20calculated/src/app/api/health/route.ts) includes `export const dynamic = "force-dynamic";`.

---

## 8. Operational Runbooks

### Runbook 1: First-Time Production Setup & Database Initialization
1. **Provision Database**: Set up a PostgreSQL 15+ database on Supabase or AWS RDS.
2. **Configure Connection Strings**:
   - `DATABASE_URL`: Transaction pooler (Port 6543) with `?pgbouncer=true&connection_limit=1`.
   - `DIRECT_URL`: Direct connection (Port 5432) for DDL migrations.
3. **Apply Migrations**:
   ```bash
   npm run prisma:deploy
   ```
4. **Initialize Baseline Data**:
   Ensure `ALLOW_DEMO_SEED=true` is set only for staging/dev environments. For production:
   ```bash
   ALLOW_DEMO_SEED=true ADMIN_INITIAL_PASSWORD="<YourSecurePassword>" npm run seed
   ```
5. **Verify Health Endpoint**: Query `GET /api/health` and verify `200 OK` with database status `healthy`.

---

### Runbook 2: Batch Promotion & Dry-Run Preview
1. **Navigate to Promotion Modal**: Admin (`/admin`) or Department HOD (`/hod`).
2. **Execute Dry-Run Preview**:
   - Invokes `GET /api/admin/batches/[id]/promote/preview` (or `/api/hod/...`).
   - Verifies target semester, academic term creation/reuse, section provisioning, and flags any students with `semesterOverride`.
   - **Zero Writes**: Confirm that the dry-run executes purely in-memory without database alterations.
3. **Execute Promotion**:
   - In the confirmation modal, type the exact batch label (e.g., `BCA 2024-27`).
   - Click "Confirm Promotion". The system increments `currentSemester` and provisions all offering sections for the new semester.

---

### Runbook 3: Marks Lock & Policy Enforcement (HTTP 423)
1. **423 Locked State**: Marks entry, Excel imports, and attendance submissions are locked with HTTP 423 until:
   - Grading Policy is confirmed by the HOD.
   - Section has an assigned teaching faculty member.
2. **Unlocking Sections**:
   - HOD accesses `/hod`, configures component weights (CES, Internal, Attendance) and attendance slabs, and clicks **"Confirm Policy"**.
   - HOD assigns teaching faculty member to each section of that offering.
3. **Emergency Relocking**:
   - If an error is detected in policy weights, the HOD clicks **"Unconfirm Policy"**. This immediately re-locks all sections and emits a `POLICY_UNCONFIRMED` notification to assigned faculty.

---

### Runbook 4: Emergency Session Revocation & Account Deactivation
1. **User Account Deactivation**:
   - Admin accesses `/admin` -> Faculty / Student table -> Clicks **"Deactivate"**.
   - Increments `tokenVersion`, sets `isActive: false`, and writes an `AuditLog`.
   - Blocks deactivation if faculty is a sitting HOD (`FACULTY_IS_HOD`) or assigned to active sections (`FACULTY_HAS_ACTIVE_SECTIONS`).
2. **Global Logout Everywhere**:
   - Triggered via `POST /api/auth/logout-everywhere`.
   - Increments `tokenVersion` on `User`, revoking all active refresh tokens immediately.
   - Any attempt to invoke `/api/auth/refresh` with an older token is rejected with 401.
   - Existing 15-minute access tokens expire naturally within a maximum of 15 minutes.

---

### Runbook 5: Production Rollback Procedure
1. **Application Code Rollback**:
   - In Vercel Dashboard -> Deployments -> Find previous stable deployment -> Click **"Instant Rollback"**.
2. **Database Migration Reversal**:
   - Identify the failed migration SQL file in `prisma/migrations/`.
   - Apply the corresponding reverse DDL script directly via `DIRECT_URL` (Port 5432).
   - Update `_prisma_migrations` table to mark the migration rolled back.

---

## 9. Operational Checklists

### Checklist A: Pre-Launch Production Verification
- [ ] Environment variables verified: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CRON_SECRET`.
- [ ] Database migrations applied sequentially via `npm run prisma:deploy`.
- [ ] Base admin user created with strong initial password.
- [ ] Sentry error telemetry initialized (`withSentryConfig` in `next.config.mjs`, `instrumentation.ts` registered).
- [ ] Vercel Cron registered for `/api/cron/query-sla` (`0 0 * * *`).
- [ ] SSL certificate active with `X-Forwarded-Proto: https` enabled.
- [ ] Full automated test suite passes (`npm test`).
- [ ] Production build succeeds without errors (`npm run build`).

### Checklist B: Term Start Operational Checklist
- [ ] Create upcoming `AcademicTerm` records for all departments.
- [ ] Review master subject catalogs and create any newly introduced courses.
- [ ] Department HODs configure and confirm grading policies for all active subject offerings.
- [ ] Department HODs assign teaching faculty members to all section offerings.
- [ ] Verify that section HTTP 423 locks transition to unlocked state for assigned faculty.
- [ ] Verify student rosters imported and assigned to sections.

### Checklist C: Term End & Grade Finalization Checklist
- [ ] Teaching faculty submit final marks via bulk grid or CSV/Excel import.
- [ ] Teaching faculty review section analytics (mean, median, pass rate, grade bands, shortfall count).
- [ ] Teaching faculty click "Publish Marks" to unlock student portal visibility.
- [ ] Resolve all open student grievance queries before grade freeze deadline.
- [ ] Confirm Query SLA cron runs without escalations.
- [ ] Admin / HOD generates multi-term cumulative transcript PDFs with `OFFICIAL` watermark (students may download self-only cumulative transcript PDF).
- [ ] Execute batch promotion dry-run previews and promote batches to next academic semester.

