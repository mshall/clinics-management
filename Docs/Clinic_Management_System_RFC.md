# Technical RFC
## Clinic Management System (CMS) — Architecture & Implementation

| Field | Value |
|---|---|
| **Document Title** | Clinic Management System – Technical RFC |
| **Version** | 1.1 |
| **Status** | Living document (aligned with `main` as of June 2026) |
| **Related** | Clinic Management System PRD v1.1 |
| **Last Updated** | June 2026 |

---

## 1. Overview

This RFC describes the technical architecture and implementation plan for the Clinic Management System (CMS) defined in the PRD. The platform is a multi-tenant, multi-branch SaaS for clinic groups, with EHR, prescriptions, expenses, HR, bilingual UI, and a parent/sub-clinic governance model.

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
| Auth | JWT (short-lived) + refresh tokens, optional OIDC SSO | Stateless API auth; SSO for enterprise tenants |
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

```
            ┌────────────────────────────────────────────┐
            │                CloudFront (CDN)            │
            └──────────────┬───────────────┬─────────────┘
                           │               │
                  ┌────────▼────┐    ┌─────▼────────┐
                  │  S3 (web)   │    │  ALB → ECS   │
                  │  static UI  │    │  Fargate API │
                  └─────────────┘    └──────┬───────┘
                                            │
                ┌──────────────┬────────────┼─────────────┬────────────┐
                │              │            │             │            │
        ┌───────▼─────┐ ┌──────▼────┐ ┌─────▼─────┐ ┌─────▼─────┐ ┌────▼──────┐
        │ RDS (Postgres)│ ElastiCache │   S3      │   SES/SNS │ Secrets    │
        │  Multi-AZ    │ │  Redis    │ │ Files    │ │  Notif   │ │ Manager   │
        └──────────────┘ └───────────┘ └──────────┘ └──────────┘ └───────────┘

        Mobile (RN/Expo) ─────► CloudFront (API) ─► ALB ─► ECS Fargate
```

The API is a single NestJS process that exposes REST + OpenAPI. Background jobs run as a separate ECS service from the same image (different start command), consuming BullMQ queues backed by Redis.

## 6. Backend Module Catalog

NestJS modules map 1:1 to product concerns. Each module owns its entities, services, controllers, DTOs, and migrations. Cross-module access is only allowed through public service interfaces — enforced by `eslint-plugin-boundaries`.

### 6.1 Module Map

| # | Module | Responsibility |
|---|---|---|
| 1 | `IdentityModule` | Authentication, tokens, sessions, MFA, password policies, SSO |
| 2 | `TenancyModule` | Tenants (clinic groups), parent clinics, branches, onboarding |
| 3 | `UsersModule` | Users, roles, permissions (RBAC) |
| 4 | `PatientsModule` | Patient demographics, consent, group-level identity |
| 5 | `EhrModule` | Encounters, vitals, diagnoses, procedures, attachments |
| 6 | `PrescriptionsModule` | Drug catalog, prescriptions, interaction checks |
| 7 | `SchedulingModule` | Working hours, appointments, slots |
| 8 | `ExpensesModule` | Expense entries, categories, vendors |
| 9 | `RevenueModule` | All income streams: visits, surgeries, materials, procedures |
| 10 | `HrModule` | Employees, attendance, leave, payroll inputs |
| 11 | `BillingModule` | Invoices, payments (light v1) |
| 12 | `ReportingModule` | Income vs expenses, growth charts, operational dashboards, exports |
| 13 | `LocalizationModule` | Translation keys, locale resolution |
| 14 | `NotificationsModule` | Email, SMS, in-app, expiring license alerts |
| 15 | `FilesModule` | S3 uploads, presigned URLs, AV scanning hook |
| 16 | `AuditModule` | Append-only audit log, change-data capture |
| 17 | `AdminModule` | Group admin operations, tenant provisioning |
| 18 | `HealthModule` | Liveness, readiness, build info |

