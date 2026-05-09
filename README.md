# Clinics Management Platform

A full-stack **clinic management system**: multi-clinic tenants, RBAC, patient registry, clinical encounters, scheduling, HR, expenses, revenue, reporting, and administration. The stack is a **NestJS** REST API with **Prisma** / **PostgreSQL**, and a **React** (Vite) SPA with **Tailwind CSS** and **i18n** (English / Arabic).

**Repository:** [github.com/mshall/clinics-management](https://github.com/mshall/clinics-management)

---

## Table of contents

1. [System overview](#system-overview)
2. [Features & modules](#features--modules)
3. [Architecture](#architecture)
4. [Prerequisites](#prerequisites)
5. [Local setup](#local-setup)
6. [Useful commands](#useful-commands)
7. [Environment variables](#environment-variables)
8. [Deploying to AWS (minimum cost)](#deploying-to-aws-minimum-cost)
9. [Security & production checklist](#security--production-checklist)
10. [Documentation](#documentation)

---

## System overview

The platform is designed for **healthcare groups** that operate **one or many clinics** (parent locations and branches). Each **tenant** owns users, clinics, patients, and operational data. Users authenticate with **JWT** and see navigation and actions according to **role-based access control (RBAC)**.

Typical flows:

- **Front desk / nurses:** patients, appointments, encounters (within role limits).
- **Physicians:** patients, encounters, **own** appointments schedule, doctor revenue, clinical documentation.
- **Finance:** expenses, revenue (where permitted), reports.
- **HR:** employees, attendance, leave.
- **Group admin:** tenant settings, clinics, users, feature flags, cross-tenant views where implemented.

---

## Features & modules

### Authentication & access

- JWT login; session stored in the SPA.
- Roles include (among others): `GROUP_ADMIN`, `BRANCH_MANAGER`, `PHYSICIAN`, `NURSE`, `RECEPTIONIST`, `HR_OFFICER`, `FINANCE_OFFICER`.
- Example: **Revenue** is hidden from roles such as nurse and receptionist (see `apps/web/src/lib/permissions.ts`).

### Dashboard

- KPIs and summaries driven by a configurable **reporting date range** (shared store for dashboard/reports).

### Patients

- Register and list patients; advanced filters (MRN, phone, name, national ID, gender).
- Column filters on the main table; **home branch** and demographics.
- Patient detail view.

### Encounters (clinical visits)

- List and open encounters; structured visit data, diagnoses, medications, **document uploads** (e.g. lab / radiology).
- Finalization workflow aligned with the API.
- Creating an encounter captures a **visit fee** (default from tenant admin **default visit fee**); amounts greater than zero post a revenue ledger line (`VISIT_FEE`).

### Appointments

- Search and paginate appointments; book with clinic, patient, physician, start/end (scheduling only; no fee on the appointment). The list highlights **clinic** (English / Arabic name from the directory).
- **Physicians** see the Appointments area in navigation; the API returns only rows where they are the **attending clinician**. Physicians booking through the UI must create appointments **as themselves**.
- Status model: **Scheduled** (default on create), **Confirmed**, **Cancelled**, **Completed**. Linking an encounter sets the booking to **Confirmed**; finalizing that encounter sets **Completed**.
- Detail and edit until the appointment is **Completed** (then read-only).

### Clinics

- View clinics in the tenant (parent / branch model as exposed by the API).

### Expenses

- Record expenses by clinic, category, vendor, amount, date; optional **receipt / proof** upload (PDF or images).
- Status workflow (e.g. pending / approved) as implemented in the API.

### Revenue

- Ledger view with date range and clinic filter; **totals** (gross / net) for the filtered range.
- Manual posting with categories, **VAT %**, auto-calculated net, and currency (tenant base currency in typical setups).

### HR

- **Summary** KPIs (headcount, payroll estimate, pending leave).
- **Employees:** auto-generated `EMP-*` numbers, clinic assignment, optional **ID / passport** document upload, column filters (including server-backed name/clinic filters).
- **Attendance** with history and filters; **clinic** column per employee’s home clinic.
- **Leave** requests and approval-style status updates.

### Reports

- Financial / operational reporting views (wired to the reporting range and API).

### Admin

- **Tabs:** clinics & tenants vs organization & settings.
- Current tenant overview, **default appointment fee**, audit tail, **feature flags**, user creation (group admin).
- Clinic creation (parent/branch), clinic directory, **all tenants** list (platform-style listing).

### API & developer experience

- Global prefix: `/api/v1`.
- **Swagger UI** at `/docs` when enabled (default in development).
- **OpenAPI** export script for the web client (`apps/api/scripts/openapi-export.ts`).

### Internationalization

- English and Arabic strings in `apps/web/src/locales/`.

---

## Architecture

| Layer | Technology |
|--------|------------|
| API | NestJS 10, Prisma 6, PostgreSQL |
| Auth | Passport JWT, `bcryptjs` |
| Web | React 18, Vite, TanStack Query, React Router, Tailwind, shadcn-style UI primitives |
| Monorepo | npm workspaces (`apps/api`, `apps/web`) |

**Local dev traffic:** Vite dev server proxies `/api` → `http://localhost:3000` (see `apps/web/vite.config.ts`). The SPA calls relative `/api/v1/...` unless `VITE_API_URL` is set.

---

## Prerequisites

- **Node.js** 20+ (LTS recommended)
- **npm** 9+
- **Docker** and Docker Compose (for local PostgreSQL / Redis)

---

## Local setup

### 1. Clone the repository

```bash
git clone git@github.com:mshall/clinics-management.git
cd clinics-management
```

### 2. Install dependencies

From the **repository root**:

```bash
npm install
```

### 3. Start PostgreSQL (and Redis)

```bash
npm run db:up
```

This uses `docker-compose.yml` (Postgres `cms` / `cms` / DB `cms` on port **5432**, Redis on **6379**).

### 4. Configure the API

Create **`apps/api/.env`** (minimal example):

```env
DATABASE_URL="postgresql://cms:cms@localhost:5432/cms?schema=public"
JWT_SECRET="change-me-to-a-long-random-string-in-production"
PORT=3000
```

- **`DATABASE_URL`** must match the Postgres user/password/database from Docker Compose.
- **`JWT_SECRET`** must be a strong secret in any shared or production environment.

### 5. Apply migrations and seed demo data

```bash
npm run db:setup
```

Equivalent to Prisma generate, migrate deploy, and seed (demo tenant and users — see `apps/api/prisma/seed.ts` for credentials).

If you only need schema without re-seeding:

```bash
npm run db:deploy -w api
```

### 6. Run the app (API + web)

```bash
npm run dev
```

- **Web:** [http://localhost:5173](http://localhost:5173)
- **API:** [http://localhost:3000](http://localhost:3000)
- **Swagger:** [http://localhost:3000/docs](http://localhost:3000/docs)

After `db:setup`, use the **demo seed users** below (password **`demo`** for every account). Additional mixed-role staff accounts `staff3@kiorly.com` … `staff15@kiorly.com` are also created; see `apps/api/prisma/seed.ts` for exact role assignment.

| Email | Display name (seed) | Role |
|--------|----------------------|------|
| `admin@kiorly.com` | Group Administrator | Group admin |
| `physician@kiorly.com` | Dr. Demo Physician | Physician |
| `doctor2@kiorly.com` | Dr. Second Physician | Physician |
| `clinicadmin@kiorly.com` | Demo Clinic Administrator | Clinic admin (scoped clinics) |
| `assistant@kiorly.com` | Demo Clinic Assistant | Clinic assistant |
| `nurse@kiorly.com` | Demo Nurse | Nurse |
| `receptionist@kiorly.com` | Demo Receptionist | Receptionist |
| `finance@kiorly.com` | Demo Finance Officer | Finance officer |
| `branchmgr@kiorly.com` | Demo Branch Manager | Branch manager |

### 7. Production-style builds (optional local check)

```bash
npm run build
```

API output is under `apps/api/dist`; web static assets under `apps/web/dist`.

---

## Useful commands

| Command | Description |
|--------|-------------|
| `npm run dev` | API (watch) + Vite dev server |
| `npm run dev:api` / `npm run dev:web` | One app only |
| `npm run db:up` / `npm run db:down` | Start / stop Docker services |
| `npm run db:setup` | Generate client, migrate, seed |
| `npm run build` | Build API then web |
| `npm run lint` | Lint web |
| `npm run codegen -w web` | Regenerate TS types from OpenAPI (after export) |

---

## Environment variables

### API (`apps/api/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for signing JWTs |
| `PORT` | No | HTTP port (default `3000`) |
| `SWAGGER_ENABLED` | No | Set to `false` to disable `/docs` in production |

### Web (`apps/web`)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | If set, API calls go to this base (e.g. `https://api.example.com`). If empty, the app uses same-origin `/api` (use a reverse proxy or reconfigure Vite for production). |

---

## Deploying to AWS (minimum cost)

Goal: **smallest monthly bill** while staying maintainable. Below are practical tiers from **cheapest / simplest** upward.

### Option A — Single small VPS (often the cheapest overall)

Use **Amazon Lightsail** (fixed monthly) **or** one **EC2** instance (e.g. **t4g.nano** / **t3.micro** in Free Tier where eligible).

1. **One VM** runs:
   - **PostgreSQL** in Docker (same pattern as `docker-compose.yml`), **or** a managed DB (adds cost; see Option B).
   - **Nest API** via `node dist/main.js` behind **Nginx** reverse proxy (TLS with Let’s Encrypt).
   - **Static SPA**: build `npm run build -w web` and serve `apps/web/dist` with Nginx, or run a tiny static file server.

2. **Process manager:** `systemd` or **PM2** for the API.

3. **TLS:** **Lightsail load balancer** (paid) *or* **Caddy** / **Certbot** on the instance (no extra LB cost).

4. **Uploads:** API writes under `uploads/` — persist on an **EBS** volume or **Lightsail block storage** so restarts do not lose files.

**Rough cost (order of magnitude):** Lightsail **$5–10/mo** bundles; EC2 **Free Tier** for 12 months then **~$3–10/mo** for a nano + small EBS volume, excluding data transfer spikes.

### Option B — Slightly higher cost, less ops: RDS + small compute

- **RDS PostgreSQL** `db.t4g.micro` (or smallest instance) for automated backups and patching.
- **EC2 or Lightsail** only for API + Nginx + static files (or static on S3 — see C).

**Trade-off:** RDS starts around **tens of dollars per month** in many regions; lowest *total* cost is often **Postgres on the same VM** (Option A).

### Option C — Split static frontend (very cheap CDN)

1. `npm run build -w web` → upload `dist/` to **S3**; front with **CloudFront** (optional, improves global latency and TLS).
2. Set **`VITE_API_URL`** at build time to your public API URL (e.g. `https://api.yourdomain.com`).
3. Run **API only** on a small EC2/Lightsail instance with Postgres (Docker) or RDS.

**Trade-off:** Two deploy steps; CORS and cookie rules must match your domains.

### Option D — Containers without running Kubernetes (middle ground)

- **AWS App Runner** or **ECS Fargate** for the API: pay per use + small always-on minimum; simpler than EKS, but can exceed a single tiny VM if always on.
- Good when you want AWS-managed runtime and are okay paying for convenience.

### Cost tips (all options)

- Use **one region**; avoid cross-AZ data charges where possible.
- **Disable** unused services (NAT Gateway is expensive for simple setups — prefer public subnet + security groups for a small demo, or IPv6-only patterns if you know the trade-offs).
- **Stop** dev/staging instances when not in use; use **S3 lifecycle** rules if you archive uploads.
- Set **`SWAGGER_ENABLED=false`** in production.
- Rotate **`JWT_SECRET`** and use strong DB passwords; restrict security groups to **443** (and **22** only from your IP if you need SSH).

### Minimal high-level checklist for AWS

1. Register a domain (Route 53 or any registrar); create **A/AAAA** or **CNAME** to your instance or CloudFront.
2. Provision VM → install Docker (optional) or Node → deploy `dist` + env files.
3. Run `prisma migrate deploy` against production `DATABASE_URL` (no seed in production unless intended).
4. Put **Nginx** (or ALB) in front with HTTPS.
5. Configure **backups** (EBS snapshots and/or RDS automated backups).

---

## Security & production checklist

- Never commit real `.env` files or secrets.
- Use **HTTPS** everywhere; set secure cookie flags if you add cookies later.
- Lock down **Swagger** in production.
- Plan **migrations** as the single source of truth for schema (already using Prisma migrate).
- Monitor disk usage for **upload** directories.

---

## Documentation

- Product / requirements context: `Docs/Clinic_Management_System_PRD.md`
- Technical RFC (if present): `Docs/Clinic_Management_System_RFC.md`
- AWS deployment (RDS, ECS/Fargate, S3/CloudFront, checklist): `Docs/AWS_Cloud_Deployment_Guide.md`

---

## License

Private / unlicensed unless you add a `LICENSE` file. Confirm ownership and terms with the repository owner before redistribution.
