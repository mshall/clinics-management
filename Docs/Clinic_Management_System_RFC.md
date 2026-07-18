# Technical RFC
## Clinic Management System (CMS) — Architecture & Implementation

| Field | Value |
|---|---|
| **Document Title** | Clinic Management System – Technical RFC |
| **Version** | 1.5 |
| **Status** | Living document (aligned with `main` as of July 2026) |
| **Related** | [`Clinic_Management_System_PRD.md`](./Clinic_Management_System_PRD.md) v1.6 |
| **Last Updated** | July 2026 |

---

## 1. Overview

This RFC describes the technical architecture and implementation of the Clinic Management System (CMS) defined in the PRD v1.6. The platform is a **multi-tenant SaaS** for clinic groups: one deployed stack serves many organizations (`tenantId`), each with multi-branch clinics, EHR workflows, expenses, HR, and bilingual UI.

The defining engineering constraints for v1:

- **Easy to contribute to.** Idiomatic, opinionated stack with strong typing and clear module boundaries.
- **Easy to ship.** Single deployable unit, single command to deploy to AWS, infrastructure-as-code, ephemeral environments per pull request.
- **Easy to grow.** Module boundaries chosen so that any module can be extracted into its own service later without rewrites.

We adopt a **modular monolith** for the backend rather than microservices in v1. NestJS gives us microservice-ready boundaries inside a single deployable, which buys us simplicity now and optionality later.

## 2. Goals and Non-Goals

### 2.1 Goals
- One repository, one CI/CD pipeline, one deploy command.
- Strict module boundaries enforced by linting and code review.
- Strong type safety across backend, web, and mobile via shared TypeScript packages.
- AWS-native deployment using managed services to minimize operational burden.
- Full audit trail and compliance posture suitable for health data.
- Bilingual (EN/AR) support designed in from day one.

### 2.2 Non-Goals (v1)
- Microservices split.
- Polyglot stacks.
- Self-hosted Kubernetes.
- Custom ML infrastructure.
- **React Native mobile app** — not present in this repository yet; web is responsive.

## 3. Technology Stack

| Layer | Choice | Why |
|---|---|---|
| Backend Framework | **NestJS (TypeScript)** | Opinionated, modular, DI-based, microservice-ready, large ecosystem, excellent docs — easiest framework for new Node engineers to contribute to safely |
| API Style | REST + OpenAPI 3 (generated) | Universally understood; GraphQL deferred to v2 if needed |
| ORM | **Prisma** | Best-in-class DX, type-safe queries, declarative migrations, easy onboarding |
| Database | **PostgreSQL 16 (Amazon RDS in prod; Docker locally)** | Mature RDBMS, strong JSON support, multi-AZ capable |
| Cache / Queues | Redis (Docker locally) | Available in compose; ElastiCache optional for prod scale |
| Object Storage | **Amazon S3 (production)** / local `uploads/` (development) | Attachments, prescriptions, patient documents, logos — `UPLOAD_STORAGE=s3` on App Runner |
| Auth | **JWT (symmetric `JWT_SECRET`)** via `@nestjs/jwt`; **bcryptjs** password hashes | Implemented: `POST /auth/login`, `GET /auth/me`, `PATCH /auth/me/password`. Refresh tokens, MFA, OIDC SSO — roadmap |
| Frontend Web | **React 18 + Vite + TypeScript** | Fast DX, modern tooling |
| State Mgmt | TanStack Query + Zustand | Server state and lightweight client state |
| UI Library | shadcn/ui + Tailwind CSS + Radix | Accessible, themeable, RTL-friendly |
| i18n | i18next + react-i18next | EN/AR with RTL |
| Mobile | **Deferred** | RFC target was React Native; not shipped in this repo |
| Infra-as-Code | **AWS CDK (TypeScript)** in `infra/` | Matches the stack, type-safe infra; **deployed today** |
| Container Runtime | **AWS App Runner** (API) + **CloudFront** (SPA + `/api/*`) | No ALB/NAT in cost-optimized stack; ECS Fargate remains an alternative |
| CDN / Web hosting | CloudFront + S3 (web assets) | Single HTTPS origin for SPA and API path routing |
| CI/CD | GitHub Actions (`deploy-aws.yml`, `pr-synth-build.yml`) | OIDC to AWS; push to `main` deploys |
| Observability | CloudWatch (App Runner logs); X-Ray hook on instance role | Grafana Cloud optional per PRD |
| Secrets | AWS Secrets Manager (JWT, RDS) | Injected into App Runner / seed Lambda |
| Email/SMS | Amazon SES + SNS (or third party) | Managed |
| Monorepo | **npm workspaces** (`apps/api`, `apps/web`) | Turborepo/pnpm described in early RFC drafts; current repo uses npm |

## 4. Repository Structure (Monorepo)

The repository uses **npm workspaces** (not Turborepo/pnpm in the current tree):

```
kiorly-clinics-management/
├── apps/
│   ├── api/                  # NestJS backend (Prisma, JWT, Swagger)
│   └── web/                  # React + Vite SPA (EN/AR)
├── infra/                    # AWS CDK app (App Runner, RDS, CloudFront, S3)
│   ├── src/kiorly-clinics-management-stack.ts
│   └── lambda/db-seed/       # Post-deploy idempotent seed
├── Docs/                     # PRD, RFC, deployment guide, test users
├── scripts/                  # Dev ports, CI seed helpers
├── .github/workflows/        # deploy-aws.yml, pr-synth-build.yml
├── docker-compose.yml        # Local Postgres + Redis
└── package.json              # Root scripts: dev, build, db:setup
```

A new engineer clones the repo and runs:

```bash
npm install
cp apps/api/.env.example apps/api/.env   # adjust DATABASE_URL if needed
npm run db:up
npm run db:setup
npm run dev          # API :3000 + Vite :5173 via concurrently
```

Production deploy (see [`AWS_Cloud_Deployment_Guide.md`](./AWS_Cloud_Deployment_Guide.md)):

```bash
npm run build
cd infra && npx cdk deploy   # or push to main → GitHub Actions
```

## 5. High-Level Architecture