### 6.2 Module Specifications

Each module spec below lists primary entities, key endpoints (illustrative, not exhaustive), and notable design notes.

#### 6.2.1 IdentityModule

**Entities:** `User` (shared with UsersModule), `RefreshToken`, `MfaSecret`, `LoginAttempt`.

**Endpoints:**
```
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout
POST   /auth/mfa/enroll
POST   /auth/mfa/verify
POST   /auth/password/reset/request
POST   /auth/password/reset/confirm
GET    /auth/me
```

**Notes:**
- Argon2id for password hashing.
- Access token TTL 15 min; refresh token TTL 30 days, rotated on use, stored hashed.
- MFA via TOTP; required for Group Admins and Finance Officers.
- Optional OIDC SSO per tenant, configured by Group Admin.
- Brute-force protection via Redis-backed rate limiter (`ThrottlerGuard`).

#### 6.2.2 TenancyModule

**Entities:** `Tenant` (clinic group), `Clinic` (parent or branch), `ClinicSpeciality`, `ClinicWorkingHours`.

**Key fields on `Clinic`:** `nameEn`, `nameAr`, `logoUrl`, `country`, `city`, `addressEn`, `addressAr`, `locationUrl`, `phone`, `email`, `licenseNumber`, `parentClinicId` (nullable), `defaultLanguage`, `tenantId`.

**Endpoints:**
```
POST   /admin/tenants                  # provision a new clinic group
POST   /clinics                        # add parent clinic
POST   /clinics/:id/branches           # add sister/sub clinic
GET    /clinics                        # list within tenant
GET    /clinics/:id
PATCH  /clinics/:id
POST   /clinics/:id/logo               # upload logo (returns presigned URL)
```

**Notes:**
- Multi-tenancy is **shared database, shared schema, tenant_id on every row** with row-level security policies in PostgreSQL as a defense in depth.
- Hierarchy modeled with self-referential `parentClinicId`. Branch tree depth capped (e.g., 2) to keep reporting predictable.
- Specialities reference a `SpecialityCatalog` (seeded master list).

#### 6.2.3 UsersModule

**Entities:** `User`, `Role`, `Permission`, `UserClinicRole` (a user can hold different roles at different clinics).

**Endpoints:**
```
POST   /users                          # invite user
GET    /users
PATCH  /users/:id
POST   /users/:id/clinics/:clinicId/roles
DELETE /users/:id/clinics/:clinicId/roles/:roleId
GET    /roles
POST   /roles                          # custom role
```

