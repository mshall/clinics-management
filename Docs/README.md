# Documentation index

Reference material for the **Kiorly Clinics Management** platform (monorepo root: [`README.md`](../README.md)).

**Doc set version:** PRD **v1.5** · RFC **v1.4** (aligned with `main`, July 2026).

---

## Quick links

| Document | Purpose |
|----------|---------|
| [**Test_Data_Users.md**](./Test_Data_Users.md) | Demo logins, passwords, roles, QA scenarios, org user counts |
| [**Clinic_Management_System_PRD.md**](./Clinic_Management_System_PRD.md) | Product requirements, shipped scope, and **production feature backlog** (§12.3) |
| [**Clinic_Management_System_RFC.md**](./Clinic_Management_System_RFC.md) | Technical RFC — API behaviour, RBAC, data model notes |
| [**AWS_Cloud_Deployment_Guide.md**](./AWS_Cloud_Deployment_Guide.md) | RDS, App Runner, CloudFront, CI/CD deploy, post-deploy seed |

---

## Test & demo accounts

See **[Test_Data_Users.md](./Test_Data_Users.md)** for:

- Password **`demo`** on all seeded accounts
- **Dr Ahmed Shall Group** — 30 organization users (6 org-wide + 24 clinic staff)
- **Kiorly Clinic Group (Demo)** — group admin, finance, HR, clinical, and clinic-scoped roles
- **Platform super admin** — `superadmin@kiorly.com` (no tenant)
- Quick test matrix (patients, encounters, reports, admin, HR, profile picture, etc.)

**Load seed (local):** from repo root — `npm run db:setup -w api`

**Live AWS demo:** URL and deploy notes are in [Test_Data_Users.md](./Test_Data_Users.md) and [AWS_Cloud_Deployment_Guide.md](./AWS_Cloud_Deployment_Guide.md).

---

## Administration (group admin)

When signed in as **Group admin** (e.g. `admin@drahmedshall.com` or `admin@kiorly.com`):

| Area | Path | Notes |
|------|------|-------|
| Organization users | **Admin → Organization users** | Search by email or display name; **filter by role**; create/edit/delete users; bulk delete |
| Organization patients | **Admin → Organization patients** | Search, bulk delete |
| Clinics & tenants | **Admin → Clinics & tenants** | Parent/branch clinics |
| Organization & settings | **Admin → Organization & settings** | Default visit fee, feature flags, staff onboarding |
| Governance & audit | **Admin → Governance** | Audit trail |

**Organization users API:** `GET /api/v1/admin/users?page=&pageSize=&q=&role=` — `q` matches email or display name; `role` is a `UserRole` enum value (e.g. `GROUP_SUPERVISOR`, `NURSE`).

**Profile picture:** any logged-in user → **Profile** → camera icon on avatar → crop and upload (`POST /api/v1/auth/me/avatar`).

**HR employee profile:** **HR → Employees** → row → **Employee profile** for a person-centric view (linked login avatar when available).

**HR lifecycle:** HR officers can **deactivate** and **re-hire** employees (re-hire date dialog, employment period history). **Permanent delete** is limited to **Group admin**, **Branch manager**, and **Clinic admin** — not HR officer alone.

---

## Multi-currency (clinic fees)

Supported currencies: **EGP**, **USD**, **OMR**, **SAR**, **AED**.

| Setting | Where | Effect |
|---------|-------|--------|
| **Clinic default currency** | Admin / clinic create & edit (`defaultCurrency`) | Visit fees, expense defaults, operation defaults |
| **Operation payment currency** | Operations create & edit (`feeCurrency`) | Per-procedure override when patient pays in another currency |
| **Expense currency** | Expenses create form | Defaults to clinic currency; optional override |

Amount labels and formatted values use the clinic or selected currency across encounters, operations, and expenses (`apps/web/src/lib/money-display.ts`).

---

## Operations (edit parity)

Scheduled operations open an **edit dialog** that mirrors the **create** form: fieldset sections (When & where, Patient & doctor, Cost & payment, Comments, Documents, Medications), two-column layout on desktop, scrollable body with sticky actions on mobile. Completed operations support admin correction of fees and assignment (`PATCH /operations/:id`).

---

## Source of truth in code

| Topic | Location |
|-------|----------|
| Seed users & roles | `apps/api/prisma/seed.ts` |
| RBAC / nav tabs | `apps/web/src/lib/nav-policy.ts` |
| API admin users | `apps/api/src/admin/admin.service.ts` |
| Web org users UI | `apps/web/src/features/admin/admin-org-users-panel.tsx` |
| Supported currencies | `apps/api/src/common/base-currencies.ts`, `apps/web/src/lib/base-currencies.ts` |
| Clinic / fee currency resolution | `apps/api/src/common/clinic-currency.ts`, `apps/web/src/lib/money-display.ts` |
| HR deactivate / re-hire / delete policy | `apps/api/src/hr/hr.service.ts`, `apps/web/src/lib/employee-manage-policy.ts` |
| Operations UI | `apps/web/src/features/operations/operations-page.tsx` |