**Implemented production topology** (see [§14](#14-aws-deployment-architecture-implemented)):

```
                         Route 53 (optional custom domain)
                                    │
                                    ▼
                           CloudFront Distribution
                    ┌───────────────┴────────────────┐
                    │                                │
             S3 (web SPA)                    /api/* behavior
         + viewer-request fn                  HTTPS to App Runner
         (SPA deep links)                         │
                    │                              ▼
                    │                    App Runner (NestJS API)
                    │                    VPC connector → RDS PostgreSQL
                    │                    S3 uploads (`UPLOAD_STORAGE=s3`)
                    └──────── same AppUrl ─────────┘

Post-deploy: Lambda DbSeedFn (idempotent migrate + seed on RDS)
```

The API is a **single NestJS process** on App Runner exposing REST + OpenAPI at `/api/v1`. There is **no separate worker service** in the deployed stack today; long-running jobs (notifications, materialized-view refresh) are roadmap items.

Local development: `docker-compose.yml` provides Postgres 16 and Redis; API + Vite run via `npm run dev`.

### 5.1 Multi-tenancy architecture (implemented)

| Layer | Mechanism |
|---|---|
| **Data model** | Shared PostgreSQL schema; `tenantId` column on tenant-owned tables (patients, clinics, encounters, ledger, etc.). |
| **Provisioning** | `PLATFORM_SUPER_ADMIN` (`tenantId: null`) creates organizations via `/admin/platform/tenants`. |
| **Request scoping** | JWT payload includes `tenantId` (null only for platform admin). Controllers call `requireTenantId(user)` and services add `where: { tenantId }`. |
| **Platform APIs** | `/admin/platform/*` restricted to platform super admin; org APIs under `/admin/*`, `/clinics`, `/patients`, etc. require a tenant JWT. |
| **Uniqueness** | Business keys (MRN, national ID, phone) unique **per tenant**, not globally. |
| **Clinic scope** | `CLINIC_ADMIN` / `BRANCH_MANAGER` filtered via `ClinicAdminScope`; physicians filtered by `clinicianId` on encounters/appointments/operations. |
| **Defense in depth** | PostgreSQL **RLS** policies described in [§7](#7-data-model-prisma--postgresql) are **not enabled** yet; isolation is application-enforced. |

**Enterprise option:** Deploy a **dedicated stack** (same CDK app) with one tenant populated — logical single-tenant, separate RDS. Not a code fork.

## 6. Backend Module Catalog

NestJS modules in `apps/api/src/app.module.ts` map to product concerns. Cross-module access should go through injected services; `eslint-plugin-boundaries` is the long-term enforcement target.

> **Legend:** [§6.1](#61-module-map-implemented) lists **shipped** modules. [§6.2](#62-module-specifications) mixes **implemented** endpoint notes with **roadmap** specs retained for modules not yet in the repo (Billing, Notifications, etc.).

### 6.1 Module Map (implemented)

| Module | Path | Responsibility |
|---|---|---|
| `AuthModule` | `auth/` | Login, JWT, `/auth/me`, password change |
| `PatientsModule` | `patients/` | Registry, documents, phone conflict, clinical-documents aggregation |
| `ClinicsModule` | `clinics/` | Clinic CRUD, physicians, scheduling helpers, **disable/reactivate**, operating periods |
| `EncountersModule` | `encounters/` | Encounters, vitals, diagnoses, medications, documents, finalize |
| `AppointmentsModule` | `appointments/` | Appointment lifecycle, physician/clinic scope |
| `OperationsModule` | `operations/` | Surgical/procedure scheduling, balance, revenue hooks |
| `ExpensesModule` | `expenses/` | Expense entries, proof uploads, approval status |
| `RevenueModule` | `revenue/` | Revenue ledger, visit fees, manual entries, totals |
| `InvoicesModule` | `invoices/` | Patient invoices, clinic invoice/prescription branding uploads |
| `HrModule` | `hr/` | Employees, attendance, leave, ID documents, **user-linked lifecycle** |
| `AdminModule` | `admin/` | Org overview, audit, platform admin, data explorer, org patients/**users lifecycle** |
| `ReportsModule` | `reports/` | **Date-range** performance, clinic breakdown, monthly series, acquisition |
| `DashboardModule` | `dashboard/` | Group KPI overview |
| `UsersModule` | `users/` | Tenant user directory |
| `UserNavTabsModule` | `user-nav-tabs/` | Per-user navigation grants |
| `AuditModule` | `audit/` | Audit log writes |
| `StorageModule` | `storage/` | Local disk or S3 upload/download |
| `HealthModule` | `health/` | Liveness/readiness |
| `PrismaModule` | `prisma/` | Database client |

**Not in `app.module.ts` (roadmap):** separate `PrescriptionsModule`, `BillingModule`, `NotificationsModule`, `LocalizationModule` (i18n is web-only today), BullMQ worker, CASL ability factory.

### 6.1.1 Aspirational module map (roadmap)

Early RFC drafts grouped concerns differently. When extracting services later, these boundaries remain useful:

| Module | Responsibility |
|---|---|
| `PrescriptionsModule` | Standalone drug catalog, interaction engine, Rx PDF service |
| `BillingModule` | Invoices, payments, insurance claims |
| `NotificationsModule` | Email, SMS, in-app, license expiry |
| `ReportingModule` (advanced) | Materialized views, warehouse export, scheduled jobs |

### 6.2 Module Specifications

Each module spec below lists primary entities, key endpoints (illustrative, not exhaustive), and notable design notes.

#### 6.2.1 AuthModule *(implemented)*

**Entities:** `User` (shared with `UsersModule` / Prisma).

**Endpoints:**
```
POST   /auth/login
GET    /auth/me
PATCH  /auth/me/password
```

**Notes:**
- Password hashing: **bcryptjs** (`bcrypt.compareSync` / hash on password change).
- Access token: JWT signed with **`JWT_SECRET`** (symmetric); payload includes `sub`, `tenantId`, `email`, `role`.
- Login response includes optional `navTabKeys` from `UserNavTabGrant`.
- Platform super admin detected via role + email allowlist helper (`isPlatformSuperAdmin`).
- **Roadmap:** refresh tokens, Argon2id, MFA/TOTP, OIDC SSO, Redis-backed `ThrottlerGuard`.

#### 6.2.2 ClinicsModule + Admin platform *(implemented)*

**Entities:** `Tenant`, `Clinic`, `ClinicPhysician`, `ClinicAdminScope`, working hours and speciality fields on `Clinic`.

**Org-scoped endpoints (`/clinics`):**
```
GET    /clinics
POST   /clinics                        # parent or branch (parentClinicId optional)
GET    /clinics/:id
PATCH  /clinics/:id
GET    /clinics/:id/physicians
POST   /clinics/:id/physicians
GET    /clinics/physicians/scheduling
```

**Platform endpoints (`/admin/platform`, `PLATFORM_SUPER_ADMIN` only):**
```
GET    /admin/platform/overview
GET    /admin/platform/tenants
POST   /admin/platform/tenants         # create org + optional HQ clinic + group admin
GET    /admin/platform/tenants/:tenantId
PATCH  /admin/platform/tenants/:tenantId
POST   /admin/platform/tenants/:tenantId/clinics
POST   /admin/platform/tenants/:tenantId/users
GET    /admin/platform/feature-flags
PATCH  /admin/platform/feature-flags/:key
```

**Notes:**
- Multi-tenancy: **shared database, shared schema**, `tenantId` on every business row; enforced in services (RLS optional later).
- Hierarchy via nullable `parentClinicId` on `Clinic`.
- Org settings and audit: `/admin/overview`, `/admin/audit-logs`, org patient/user bulk tools under `/admin/...`.

#### 6.2.3 UsersModule *(implemented)*

**Entities:** `User`, `ClinicAdminScope`, `UserNavTabGrant`.

**Endpoints:**
```
GET    /users                          # tenant directory (paginated)
```

Org admin user CRUD and bulk delete live under **`/admin/users`** (see `AdminModule`).

**Notes:**
- Authorization is **role-based** in services/controllers (`UserRole` enum), not a configurable CASL matrix.
- Clinic admins and branch managers are scoped via `ClinicAdminScope` rows.
- **Roadmap:** custom roles, `(resource, action)` permission matrix, `@CheckAbility` decorators.

#### 6.2.4 PatientsModule

**Entities:** `Patient`, `PatientDocument`, national ID scan fields, acquisition channel fields; encounter documents are owned by `EncountersModule` but surfaced on the patient profile via aggregation.

**Implemented endpoints (`/api/v1/patients`):**
```
GET    /patients                         # paginated list + filters
POST   /patients
GET    /patients/phone-conflict          # ?phone=&excludePatientId= — live duplicate check
POST   /patients/bulk-delete             # soft-delete many (role-gated)
GET    /patients/:id
PATCH  /patients/:id
DELETE /patients/:id                     # soft-delete (role-gated)
GET    /patients/:id/clinical-documents  # labs, radiology, prescriptions, other (+ nationalId in other)
POST   /patients/:id/documents           # multipart: file + description (category label)
GET    /patients/:id/documents/:documentId
DELETE /patients/:id/documents/:documentId
POST   /patients/:id/documents/:documentId/crop   # multipart cropped image; replaces stored blob
DELETE /patients/:id/encounter-documents/:encounterId/:documentId
POST   /patients/:id/encounter-documents/:encounterId/:documentId/crop
POST   /patients/:id/national-id-document
GET    /patients/:id/national-id-document
```

**Notes:**
- Patients are **tenant-scoped**. `mrn` and `nationalId` are unique per tenant when set; **phone** is unique per tenant via normalized digit comparison (enforced on create/update and exposed through `phone-conflict`).
- `dob` is optional. Arabic first/last names required at registration in the current UI.
- Registration documents store a **description** (localized category label or free text for “Other”); clinical sections classify by that label plus encounter `EncounterDocument.kind` (`LAB`, `RADIOLOGY`, `PRESCRIPTION`).
- **`listClinicalDocuments`** appends the patient’s national ID scan to **`other[]`** with synthetic id `national-id` and `source: "nationalId"` (read-only in UI — no delete/crop).
- Soft-delete via `deletedAt`; bulk delete and single delete for roles in `PATIENT_MANAGE_ROLES` (Group Admin, Group Supervisor, Call Center, Clinic Admin, Clinic Assistant, Branch Manager).
- Cross-branch encounter documents on the profile respect the same physician/clinic scope as encounter lists.
- Document blobs stored via `UploadBlobStorage` (`uploads/` locally or S3 in production); crop replaces the blob in place and updates metadata.

#### 6.2.5 EncountersModule *(implemented)*

**Entities:** `Encounter`, `Vital`, `Diagnosis`, `EncounterMedication`, `EncounterDocument` (`kind`: `LAB` | `RADIOLOGY` | `PRESCRIPTION`).

**Endpoints:**
```
GET    /encounters                     # paginated; physician/clinic scoped
POST   /encounters
GET    /encounters/:id
PATCH  /encounters/:id                 # while DRAFT
POST   /encounters/:id/finalize
POST   /encounters/:id/diagnoses
POST   /encounters/:id/medications
POST   /encounters/:id/documents       # multipart upload (LAB | RADIOLOGY | PRESCRIPTION)
GET    /encounters/:id/documents/:docId/file
DELETE /encounters/:id/documents/:docId
```

**Notes:**
- Status machine: `DRAFT → FINALIZED` (amend flow partial / roadmap).
- Finalizing posts `VISIT_FEE` revenue when fee > 0; may complete linked appointment.
- Prescriptions in v1 are **encounter medications + optional generated Rx image + PRESCRIPTION documents** — not a separate prescriptions service.
- ICD-10 codes stored on diagnoses; drug interaction checks — roadmap.

#### 6.2.6 PrescriptionsModule *(roadmap — not a separate Nest module)*

Prescription behavior lives in **`EncountersModule`** and patient clinical-document aggregation today. A future standalone module would add drug catalog search, interaction rules, and bilingual PDF templates.

**Target endpoints (not all implemented):**
```
GET    /drugs?search=...
POST   /encounters/:id/prescriptions
GET    /patients/:id/prescriptions
GET    /prescriptions/:id/pdf
```

#### 6.2.7 AppointmentsModule *(implemented)*

**Entities:** `Appointment` (status: Scheduled, Confirmed, Cancelled, Completed).

**Endpoints:**
```
GET    /appointments
POST   /appointments
GET    /appointments/:id
PATCH  /appointments/:id
POST   /appointments/:id/cancel
```

**Notes:**
- Physicians see only appointments where they are the attending clinician.
- Clinic admins filtered by `ClinicAdminScope`.
- Linking to encounters moves status toward Confirmed/Completed per PRD §6.1a.

#### 6.2.7a OperationsModule *(implemented)*

**Entities:** `Operation` (`feeCurrency`), operation documents, operation medications; links to `RevenueEntry` on completion.

**Endpoints (illustrative):**
```
GET    /operations
GET    /operations/:id
GET    /operations/outstanding-balances
POST   /operations
PATCH  /operations/:id
POST   /operations/:id/status
POST   /operations/:id/reset-clinical
POST   /operations/:id/documents
POST   /operations/:id/medications
GET    /operations/:id/documents/:docId/file
```

**Notes:**
- Completing an operation posts revenue in **`feeCurrency`** (defaults from clinic `defaultCurrency` via `resolveClinicCurrency()`); cancelling voids linked revenue.
- Scheduled edit loads detail via `GET :id`; save may call `reset-clinical` to replace medications/documents.
- Web edit dialog uses the same fieldset layout as create (`operations-page.tsx`).
- Physician scope matches encounters/appointments patterns.

#### 6.2.7b ExpensesModule *(implemented — currency)*

**Notes:**
- `POST /expenses` accepts optional `currency` (`BASE_CURRENCIES`: EGP, USD, OMR, SAR, AED).
- When omitted or invalid, `expenses.service` defaults to the target clinic’s `defaultCurrency`.
- Proof upload via `multipart/form-data`; approval status via `PATCH .../status`.

#### 6.2.7c ClinicsModule — default currency *(implemented)*

- `Clinic.defaultCurrency` validated against `BASE_CURRENCIES` on create/patch.
- `resolveClinicCurrency(client, tenantId, clinicId)` falls back: clinic → tenant `baseCurrency` → `AED`.
- Encounters use clinic currency when posting visit-fee revenue.

**Shared constants:** `apps/api/src/common/base-currencies.ts`, `apps/api/src/common/clinic-currency.ts`.

**Web formatting:** `apps/web/src/lib/money-display.ts` (`resolveClinicCurrencyCode`, `formatMoneyAmount`).

#### 6.2.8 ExpensesModule *(roadmap details — module implemented with subset)*

**Entities:** `Expense`, `ExpenseCategory`, `Vendor`, `ExpenseAttachment`.

**Endpoints:**
```
POST   /expenses
GET    /expenses?clinicId=&category=&from=&to=
PATCH  /expenses/:id
POST   /expenses/:id/approve
GET    /expenses/reports/by-category
GET    /expenses/reports/group-rollup
```

**Notes:**
- Salary expenses are auto-created by HR/payroll runs to keep books in sync.
- Approval workflow configurable per tenant (single or two-step).

#### 6.2.9 HrModule

**Entities:** `Employee`, `EmploymentContract`, `Attendance`, `LeaveRequest`, `LeaveBalance`, `PayrollRun`, `Payslip`, `EmployeeDocument` (with expiry).

**Endpoints:**
```
POST   /employees
GET    /employees
POST   /employees/:id/contracts
POST   /attendance/clock-in
POST   /attendance/clock-out
POST   /leave-requests
PATCH  /leave-requests/:id/approve
POST   /payroll/runs
GET    /payslips/:id/pdf
```

**Notes:**
- License/document expiry monitor runs as a daily job; emits notifications T-90, T-30, T-7.
- Payroll run is idempotent and can be re-run for a period until locked.
- Salary lines auto-post to `ExpensesModule` upon payroll lock.

#### 6.2.10 RevenueModule

Captures every income stream the clinic group generates and exposes it for billing, reporting, and reconciliation. Revenue is recorded at the **branch + tenant** level and tagged with the originating activity (encounter, surgery, material sale, etc.) so that reports can attribute income to its true source.

**Entities:**
- `RevenueEntry` — atomic income record (amount, currency, date, branch, category, source reference, status).
- `RevenueCategory` — configurable taxonomy with seeded defaults.
- `ServiceCatalog` — priced services offered by the clinic (visit types, surgeries, procedures, lab tests, imaging) with `code`, `nameEn`, `nameAr`, `defaultPrice`, `taxRate`, `categoryId`.
- `MaterialSale` — items sold to patients (medications dispensed at clinic, consumables, devices) with cost vs. price for margin tracking.
- `SurgeryRecord` — surgery-specific revenue with `procedureCode`, `surgeonId`, `assistantIds`, `theatreFee`, `anesthesiaFee`, `consumablesCost`.
- `RevenueAdjustment` — discounts, refunds, write-offs, insurance adjustments (signed amounts, with reason and approver).
- `PaymentAllocation` — links payments received (from BillingModule) to revenue entries.

**Seeded Revenue Categories:**

| Code | Category | Examples |
|---|---|---|
| `VISIT` | Clinic Visit Fees | Consultation, follow-up, telehealth |
| `SURGERY` | Surgical Procedures | Day surgery, in-clinic procedures |
| `PROCEDURE` | Medical Procedures | Injections, minor procedures, dressings |
| `MATERIALS` | Materials Sold | Medications, consumables, devices |
| `LAB` | Laboratory Services | Blood work, pathology |
| `IMAGING` | Imaging Services | X-ray, ultrasound, ECG |
| `PHARMACY` | In-clinic Pharmacy | Dispensed medications |
| `PACKAGES` | Treatment Packages | Bundled multi-session services |
| `INSURANCE` | Insurance Reimbursements | Claim payouts |
| `OTHER` | Miscellaneous | Membership fees, certificates |

**Endpoints:**
```
GET    /revenue/categories
POST   /revenue/categories                 # custom category per tenant

GET    /services                           # service catalog
POST   /services
PATCH  /services/:id

POST   /revenue/entries                    # manual entry (rare; most are auto-created)
GET    /revenue/entries?clinicId=&category=&from=&to=
GET    /revenue/entries/:id
POST   /revenue/entries/:id/adjustments    # discount/refund/write-off

POST   /revenue/material-sales
GET    /revenue/material-sales?clinicId=&from=&to=

POST   /revenue/surgeries
GET    /revenue/surgeries/:id

GET    /revenue/reports/by-category
GET    /revenue/reports/by-service
GET    /revenue/reports/by-clinician
GET    /revenue/reports/group-rollup
```

**Auto-creation hooks (event-driven inside the monolith):**

| Source Event | Resulting Revenue |
|---|---|
| `EncounterFinalized` | `RevenueEntry` of category `VISIT` using the encounter's visit-type service price |
| `ProcedureRecorded` | `RevenueEntry` of category `PROCEDURE` |
| `SurgeryRecordCreated` | `RevenueEntry` of category `SURGERY` |
| `PrescriptionDispensed` (in-clinic) | `RevenueEntry` of category `PHARMACY` + cost from `MaterialSale` |
| `LabOrderCompleted` | `RevenueEntry` of category `LAB` |
| `ImagingOrderCompleted` | `RevenueEntry` of category `IMAGING` |
| `MaterialSaleRecorded` | `RevenueEntry` of category `MATERIALS` |

**Notes:**
- Revenue is **immutable once posted**; corrections happen through `RevenueAdjustment` entries (audit-friendly).
- Multi-currency supported per tenant; group-level reports normalize to a configured base currency using daily FX rates.
- Tax handling: each `ServiceCatalog` item carries a `taxRate`; revenue records store both gross and net values.
- Cost-of-goods captured for `MaterialSale` and `SurgeryRecord` enables true margin reporting downstream.
- Payments are owned by `BillingModule`; this module owns the *recognition* of revenue. Cash-basis vs. accrual-basis configurable per tenant.
- Cross-module reads only via `RevenueService` public methods; direct DB access from other modules is forbidden.

#### 6.2.11 BillingModule

**Entities:** `Invoice`, `InvoiceLine`, `Payment`, `PaymentMethod`, `InsuranceClaim` (light v1).

**Endpoints:**
```
POST   /invoices
GET    /invoices?clinicId=&status=
POST   /invoices/:id/payments
POST   /invoices/:id/void
GET    /invoices/:id/pdf
```

**Notes:**
- Invoices reference `RevenueEntry` IDs as line items.
- Payment recorded here triggers a `PaymentAllocation` in `RevenueModule`.
- v1 supports cash, card (manual reference), bank transfer, insurance. Real card processing deferred.

#### 6.2.12 ReportingModule

The reporting module is the analytical surface of the platform. It does **not** own transactional data — it aggregates from `RevenueModule`, `ExpensesModule`, `EhrModule`, `PrescriptionsModule`, `HrModule`, `SchedulingModule`, and `PatientsModule` through their public service interfaces.

**Architecture:**
- Read-side uses **materialized views** in PostgreSQL refreshed on a schedule (every 15 min for operational, hourly for financial, daily for cohorts). For a clean upgrade path, the same view definitions can later move to a warehouse (Redshift / Snowflake) without changing API contracts.
- Heavy aggregations run in BullMQ background jobs; results cached in Redis with category-based invalidation tags.
- All reports are tenant-scoped, branch-filterable, and date-range parameterized.
- Exports available as CSV, XLSX, and PDF (bilingual).

**Report Catalog:**

##### A. Financial Reports

| Report | Description | Granularity |
|---|---|---|
| **Income vs Expenses (P&L)** | Revenue minus expenses, net profit, margin % | Day / Month / Quarter / Year |
| **Revenue by Category** | Breakdown across visits, surgeries, materials, etc. | By branch, group rollup |
| **Revenue by Service** | Top services by volume and value | Branch, clinician |
| **Revenue by Clinician** | Per-doctor productivity and contribution | Branch |
| **Expense by Category** | Salaries, materials, utilities, other | Branch, group rollup |
| **Expense Ratio Analysis** | Salaries-to-revenue %, materials-to-revenue %, utilities-to-revenue % | Branch trend |
| **Cash Flow Statement** | Inflows and outflows (cash basis) | Monthly |
| **Outstanding Receivables (AR)** | Unpaid invoices, aging buckets (0-30, 31-60, 61-90, 90+) | Branch |
| **Margin Analysis** | Gross margin on materials and surgeries | Per item, per category |
| **Tax Summary** | Collected tax by period for filing | Tenant |

##### B. Growth & Trend Charts

| Chart | Description |
|---|---|
| **Revenue Growth** | Line chart, MoM and YoY, with trend line and forecast band (simple linear regression in v1) |
| **Patient Growth** | New vs returning patients per period |
| **Encounter Volume** | Daily / weekly / monthly with weekday seasonality view |
| **Branch Performance Comparison** | Stacked area or grouped bar across all branches |
| **Speciality Performance** | Revenue and volume per speciality |
| **Year-over-Year Comparison** | Same-period comparisons across multiple years |
| **Cohort Retention** | Patient retention by first-visit month |

##### C. Operational Reports

| Report | Description |
|---|---|
| **Appointment Fill Rate** | Booked vs available slots, no-show rate, cancellation rate |
| **Average Wait Time** | From check-in to clinician encounter |
| **Average Encounter Duration** | Per clinician, per visit type |
| **Clinician Utilization** | Hours booked vs hours available |
| **Top Diagnoses (ICD-10)** | Volume distribution, useful for clinical and stocking decisions |
| **Top Prescribed Drugs** | Volume, with safety flags trend |
| **Patient Demographics** | Age bands, gender, geography (city) |
| **Geographic Distribution** | Heatmap of patient cities served |
| **Referral Source Analysis** | Where new patients come from (when captured) |

##### D. HR Reports

| Report | Description |
|---|---|
| **Headcount Trend** | Hires, exits, net headcount over time |
| **Attendance Summary** | Present, late, absent rates per branch |
| **Leave Liability** | Accrued leave balances valued at current salary |
| **License Expiry Watch** | Upcoming expirations within 90 days |
| **Salary Cost Trend** | Total payroll cost MoM, by role, by branch |

##### E. Compliance & Audit Reports

| Report | Description |
|---|---|
| **Audit Trail Export** | Filterable by user, resource, time range |
| **Access Log** | Who accessed which patient record and when |
| **Amendment Log** | All clinical amendments with reason |

**Endpoints (representative):**
```
GET    /reports/income-vs-expenses?clinicId=&granularity=monthly&from=&to=
GET    /reports/revenue/growth?granularity=monthly&compareYoY=true
GET    /reports/revenue/by-category
GET    /reports/revenue/by-clinician
GET    /reports/expenses/ratios
GET    /reports/cash-flow
GET    /reports/receivables/aging
GET    /reports/operational/appointment-fill-rate
GET    /reports/operational/utilization
GET    /reports/clinical/top-diagnoses
GET    /reports/clinical/top-drugs
GET    /reports/hr/headcount-trend
GET    /reports/hr/license-expiry
POST   /reports/exports                # async export job (csv/xlsx/pdf)
GET    /reports/exports/:jobId         # poll status, download
GET    /dashboards/group-overview      # composite KPIs for landing page
GET    /dashboards/branch/:id
```

**Group Overview Dashboard (default landing for Group Admins):**
- KPI tiles: Net Profit (this month), Revenue (this month vs last), Total Patients, Active Branches, Headcount.
- Charts: Income vs Expenses (last 12 months), Revenue Growth, Branch Performance Comparison, Top Specialities.
- Alerts strip: licenses expiring soon, branches missing data entry, AR over 90 days.

**Branch Dashboard:**
- Today's appointments, no-show rate, today's revenue, this month's revenue vs target, top diagnoses today.

**Notes:**
- Every report respects RBAC scoping: a Branch Manager only sees data for their branches; a Group Admin sees the rollup.
- Dashboards are JSON-defined in the backend; the frontend renders any defined dashboard generically — making it cheap to add new ones.
- Export jobs are async; the user receives an in-app notification + email when ready.

#### 6.2.13 LocalizationModule

**Entities:** `TranslationNamespace`, `TranslationKey`, `TranslationValue` (per locale).

**Endpoints:**
```
GET    /i18n/:locale.json              # bundle download for the web/mobile clients
POST   /i18n/keys                      # admin only
PATCH  /i18n/values/:id
```

**Notes:**
- Strings under version control in `packages/shared-i18n` for compile-time validation; runtime overrides supported per tenant.
- `Accept-Language` header drives locale, with `?lang=` override.
- All API responses can return bilingual fields where applicable (e.g., `name: { en, ar }`).

#### 6.2.14 NotificationsModule

**Entities:** `NotificationTemplate`, `NotificationChannel`, `Notification` (instance), `UserNotificationPreference`.

**Channels:** Email (SES), SMS (SNS), in-app (WebSocket via `@nestjs/websockets`), push (Expo Notifications for mobile).

**Endpoints:**
```
GET    /notifications                  # current user's inbox
PATCH  /notifications/:id/read
GET    /notifications/preferences
PATCH  /notifications/preferences
```

**Notes:**
- Templates support EN/AR; locale resolved from recipient profile.
- Outbox pattern: writes to a `notifications_outbox` table within the transaction that triggers them; a worker dispatches reliably.

#### 6.2.15 FilesModule

**Entities:** `FileObject` (S3 key, mime, size, owner, scope, AV status).

**Endpoints:**
```
POST   /files/uploads                  # returns presigned PUT URL
POST   /files/uploads/:id/complete     # client confirms upload
GET    /files/:id                      # presigned GET URL with short TTL
```

**Notes:**
- Direct browser → S3 uploads via presigned URLs; backend never proxies bytes.
- Optional ClamAV scanning step before marking file `READY`; quarantined files cannot be retrieved.
- Per-tenant S3 prefix; KMS CMK per tenant for at-rest encryption (optional tier).

#### 6.2.16 AuditModule

**Entities:** `AuditLog` (append-only rows per tenant).

**Implementation (shipped):**
- NestJS **HTTP interceptor** calls `AuditService.recordFromHttp` after authenticated tenant requests.
- **Mutations** are logged broadly; **GET** requests are logged only for sensitive reads (patient/encounter/appointment/operation/expense/revenue/clinic/user detail, clinical-documents list, document file download, national ID download).
- **Action names** are derived from method + path, e.g. `VIEW_PATIENT`, `VIEW_PATIENT_CLINICAL_DOCUMENTS`, `VIEW_PATIENT_DOCUMENT`, `UPLOAD_PATIENT_DOCUMENT`, `DELETE_ENCOUNTER_DOCUMENT`, `CROP_PATIENT_DOCUMENT`, `LOGIN`.
- Each row stores: `tenantId`, `actorId`, optional `clinicId`, `action`, `resource`, `resourceId`, `metadata` (method, path, sanitized body), `createdAt`.

**Notes:**
- Org admins tail logs via `GET /admin/audit-logs` (Governance UI).
- Hash-chaining partitions and immutable storage — roadmap; current table is application-append-only.

#### 6.2.17 AdminModule

Group-admin-facing operations not specific to any one domain.

**Implemented endpoints (v1):**
```
GET    /admin/overview
GET    /admin/audit-logs
GET    /admin/tenants                    # paginated list of all tenants — **platform super-admin only** (see below)
PATCH  /admin/tenant-settings
POST   /admin/users
PATCH  /admin/feature-flags/:key
```

**Platform super-admin gate:** Dedicated users with role `PLATFORM_SUPER_ADMIN` and `tenantId: null`, and/or callers whose email appears in `PLATFORM_SUPER_ADMIN_EMAILS`. Login and `GET /auth/me` return `platformSuperAdmin: true` when applicable.

**Platform administration endpoints (v1):**
```
GET    /admin/platform/overview
GET    /admin/platform/feature-flags
PATCH  /admin/platform/feature-flags/:key
GET    /admin/platform/tenants
POST   /admin/platform/tenants              # optional groupAdmin + initialClinic in body
GET    /admin/platform/tenants/:tenantId
PATCH  /admin/platform/tenants/:tenantId
GET    /admin/platform/tenants/:tenantId/users
GET    /admin/platform/tenants/:tenantId/clinics
POST   /admin/platform/tenants/:tenantId/clinics
POST   /admin/platform/tenants/:tenantId/users
```

Legacy org-scoped platform tools (`GET /admin/tenants`, `/admin/data-explorer/*`) remain available to **GROUP_ADMIN** users listed in `PLATFORM_SUPER_ADMIN_EMAILS`.

**Data explorer (group admin / break-glass):**
```
GET    /admin/data-explorer/tables
GET    /admin/data-explorer/:table
GET    /admin/data-explorer/export/sql?tables=...       # PostgreSQL INSERT dump for selected entities
GET    /admin/data-explorer/export/documents?tables=... # ZIP of blobs from UploadBlobStorage + manifest.json
```

Document ZIP export (`tenant-documents-export.ts`) collects file paths from: patients (national ID scan), `patient_documents`, `encounter_documents`, employees (ID doc), expenses (proof), `operation_documents`. Works with **local** `uploads/` and **S3** (`readUploadBuffer`); uses `archiver` v8 `ZipArchive` API.

**Reports (live charts):** All report endpoints accept `from` and `to` (same semantics as `resolveReportingRange`). The web app binds charts to the global reporting period in the header.

```
GET    /reports/performance?from=&to=&clinicId=
GET    /reports/clinic-breakdown?from=&to=
GET    /reports/monthly-series?from=&to=&clinicId=   # calendar-month buckets within range
GET    /reports/patient-acquisition?from=&to=
GET    /reports/patient-acquisition/patients?channel=&from=&to=
GET    /reports/profit-loss?from=&to=&clinicId=      # multi-currency totals
```

- **Performance** — visits, new patients, appointments completed, `byCurrency[]` revenue/expenses/net.
- **Clinic breakdown** — per-clinic visits, patients, `byCurrency[]` (group admin, org-wide only).
- **Monthly series** — per-month visits, posted revenue/expenses by currency, new patients (partial first/last months clamped to range).
- Physicians receive scoped data on the same shapes.

**Patient acquisition:** channel counts + paginated drill-down list for the Reports UI dialog.

**Clinics lifecycle (implemented):**
```
GET    /clinics?includeInactive=true          # admin roles only; default list = ACTIVE only
POST   /clinics/:id/deactivate               # { effectiveDate? }; cascades active branches
POST   /clinics/:id/reactivate               # { startDate? }; parent must be ACTIVE for branches
GET    /clinics/:id                          # includes operatingPeriods[], recordStatus, disabledAt
```
- `Clinic.recordStatus` (`ACTIVE` | `INACTIVE`), `ClinicOperatingPeriod` (start/end dates).
- Active clinics only in physician network and operational pickers (`clinic-scope.ts`).

**Organization users lifecycle (implemented):**
```
GET    /admin/users?archived=true
POST   /admin/users/:id/deactivate
POST   /admin/users/:id/reactivate
DELETE /admin/users/:id                      # soft archive (+ linked employee)
POST   /admin/users/:id/restore
```
- `User.deactivatedAt`, `User.deletedAt`; login and JWT validation reject inactive users.
- Cascades via `common/user-employee-cascade.ts` (mirror employee archive/deactivate).

**HR employee creation:** `POST /hr/employees` and ID-document upload require an allowed role (`GROUP_ADMIN`, `CLINIC_ADMIN`, `HR_OFFICER`, `BRANCH_MANAGER`). `CLINIC_ADMIN` may only assign employees to clinics in `ClinicAdminScope`.

**HR lifecycle (implemented):**
```
GET    /hr/employees?archived=true
POST   /hr/employees/:id/deactivate
POST   /hr/employees/:id/reactivate
DELETE /hr/employees/:id          # soft archive (+ linked user); GROUP_ADMIN, BRANCH_MANAGER, CLINIC_ADMIN
POST   /hr/employees/:id/restore
```
- `Employee.recordStatus` (`ACTIVE` | `INACTIVE`), `EmployeeEmploymentPeriod`, `Employee.deletedAt`.
- Deactivate/archive cascades to linked `User`; restore/reactivate clears both sides.
- `EMPLOYEE_MANAGE_ROLES` vs archive roles in `hr.service.ts`; web policy in `employee-manage-policy.ts`.

#### 6.2.18 HealthModule

```
GET    /health/live
GET    /health/ready
GET    /health/info        # version, build SHA, environment
```

Backed by `@nestjs/terminus`. ECS uses `/health/ready` for target group health checks.

## 7. Data Model (Key Tables)

Schema highlights — the full Prisma schema lives in `apps/api/prisma/schema.prisma`. Tenant-owned tables include `tenantId`, `createdAt`, and `updatedAt`. Soft-delete and lifecycle fields vary by entity (`Patient.deletedAt`, `User.deactivatedAt` / `deletedAt`, `Employee.deletedAt`, `Clinic.recordStatus`, etc.).

```prisma
model Tenant {
  id            String   @id @default(cuid())
  name          String
  baseCurrency  String   @default("AED")
  defaultLocale String   @default("en")
  clinics       Clinic[]
  users         User[]
  createdAt     DateTime @default(now())
}

model Clinic {
  id              String   @id @default(cuid())
  tenantId        String
  parentClinicId  String?
  nameEn          String
  nameAr          String
  logoUrl         String?
  country         String
  city            String
  addressEn       String
  addressAr       String
  locationUrl     String
  phone           String
  email           String
  licenseNumber   String
  defaultLanguage Locale   @default(en)
  defaultCurrency String   @default("AED")  // EGP | USD | OMR | SAR | AED
  recordStatus    ClinicRecordStatus @default(ACTIVE)
  disabledAt      DateTime?
  operatingPeriods ClinicOperatingPeriod[]
  specialities    ClinicSpeciality[]       // roadmap
  workingHours    ClinicWorkingHours[]     // roadmap
  parent          Clinic?  @relation("ClinicHierarchy", fields: [parentClinicId], references: [id])
  branches        Clinic[] @relation("ClinicHierarchy")
  tenant          Tenant   @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@index([parentClinicId])
  @@index([tenantId, recordStatus])
}

model ClinicOperatingPeriod {
  id        String   @id @default(cuid())
  clinicId  String
  startDate DateTime @db.Date
  endDate   DateTime? @db.Date
  clinic    Clinic   @relation(...)
}

model Patient {
  id          String   @id @default(cuid())
  tenantId    String
  mrn         String
  firstNameEn String
  lastNameEn  String
  firstNameAr String?
  lastNameAr  String?
  dob         DateTime?   // optional
  gender      Gender
  phone       String      // unique per tenant (application-level, digit-normalized)
  email       String?
  nationalId  String?
  nationalIdDocRelativePath String?
  acquisitionChannel        PatientAcquisitionChannel?
  homeBranchId String?
  deletedAt   DateTime?   // soft delete
  documents   PatientDocument[]
  encounters  Encounter[]
}

model Encounter {
  id          String          @id @default(cuid())
  tenantId    String
  clinicId    String
  patientId   String
  clinicianId String
  status      EncounterStatus @default(DRAFT)
  visitType   String
  chiefComplaint String?
  notes       Json?
  finalizedAt DateTime?
  prescriptions Prescription[]
  vitals      Vital[]
  diagnoses   Diagnosis[]
  procedures  Procedure[]

  @@index([tenantId, clinicId, finalizedAt])
}

model RevenueEntry {
  id              String   @id @default(cuid())
  tenantId        String
  clinicId        String
  category        String   // VISIT | SURGERY | PROCEDURE | MATERIALS | LAB | IMAGING | PHARMACY | PACKAGES | INSURANCE | OTHER
  serviceId       String?
  sourceType      String   // ENCOUNTER | SURGERY | MATERIAL_SALE | LAB_ORDER | ...
  sourceId        String
  grossAmount     Decimal  @db.Decimal(14, 2)
  taxAmount       Decimal  @db.Decimal(14, 2)
  netAmount       Decimal  @db.Decimal(14, 2)
  currency        String
  postedAt        DateTime
  clinicianId     String?
  status          RevenueStatus @default(POSTED)
  adjustments     RevenueAdjustment[]

  @@index([tenantId, clinicId, postedAt])
  @@index([category, postedAt])
}

model Expense {
  id          String   @id @default(cuid())
  tenantId    String
  clinicId    String
  category    String   // SALARIES | MATERIALS | UTILITIES | OTHER
  vendorId    String?
  amount      Decimal  @db.Decimal(14, 2)
  currency    String
  incurredAt  DateTime
  approvedBy  String?
  status      ExpenseStatus @default(PENDING)

  @@index([tenantId, clinicId, incurredAt])
}

model AuditLog {
  id            BigInt   @id @default(autoincrement())
  tenantId      String
  userId        String?
  action        String
  resourceType  String
  resourceId    String
  before        Json?
  after         Json?
  ip            String?
  userAgent     String?
  requestId     String?
  prevHash      String?
  hash          String
  createdAt     DateTime @default(now())

  @@index([tenantId, createdAt])
  @@index([resourceType, resourceId])
}
```

**Indexing strategy:** every analytical query path (revenue by date, expenses by date, encounters by clinic-date) has a supporting composite index. Reporting materialized views own additional indexes appropriate to their access patterns.

**Row-Level Security (roadmap):** PostgreSQL RLS policies (`tenantId = current_setting('app.tenant_id')`) are documented as defense-in-depth but **not enabled** in the current deployment. All tenant isolation is enforced in application code via `requireTenantId` and explicit `where` clauses.

## 8. API Conventions

- **Versioning:** path-based, `/api/v1/...`.
- **Pagination:** offset/page-based for most list endpoints (`page`, `pageSize`, `total`).
- **Errors:** NestJS exceptions + Swagger-documented shapes; RFC 7807 problem+json — partial/roadmap.
- **Idempotency:** `Idempotency-Key` header — roadmap (not implemented globally).
- **OpenAPI:** Swagger at `/api/docs` when `SWAGGER_ENABLED=true` (local/dev); disabled on App Runner prod.
- **Rate Limits:** Redis-backed throttler — roadmap.
- **RBAC list/detail scope (implemented):** `PHYSICIAN` JWTs restrict **encounters** and **appointments** lists and detail/mutation endpoints to rows where `clinicianId` matches the authenticated user; `POST /appointments` rejects a physician attempting to book on behalf of another clinician. `CLINIC_ADMIN` JWTs restrict appointments (and encounters, where applicable) to clinics listed in `ClinicAdminScope`. Web navigation mirrors these capabilities via `apps/web/src/lib/nav-policy.ts` and TanStack Query keys include the viewer identity to avoid cross-user cache bleed on shared browsers.

## 9. Frontend (Web) — `apps/web`

### 9.1 Stack
- React 18, Vite, TypeScript strict mode.
- React Router for routing.
- TanStack Query for server state.
- Zustand for ephemeral client state.
- Tailwind CSS + shadcn/ui + Radix primitives.
- i18next for EN/AR; `dir="rtl"` toggled on `<html>` based on locale.
- Recharts for visualizations.
- Generated typed API client from OpenAPI spec.
- Forms via React Hook Form + Zod (Zod schemas shared with backend).

### 9.2 App Structure
```
apps/web/src/
├── app/                      # router
├── features/                 # feature-sliced pages
│   ├── auth/
│   ├── clinics/
│   ├── patients/             # list, register dialog, detail + clinical docs
│   ├── encounters/
│   ├── appointments/
│   ├── revenue/
│   ├── expenses/
│   ├── reports/
│   ├── hr/
│   ├── admin/                # org patients, users, data explorer, audit
│   └── platform/             # platform super-admin
├── components/               # shared UI (patient-phone-field, clinical docs, …)
├── lib/                      # api-hooks, http, nav-policy, locales
└── stores/
```

### 9.3 RTL Strategy
- All layouts use logical properties (`ms-`, `me-`, `ps-`, `pe-`) via Tailwind's RTL plugin, not `left/right`.
- Charts mirror axes for Arabic where it improves comprehension; numbers stay LTR (industry norm).
- Visual regression tests run in both directions in CI.

### 9.4 Key Screens
- Login (+ MFA when enabled).
- Group Admin: Dashboard, Admin (clinics, settings, org patients/users, data explorer, governance/audit), Reports.
- Branch Manager / Clinic Admin: scoped operations, patient edit/delete, staff onboarding where permitted.
- Clinician: Patient search, **Appointments** (own schedule), Encounter editor (SOAP, vitals, labs/radiology/Rx uploads, meds, finalize), doctor-scoped revenue.
- Reception / Assistant: Patients (register with documents + phone check), appointments, encounters, operations.
- HR: Employees, Attendance, Leave.
- **Patient profile:** demographics, vitals history, encounters, **lab / radiology / prescription / other document** sections with viewer.
- Platform Super Admin: `/platform` — create orgs, clinics, users (no clinical modules).

## 10. Mobile (React Native) — deferred

The RFC originally scoped **Expo/React Native** for v1 clinician flows. That app is **not in this repository**; the responsive web SPA covers current production use. Revisit mobile when patient portal or offline capture becomes a priority.

## 11. Cross-Cutting Concerns

### 11.1 Authorization *(implemented)*

- **`UserRole` enum** on JWT (`PLATFORM_SUPER_ADMIN`, `GROUP_ADMIN`, `GROUP_SUPERVISOR`, `BRANCH_MANAGER`, `CLINIC_ADMIN`, `CLINIC_ASSISTANT`, `PHYSICIAN`, `NURSE`, `RECEPTIONIST`, `CALL_CENTER`, `HR_OFFICER`, `FINANCE_OFFICER`).
- Services enforce rules explicitly (e.g. `PATIENT_DELETE_ROLES`, physician-only encounter lists, clinic scope via `ClinicAdminScope`).
- Web navigation mirrors API scope in `apps/web/src/lib/nav-policy.ts`.
- **Roadmap:** `CaslAbilityFactory`, configurable permission matrix, `@CheckAbility` decorators.

### 11.2 Tenancy *(implemented)*

- `requireTenantId(user)` throws if JWT has no tenant (platform admin cannot call org-scoped patient/encounter APIs without impersonation — not implemented).
- Every tenant-scoped Prisma query includes `tenantId` in `where`.
- Platform routes under `/admin/platform/*` use separate guards for `PLATFORM_SUPER_ADMIN`.
- **Roadmap:** Postgres RLS + `SET app.tenant_id` per connection; tenant impersonation for support.

### 11.3 Logging & Tracing

- **Implemented:** NestJS default logging; App Runner → CloudWatch log group.
- **Roadmap:** Pino JSON logs, OpenTelemetry → Grafana Cloud.

### 11.4 Error Handling

- Global exception filters return HTTP status + message; domain `BadRequestException` / `UnauthorizedException` used throughout.
- **Roadmap:** RFC 7807 filter with redaction policy.

### 11.5 Configuration

- `@nestjs/config` reads `.env` locally; App Runner injects env from CDK (Secrets Manager for `JWT_SECRET`, `DATABASE_URL`).
- Boot fails if required DB/JWT config missing when accessed.

### 11.6 Background Jobs *(roadmap)*

- BullMQ queues (`notifications`, `reports`, `payroll`, …) and a separate worker container were in early RFC drafts.
- **Not deployed:** no ECS worker, no BullMQ consumer in this repo today. Report charts query live data via `ReportsModule`.

## 12. Security

| Control | Status |
|---|---|
| TLS (CloudFront + App Runner) | **Implemented** |
| JWT auth on protected routes | **Implemented** |
| bcrypt password hashing | **Implemented** |
| Secrets in AWS Secrets Manager (JWT, RDS) | **Implemented** (App Runner) |
| RDS storage encryption | **Implemented** (AWS default) |
| Tenant isolation in application layer | **Implemented** |
| S3 uploads via API (presigned/streaming) | **Implemented** |
| MFA, refresh tokens, Argon2id | Roadmap |
| WAF on CloudFront | Roadmap |
| Application-side column encryption (national ID) | Roadmap |
| Malware scan on upload | Roadmap |
| KMS asymmetric JWT signing | Roadmap |

Operational practices: dependency updates via npm; restore drills and pen tests per release policy — not automated in CI beyond `pr-synth-build.yml` synthesis check.

## 13. Project Setup & DevOps

Local and CI/CD paths below reflect **what the repository runs today**. [§14](#14-aws-deployment-architecture-implemented) is the authoritative AWS topology (App Runner, not ECS).

### 13.1 Local Development

```bash
# one-time
npm install
cp apps/api/.env.example apps/api/.env
npm run db:up               # docker compose: postgres + redis
npm run db:setup            # prisma generate, migrate, seed

# every day
npm run dev                 # api :3000 + web :5173 via concurrently
npm run build
npm run lint
```

`docker-compose.yml` provides Postgres 16 and Redis. File uploads default to **`uploads/`** on disk (`UPLOAD_STORAGE` unset or `local`).

### 13.2 Container Image

Multi-stage Dockerfile at **`apps/api/Dockerfile`** (not `infra/docker/`). Used by App Runner and the DbSeed Lambda build. Seed image: `apps/api/Dockerfile.seed`.

On deploy, GitHub Actions builds and pushes to ECR; App Runner pulls by tag (commit SHA / `latest` per workflow).

### 13.3 Infrastructure as Code

Single CDK stack: **`infra/src/kiorly-clinics-management-stack.ts`** (`KiorlyClinicsManagementStack`). No multi-stack ECS/ALB split.

| Resource | Role |
|---|---|
| VPC | Public + isolated DB subnets; **no NAT** |
| RDS PostgreSQL 16 | Private; migrations on App Runner boot or Lambda seed |
| App Runner | Nest API; `PRISMA_MIGRATE_ON_BOOT=true` |
| S3 | Web static assets + API uploads |
| CloudFront | Single HTTPS origin (SPA + `/api/*`) |
| Secrets Manager | JWT + RDS credentials |
| DbSeedFn Lambda | Post-deploy idempotent migrate + seed |

Deploy: `cd infra && npx cdk deploy` or push to **`main`** → `.github/workflows/deploy-aws.yml` (OIDC `AWS_DEPLOY_ROLE_ARN`).

See [`AWS_Cloud_Deployment_Guide.md`](./AWS_Cloud_Deployment_Guide.md) for env vars and troubleshooting.

### 13.4 Database Migrations

- Prisma Migrate in `apps/api/prisma/migrations/`.
- **Local:** `npm run db:setup` / `prisma migrate dev`.
- **AWS:** `PRISMA_MIGRATE_ON_BOOT=true` on App Runner; Lambda seed runs `migrate deploy` + seed after deploy.

### 13.5 Configuration & Secrets

- Local: `apps/api/.env` (`DATABASE_URL`, `JWT_SECRET`, optional `UPLOAD_STORAGE`, `AWS_*` for S3 dev).
- AWS: CDK injects secrets from Secrets Manager into App Runner; web build gets API URL at deploy time.

### 13.6 Observability

- App Runner logs → CloudWatch.
- **Roadmap:** Grafana Cloud, OTel, WAF alarms, Slack deploy notifications.

### 13.7 Alternative architectures (not checked in)

ECS Fargate + ALB + ElastiCache + separate worker service, Lightsail single VM, and multi-environment CDK apps (`dev`/`staging`/`prod` stacks) remain valid options documented in early drafts and the AWS guide — they are **not** what `deploy-aws.yml` deploys by default.

## 14. AWS Deployment Architecture (implemented)

> **Operational guide:** Step-by-step checklist, env vars, and troubleshooting: [`Docs/AWS_Cloud_Deployment_Guide.md`](./AWS_Cloud_Deployment_Guide.md).

The **`infra/`** CDK stack (`KiorlyClinicsManagementStack`) deploys to **`eu-central-1`** (Frankfurt) by default. GitHub Actions workflow **`.github/workflows/deploy-aws.yml`** runs on push to **`main`** (OIDC role `AWS_DEPLOY_ROLE_ARN`).

```
                         Route 53 (optional custom domain)
                                    │
                                    ▼
                           CloudFront Distribution
                    ┌───────────────┴────────────────┐
                    │                                │
             S3 (web SPA)                    /api/* behavior
         + viewer-request fn                  HTTPS to App Runner
         (SPA deep links)                         │
                    │                              ▼
                    │                    App Runner (Nest API)
                    │                    VPC connector → RDS
                    │                    S3 uploads bucket
                    └──────── same AppUrl ─────────┘

Post-deploy: Lambda DbSeedFn (idempotent demo seed on RDS)
```

**Stack contents (summary):**
| Resource | Role |
|----------|------|
| VPC | Public + isolated DB subnets; **no NAT** (cost control) |
| RDS PostgreSQL 16 | Private; `db.t4g.micro`; 7-day backups |
| App Runner | API container from `apps/api/Dockerfile`; health `/api/v1/health/live` |
| S3 | Web static assets + **API uploads** (`UPLOAD_STORAGE=s3`) |
| CloudFront | One HTTPS URL for SPA and `/api/*` (avoids CORS split-brain) |
| Secrets Manager | JWT + RDS credentials |
| VPC endpoints | Secrets Manager, KMS, STS for connector/Lambda without NAT |
| DbSeedFn | Docker Lambda runs `prisma migrate deploy` + idempotent seed after deploy |

**Runtime flags (App Runner):** `PRISMA_MIGRATE_ON_BOOT=true`, `PRISMA_SEED_ON_BOOT=false` (seed via Lambda), `SWAGGER_ENABLED=false`, `TZ=Europe/Berlin`.

**Alternative architectures** (ECS Fargate + ALB, Lightsail single VM) remain valid for teams who prefer them; they are **not** what the checked-in CDK stack deploys today.

**Disaster recovery:** RDS automated backups (7 days in current stack); cross-region replication and multi-AZ are upgrade paths documented in the PRD NFRs.

## 15. CI/CD (GitHub Actions)

Workflows in `.github/workflows/`:

| Workflow | Trigger | Purpose |
|---|---|---|
| `deploy-aws.yml` | Push to `main` (and manual `workflow_dispatch`) | Build API Docker image → ECR; build web → S3; `cdk deploy`; invoke DbSeed Lambda |
| `pr-synth-build.yml` | Pull requests | CDK synth + build smoke (no AWS deploy) |

Authentication to AWS uses **GitHub OIDC** (`AWS_DEPLOY_ROLE_ARN` secret). There is no separate `ci.yml`, `e2e.yml`, or multi-env promote pipeline in this repo yet — add before hardening production release gates.

## 16. Environments

| Env | Purpose | How |
|---|---|---|
| `local` | Developer machines | Docker Postgres + `npm run dev` |
| `aws` (single stack) | Shared demo/production target | CDK deploy to `eu-central-1`; one CloudFront URL |

**Roadmap:** named `dev` / `staging` / `prod` stacks, PR preview environments, anonymized staging snapshots.

## 17. Testing Strategy

- **Unit / integration tests:** Jest in `apps/api` (run via root `npm test` where configured).
- **Web:** Vite build + TypeScript check in CI synth workflow.
- **E2E (Playwright), load tests (k6), mobile E2E:** roadmap — not wired in default GitHub Actions.
- **Migration tests:** manual/PR review; run `prisma migrate deploy` against local Docker before merge.

## 18. Seed & Reference Data

The demo tenant in `apps/api/prisma/seed.ts` creates named accounts (e.g. `admin@kiorly.com`, `physician@kiorly.com`, `doctor2@kiorly.com`, `clinicadmin@kiorly.com`, `assistant@kiorly.com`, `nurse@kiorly.com`, `receptionist@kiorly.com`, `finance@kiorly.com`, `branchmgr@kiorly.com`) with a shared password documented in the repository **README** — use these for manual QA of role-specific navigation and API scope.

Shipped as code under `apps/api/prisma/seed.ts` (and related seed helpers):

- Demo tenants (multi-tenant on one DB), clinics, users per role — see [`Test_Data_Users.md`](./Test_Data_Users.md).
- Default revenue/expense categories, visit fees, sample patients/encounters where applicable.

Seed runs locally via `npm run db:setup` and on AWS via **DbSeedFn** Lambda after deploy (`PRISMA_SEED_ON_BOOT=false` on App Runner to avoid double-seed).

**Roadmap seed catalogs:** full ICD-10/CPT subsets, speciality master list, default i18n bundles in DB.

## 19. Risks & Tradeoffs

| Decision | Tradeoff |
|---|---|
| Modular monolith over microservices | Simpler deploy now; module folders preserve extraction path |
| Prisma over raw SQL | DX and migrations; hot paths can use `$queryRaw` |
| Live queries for reports (no MV yet) | Always fresh; may need materialized views or warehouse at scale |
| App Runner over ECS Fargate | Less ops surface; fewer knobs for custom networking |
| Shared-schema multi-tenancy | Cost-efficient SaaS; requires disciplined `tenantId` filtering (RLS optional later) |
| bcrypt + symmetric JWT (v1) | Fast to ship; upgrade path to Argon2id + asymmetric keys |
| Bilingual web from day one | Upfront i18n cost; avoids Arabic retrofit |
| Single CloudFront origin | No CORS split-brain; simpler client config |

## 20. Decisions & open questions

### 20.1 Resolved

| Question | Decision |
|---|---|
| Single-tenant per clinic group vs multi-tenant SaaS? | **Multi-tenant SaaS** on shared RDS; dedicated stack optional for enterprise. See PRD §3.4 and RFC §5.1. |
| Primary AWS compute pattern? | **App Runner + CloudFront + S3 + RDS** (`KiorlyClinicsManagementStack`). |

### 20.2 Open

1. Do we need patient-facing access (portal/app) in v1.5 or v2?
2. Which insurance providers are in scope for direct integration?
3. National drug registry source per launch market?
4. Will reporting cohorts require a warehouse (Redshift/Snowflake) or are live queries + materialized views sufficient?
5. Do we need offline-capable mobile for low-connectivity branches?
6. Multi-region active-active or active-passive for prod?
7. When to enable Postgres RLS as defense-in-depth?

## 21. Glossary

- **Tenant** — Clinic group organization; all business rows scoped by `tenantId`.
- **Multi-tenant SaaS** — One deployment serving many tenants on shared infrastructure.
- **Platform Super Admin** — Vendor operator with `tenantId: null` provisioning organizations.
- **Modular Monolith** — Single deployable NestJS app with bounded modules.
- **RLS** — PostgreSQL Row-Level Security (planned, not enabled).
- **App Runner** — AWS managed container service used for the API in production.
- **OIDC** — OpenID Connect; used for GitHub Actions → AWS deploy role.
- **EAS** — Expo Application Services (mobile roadmap).