**Notes:**
- Permissions are matrix-based: `(resource, action)` pairs (e.g., `prescription:create`, `expense:approve`).
- Authorization implemented as a NestJS `CaslAbilityFactory` integrated with `@Casl/ability` for declarative checks.

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
GET    /patients/:id/clinical-documents  # labs, radiology, prescriptions, other
POST   /patients/:id/documents           # multipart: file + description (category label)
GET    /patients/:id/documents/:documentId
POST   /patients/:id/national-id-document
GET    /patients/:id/national-id-document
```

**Notes:**
- Patients are **tenant-scoped**. `mrn` and `nationalId` are unique per tenant when set; **phone** is unique per tenant via normalized digit comparison (enforced on create/update and exposed through `phone-conflict`).
- `dob` is optional. Arabic first/last names required at registration in the current UI.
- Registration documents store a **description** (localized category label or free text for “Other”); clinical sections classify by that label plus encounter `EncounterDocument.kind` (`LAB`, `RADIOLOGY`, `PRESCRIPTION`).
- Soft-delete via `deletedAt`; bulk delete for org administrators and clinic staff roles listed in `PATIENT_DELETE_ROLES`.
- Cross-branch encounter documents on the profile respect the same physician/clinic scope as encounter lists.

#### 6.2.5 EhrModule

**Entities:** `Encounter`, `Vital`, `Diagnosis` (ICD-10), `Procedure` (CPT), `Attachment`, `EncounterAmendment`.

**Endpoints:**
```
POST   /encounters
GET    /encounters/:id
PATCH  /encounters/:id                 # while in DRAFT
POST   /encounters/:id/finalize
POST   /encounters/:id/amend           # post-finalize, with reason
POST   /encounters/:id/vitals
POST   /encounters/:id/attachments
```

**Notes:**
- Encounters have a status machine: `DRAFT → FINALIZED → AMENDED`.
- Finalization requires authenticated clinician (re-prompt password or step-up MFA for high-risk actions).
- Amendments do not destroy data; they append a new revision and link to the prior one.
- ICD-10 and CPT catalogs ship as seed data; updateable per tenant.

#### 6.2.6 PrescriptionsModule

**Entities:** `Drug` (catalog), `Prescription`, `PrescriptionItem`, `InteractionRule`, `AllergyAlert`.

**Endpoints:**
```
GET    /drugs?search=...
POST   /encounters/:id/prescriptions
GET    /patients/:id/prescriptions
POST   /prescriptions/:id/discontinue
GET    /prescriptions/:id/pdf          # bilingual PDF
```

**Notes:**
- Drug–allergy and basic drug–drug interaction checks run server-side at create time and surface warnings with override + reason.
- Bilingual PDF generated via a `PdfRenderer` service using Handlebars templates with RTL-aware layout.
- v2: integrate with national drug registries.

#### 6.2.7 SchedulingModule

**Entities:** `WorkingHours`, `Appointment`, `Slot`.

**Endpoints:**
```
GET    /clinics/:id/availability
POST   /appointments
PATCH  /appointments/:id
POST   /appointments/:id/cancel
```

**Notes:**
- Booking guarded by a Postgres advisory lock on `(clinicId, clinicianId, slotStart)` to prevent double-booking under concurrency.

#### 6.2.8 ExpensesModule

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

**Entities:** `AuditLog` (append-only, partitioned by month).

**Captured for every mutation:** `tenantId`, `userId`, `clinicId`, `action`, `resourceType`, `resourceId`, `before` (JSON), `after` (JSON), `ip`, `userAgent`, `requestId`, `timestamp`.

**Notes:**
- Implemented as a NestJS interceptor + Prisma middleware. No module needs to remember to log — it's automatic.
- Tamper-evidence: each row's hash chains to the previous row's hash within the partition.
- Immutable from the application; only platform admins with break-glass access can read raw partitions.

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

**HR employee creation:** `POST /hr/employees` and ID-document upload require an allowed role (`GROUP_ADMIN`, `CLINIC_ADMIN`, `HR_OFFICER`, `BRANCH_MANAGER`). `CLINIC_ADMIN` may only assign employees to clinics in `ClinicAdminScope`.

**Reports (live charts):** `GET /reports/monthly-series?months=N` returns per-calendar-month aggregates: finalized encounter counts (`finalizedAt` in month), sum of **posted** revenue (`postedAt` in month), and new patients (`createdAt` in month). Physicians receive the same shape scoped to their encounters/revenue rows only.

#### 6.2.18 HealthModule

```
GET    /health/live
GET    /health/ready
GET    /health/info        # version, build SHA, environment
```

Backed by `@nestjs/terminus`. ECS uses `/health/ready` for target group health checks.

## 7. Data Model (Key Tables)

Schema highlights — the full Prisma schema lives in `apps/api/prisma/schema.prisma`. Every business table includes `tenantId`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`, and a soft-delete `deletedAt`.

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
  specialities    ClinicSpeciality[]
  workingHours    ClinicWorkingHours[]
  parent          Clinic?  @relation("ClinicHierarchy", fields: [parentClinicId], references: [id])
  branches        Clinic[] @relation("ClinicHierarchy")
  tenant          Tenant   @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@index([parentClinicId])
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

