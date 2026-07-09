# Documentation index

Reference material for the **Kiorly Clinics Management** platform (monorepo root: [`README.md`](../README.md)).

---

## Quick links

| Document | Purpose |
|----------|---------|
| [**Test_Data_Users.md**](./Test_Data_Users.md) | Demo logins, passwords, roles, QA scenarios, org user counts |
| [**Clinic_Management_System_PRD.md**](./Clinic_Management_System_PRD.md) | Product requirements and feature scope |
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

---

## Source of truth in code

| Topic | Location |
|-------|----------|
| Seed users & roles | `apps/api/prisma/seed.ts` |
| RBAC / nav tabs | `apps/web/src/lib/nav-policy.ts` |
| API admin users | `apps/api/src/admin/admin.service.ts` |
| Web org users UI | `apps/web/src/features/admin/admin-org-users-panel.tsx` |