**Row-Level Security:** PostgreSQL RLS policies enforce `tenantId = current_setting('app.tenant_id')::text` on all tables. Connection middleware sets the GUC at the start of each request from the validated JWT.

## 8. API Conventions

- **Versioning:** path-based, `/api/v1/...`.
- **Pagination:** cursor-based for lists (`?cursor=&limit=`), with `nextCursor` in response.
- **Filtering:** explicit query params, never opaque expression languages.
- **Errors:** RFC 7807 `application/problem+json` with `code`, `title`, `detail`, `traceId`.
- **Idempotency:** all unsafe POSTs accept an `Idempotency-Key` header; results cached for 24h in Redis.
- **OpenAPI:** auto-generated from NestJS decorators; published as a static asset and consumed by frontends to generate typed clients (`openapi-typescript-codegen`).
- **Rate Limits:** per-IP and per-user, enforced by Redis-backed throttler.
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

### 11.1 Authorization
- `CaslAbilityFactory` builds an ability set from `(role × clinicId)` assignments per request.
- Controllers use `@CheckAbility(action, subject)` decorator; service layer re-checks for defense in depth.

### 11.2 Tenancy
- Single-line tenant guard sets `tenantId` from JWT into `AsyncLocalStorage`; every Prisma query goes through middleware that injects it as a `where` clause + sets the Postgres GUC for RLS.

### 11.3 Logging & Tracing
- Pino for structured logs (JSON), one line per request with traceId.
- OpenTelemetry SDK auto-instruments HTTP, Prisma, Redis, BullMQ.
- Exporter to OTLP → Grafana Cloud (logs, metrics, traces unified).

### 11.4 Error Handling
- Global `HttpExceptionFilter` produces RFC 7807 responses, redacts internals, logs with traceId.
- Domain errors use typed error classes that map to HTTP statuses centrally.

### 11.5 Configuration
- `@nestjs/config` with Zod-validated schema; refuses to boot on missing/invalid config.
- All secrets pulled from AWS Secrets Manager at boot via a small loader.

### 11.6 Background Jobs
- BullMQ queues: `notifications`, `reports`, `payroll`, `revenue-postings`, `audit-archive`, `expiry-checks`.
- Same Docker image, different `CMD` (`node dist/worker.js`), separate ECS service with its own scaling rules.

## 12. Security

- TLS terminated at CloudFront and ALB; HSTS preloaded.
- WAF in front of CloudFront and ALB with managed rules + custom rate-based rules.
- Argon2id for passwords; MFA TOTP for privileged roles.
- JWT signed with rotating asymmetric keys (KMS-managed).
- All PII fields encrypted at rest by RDS storage encryption; sensitive columns (national ID, MRN) additionally encrypted application-side using KMS envelope encryption.
- File uploads scanned for malware before being marked READY.
- Quarterly dependency audits via `pnpm audit` and Snyk in CI.
- Secret scanning in CI (Gitleaks).
- Penetration testing scheduled before each major release.
- Backups encrypted; restore drills quarterly.

## 13. Project Setup & DevOps Module

This module is a first-class part of the codebase: `infra/` is reviewed, tested, and shipped with the same rigor as application code. Goal: any engineer can stand up a complete environment with one command, and any release goes out with one click.

### 13.1 Local Development

```bash
# one-time
npm install
cp apps/api/.env.example apps/api/.env
npm run db:up               # docker compose: postgres + redis
npm run db:setup            # prisma generate, migrate, seed

# every day
npm run dev                 # api + web concurrently
npm run build
npm run lint
```

`docker-compose.yml` provides Postgres 16 and Redis locally. File uploads default to **`uploads/`** on disk (`UPLOAD_STORAGE` unset or `local`).

### 13.2 Container Image

A single multi-stage Dockerfile at `infra/docker/api.Dockerfile` produces one image used for both the API and the worker. Stages:

1. **deps** — `pnpm install --frozen-lockfile`.
2. **build** — `pnpm turbo run build --filter=api`.
3. **runtime** — distroless Node 20, non-root user, only `dist/` and `node_modules`.

Image is tagged with the commit SHA and pushed to Amazon ECR.

### 13.3 Infrastructure as Code (AWS CDK, TypeScript)

`infra/cdk/` contains the entire AWS topology. Stacks:

| Stack | Contents |
|---|---|
| `NetworkStack` | VPC, public/private subnets across 2 AZs, NAT, security groups |
| `DataStack` | RDS Postgres (Multi-AZ), ElastiCache Redis, S3 buckets (files, web, logs), KMS keys |
| `ApiStack` | ECR repository, ECS cluster, Fargate service for API, Fargate service for worker, ALB, target groups, autoscaling |
| `WebStack` | S3 bucket for built web assets, CloudFront distribution, ACM cert, Route 53 record |
| `EdgeStack` | CloudFront for API, WAF Web ACL, custom domain |
| `ObservabilityStack` | Log groups, CloudWatch alarms, SNS topic for paging, OTel collector config |
| `SecretsStack` | Secrets Manager entries provisioned (values populated out of band) |
| `CiStack` | OIDC provider for GitHub Actions, deployment IAM role |

Each environment (`dev`, `staging`, `prod`) is a CDK app context. A pull-request preview environment is a parameterized mini-stack reusing `dev`'s shared resources where safe.

### 13.4 One-Command Deploy

```bash
# initial bootstrap (one-time per AWS account/region)
pnpm cdk:bootstrap

# any time
pnpm deploy:dev          # builds, pushes image, runs migrations, deploys all stacks
pnpm deploy:staging
pnpm deploy:prod         # gated by manual approval in CI
```

Under the hood, `pnpm deploy:<env>`:
1. Runs unit + integration tests.
2. Builds the Docker image and pushes to ECR with the commit SHA tag.
3. Runs `prisma migrate deploy` against the target DB via a one-shot ECS task with VPC access (no DB exposure to the public internet).
4. Deploys the CDK stacks; ECS performs a rolling blue/green via CodeDeploy.
5. Invalidates CloudFront for the web bucket.
6. Posts release notes + Grafana dashboard link to Slack.

### 13.5 Database Migrations
- Authored with Prisma Migrate, reviewed in PR.
- Forward-only migrations; rollbacks via compensating migrations.
- Pre-deploy migration step uses an ECS one-shot task; the API service is only updated after migrations succeed.

### 13.6 Configuration & Secrets
- Non-secret config in SSM Parameter Store, namespaced `/cms/<env>/<key>`.
- Secrets in Secrets Manager, namespaced `/cms/<env>/secret/<key>`.
- ECS task definition pulls both at startup; no secrets in environment variables in plain text.

### 13.7 Observability
- Container logs → CloudWatch → forwarded to Grafana Cloud Logs.
- Metrics via OpenTelemetry → OTLP → Grafana Cloud Metrics + Prometheus.
- Traces via OTLP → Grafana Tempo.
- Default dashboards provisioned as code (`infra/observability/dashboards/*.json`).
- Alerts: 5xx rate > 1%, p95 latency > 1s, DB CPU > 80%, queue depth > threshold, deploy failure.

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

| Workflow | Trigger | Steps |
|---|---|---|
| `ci.yml` | PR | install, lint, type-check, unit + integration tests, build all apps |
| `e2e.yml` | PR (label `run-e2e`) | spin up ephemeral env, run Playwright suite |
| `deploy-dev.yml` | push to `main` | build image, push to ECR, run migrations, deploy `dev` stacks |
| `deploy-staging.yml` | manual | promote a `dev` image SHA to `staging` |
| `deploy-prod.yml` | manual + approval | promote `staging` image SHA to `prod`, blue/green |
| `nightly.yml` | cron | dependency scan, Snyk, container scan, secret scan |

Authentication to AWS uses **GitHub OIDC** — no long-lived access keys.

## 16. Environments

| Env | Purpose | Data | Access |
|---|---|---|---|
| `local` | Developer machines | Synthetic seed | Engineer |
| `dev` | Continuous integration target | Synthetic, refreshed weekly | All engineers |
| `staging` | Pre-prod validation, demos | Anonymized prod snapshot (quarterly) | Engineers + product + design |
| `prod` | Real customers | Real data | Operations + on-call |
| `pr-<id>` | Per-PR preview | Synthetic | PR author + reviewers |

## 17. Testing Strategy

- **Unit tests** (Jest): every service, every domain rule, every reducer. Target 80%+ on critical modules (Identity, Tenancy, EHR, Revenue, Reporting).
- **Integration tests** (Jest + Testcontainers): controllers against a real Postgres + Redis. Target every endpoint.
- **Contract tests:** OpenAPI schema diff in CI; breaking changes blocked unless versioned.
- **E2E tests** (Playwright): top user journeys on the web app — login, add branch, create patient, write prescription, view report.
- **Mobile E2E** (Detox or Maestro): critical clinician flows.
- **Load tests** (k6): pre-release smoke against staging — auth, encounter create, report fetch.
- **Migration tests:** every migration runs forward and is verified against a snapshot of the prior schema.

## 18. Seed & Reference Data

The demo tenant in `apps/api/prisma/seed.ts` creates named accounts (e.g. `admin@kiorly.com`, `physician@kiorly.com`, `doctor2@kiorly.com`, `clinicadmin@kiorly.com`, `assistant@kiorly.com`, `nurse@kiorly.com`, `receptionist@kiorly.com`, `finance@kiorly.com`, `branchmgr@kiorly.com`) with a shared password documented in the repository **README** — use these for manual QA of role-specific navigation and API scope.

Shipped as code under `apps/api/prisma/seed/`:
- ICD-10 (subset by speciality, configurable).
- CPT (subset).
- Speciality catalog (GP, Pediatrics, Dermatology, Dentistry, Cardiology, etc.).
- Default revenue and expense categories.
- Default service catalog with placeholder pricing per speciality.
- Default roles and permissions.
- Default i18n bundles (EN/AR).

Seed runs on `dev` and on first boot of a new tenant.

## 19. Risks & Tradeoffs

| Decision | Tradeoff |
|---|---|
| Modular monolith over microservices | Slightly less independent scaling now, vastly less operational overhead — extraction path preserved |
| Prisma over TypeORM | Better DX, slightly less control on advanced SQL — mitigated by `$queryRaw` for hot paths |
| Materialized views for reporting | Slight staleness, dramatically simpler than a separate warehouse for v1 |
| Single image for API + worker | Slightly larger image, much simpler deploy story |
| ECS Fargate over EKS | Less flexibility, much less operational burden |
| Shared-schema multi-tenancy | Cheaper, requires disciplined RLS — defense in depth applied |
| Bilingual from day one | Initial overhead, avoids painful retrofit |

## 20. Open Questions

1. Do we need patient-facing access (portal/app) in v1.5 or v2?
2. Which insurance providers are in scope for direct integration?
3. National drug registry source per launch market?
4. Will reporting cohorts ever require a true warehouse (Redshift/Snowflake) or are materialized views sufficient long-term?
5. Do we need offline-capable mobile for low-connectivity branches?
6. Multi-region active-active or active-passive for prod?

## 21. Glossary

- **Modular Monolith** — A single deployable application internally partitioned into strictly separated modules.
- **RLS** — PostgreSQL Row-Level Security.
- **OIDC** — OpenID Connect, used here for both SSO and GitHub-to-AWS auth.
- **OTel** — OpenTelemetry, vendor-neutral observability standard.
- **EAS** — Expo Application Services, for building and shipping React Native apps.
- **MV** — Materialized View, a precomputed query result stored as a table.