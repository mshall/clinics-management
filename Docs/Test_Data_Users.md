# Test data — users & access

Reference for QA, demos, and onboarding. All seeded accounts use password **`demo`** unless noted.

**Load data (local):** from the repo root run `npm run db:setup -w api` (migrations + seed).

**Load data (AWS):** each successful [Deploy to AWS](https://github.com/mshall/clinics-management/actions/workflows/deploy-aws.yml) run invokes the **DbSeedFn** Lambda (`scripts/cicd-post-deploy-seed.sh`) after CDK deploy. It runs `prisma migrate deploy`, repairs enum values if needed, then the **idempotent** seed — safe on non-empty RDS.

**Live demo (AWS):** [https://d92iz83i79c05.cloudfront.net](https://d92iz83i79c05.cloudfront.net) — sign in with any account below (password **`demo`**). Uses **CloudFront** for SPA + `/api/*` to **App Runner** (see [`AWS_Cloud_Deployment_Guide.md`](./AWS_Cloud_Deployment_Guide.md)). After seed, **Dr Ahmed Shall Group** exposes **30 organization users** in **Admin → Organization users** (`GET /api/v1/admin/users`); smoke tests expect `total ≥ 30`.

**Idempotent seed:** if **any** database content already exists (tenants, users, clinics, or patients), the seed **does not delete or replace** existing rows and **never resets passwords** on accounts that already exist. It only ensures missing demo records (platform super admin, Kiorly login accounts, Dr Ahmed Shall clinics/staff/patients) are created. A full demo dataset is inserted **only** on a completely empty database.

**Primary organization:** `Kiorly Clinic Group (Demo)` — 1 HQ clinic + 14 branches (see [Clinic hierarchy](#clinic-hierarchy)).

**Additional organizations:** seed creates **Dr Ahmed Shall Group** (4 Cairo clinics, EGP) and 13 empty shell tenants (`Shell Organization 3` … `Shell Organization 15`) with no users; use the platform admin UI to inspect or manage them.

---

## Dr Ahmed Shall Group (seeded)

Professor / consultant in chronic pain, joints, spine, and neuritis (non-surgical) — Cairo University Qasr Al-Aini.

**User count (organization):** **30** accounts — 6 org-wide roles below + 6 staff roles × 4 clinics (`hel`, `cmc`, `moh`, `dok`). All belong to tenant **Dr Ahmed Shall Group** and appear in **Admin → Organization users** when signed in as `admin@drahmedshall.com`.

**Organization users UI:** search by **email** or **display name**, and filter by **role** (dropdown). Example: choose **Group supervisor** to list only `supervisor@drahmedshall.com`; choose **Nurse** to see all `nurse.{slug}@…` accounts. API: `GET /api/v1/admin/users?q=&role=GROUP_SUPERVISOR`.

### Organization-wide accounts

| Email | Password | Role | Notes |
|-------|----------|------|-------|
| `admin@drahmedshall.com` | `demo` | Group admin | Full organization + Admin |
| `supervisor@drahmedshall.com` | `demo` | Group supervisor | Org-wide patients (edit/delete), appointments, encounters, operations, expenses, revenue, reports (no Admin / HR / Clinics) |
| `dr.ahmed@drahmedshall.com` | `demo` | Physician | All clinics (no single-clinic HR link) |
| `callcenter@drahmedshall.com` | `demo` | Call center | Org-wide patients (edit/delete) & appointments |
| `finance@drahmedshall.com` | `demo` | Finance officer | Revenue, expenses, reports |
| `hr@drahmedshall.com` | `demo` | HR officer | HR module |

### Per-clinic accounts

Each clinic has its own staff logins. Replace `{slug}` with **`hel`**, **`cmc`**, **`moh`**, or **`dok`**.

| Email pattern | Role | Clinic scope |
|---------------|------|--------------|
| `branchmgr.{slug}@drahmedshall.com` | Branch manager | That clinic only |
| `clinicadmin.{slug}@drahmedshall.com` | Clinic admin | That clinic only |
| `assistant.{slug}@drahmedshall.com` | Clinic assistant | — |
| `nurse.{slug}@drahmedshall.com` | Nurse | — |
| `receptionist.{slug}@drahmedshall.com` | Receptionist | — |
| `physician.{slug}@drahmedshall.com` | Physician | Assigned to that clinic (scheduling & encounters) |

| Slug | Clinic | Example reception login |
|------|--------|-------------------------|
| `hel` | Heliopolis — Obour Buildings | `receptionist.hel@drahmedshall.com` |
| `cmc` | Fifth Settlement — CMC | `receptionist.cmc@drahmedshall.com` |
| `moh` | Mohandessin | `receptionist.moh@drahmedshall.com` |
| `dok` | Capital Hospital Dokki | `receptionist.dok@drahmedshall.com` |

Each clinic also gets **5 demo patients** (MRN `AES-{SLUG}-001` … `005`) when missing.

**Booking phones (seed):** +201019234886 · +201010027404

| Clinic (EN) | City | Schedule (from clinic address) |
|-------------|------|--------------------------------|
| Heliopolis Clinic — Obour Buildings | Heliopolis | Sun–Wed: patients 4 PM, Dr. 5 PM |
| Fifth Settlement Clinic — CMC | New Cairo | Mon: patients 7 PM, Dr. 8 PM |
| Mohandessin Clinic | Mohandessin | Thu: from 12 PM |
| Capital Hospital Dokki — Contract Clinic | Dokki | Tue: patients 4–6 PM |

All four clinics are **standalone** root locations under the group (flat layout). Maps links are stored in each clinic’s `locationUrl`.

---

## Platform super administrator

Dedicated platform operator with **no organization membership** (`tenantId: null`). Use this account to create tenants, clinics under each tenant, and users assigned to clinics.

| Email | Password | Role | Organization | UI |
|-------|----------|------|--------------|-----|
| `superadmin@kiorly.com` | `demo` | `PLATFORM_SUPER_ADMIN` | **None** | **Platform** tab → create orgs, clinics, users |

The demo seed populates **Kiorly Clinic Group (Demo)**. Use **`superadmin@kiorly.com`** to provision **new** organizations with a group admin (email + password) in one step on the **Platform** tab.

After sign-in you land on `/platform`. Navigation shows **Platform** and **Profile** only.

**Typical provisioning flow:**

1. **Platform** → Create organization (name, currency, locale)
2. Fill **Group administrator** — email (username), password, display name
3. Optionally check **Also create first HQ clinic**
4. Select the org → add branches, create clinic-scoped users, adjust settings

**API:** `GET/POST/PATCH /api/v1/admin/platform/*` — overview, tenants, clinics, users, feature flags.

---

## Legacy platform email allowlist (optional)

Organization **Group Admin** users can also receive cross-tenant tools when their email appears in `PLATFORM_SUPER_ADMIN_EMAILS` (comma-separated). See `apps/api/.env.example`. This is separate from the dedicated `superadmin@kiorly.com` account.

When `platformSuperAdmin: true` (login / `GET /auth/me`), the **Administration** page shows the full group-admin console **plus**:

| Capability | UI / API | Description |
|------------|----------|-------------|
| All tenants | Admin → **Clinics & tenants** → tenant table | `GET /api/v1/admin/tenants` — every organization in the platform |
| Data explorer | Admin → **Data explorer** tab | `GET/POST/PATCH/DELETE /api/v1/admin/data-explorer/*` — direct CRUD on allowlisted tables |
| Cross-tenant DB tables | Data explorer | `feature_flags`, `tenants`, `users`, `clinics`, `patients`, `employees`, `appointments`, `encounters`, `expenses`, `revenue_entries`, `audit_logs`, `clinic_admin_scopes`, `user_nav_tab_grants`, `diagnoses`, `encounter_medications`, `attendances`, `leave_requests` |

### Group admin with platform flag (break-glass)

| Email | Password | App role | `platformSuperAdmin` | Admin UI |
|-------|----------|----------|----------------------|----------|
| `admin@kiorly.com` | `demo` | Group Admin | **Yes** — if listed in `PLATFORM_SUPER_ADMIN_EMAILS` | Clinics & tenants, Organization & settings, Governance, **Data explorer**, all-tenants table |

**Local setup example** (`apps/api/.env`):

```env
PLATFORM_SUPER_ADMIN_EMAILS=admin@kiorly.com
```

Without this variable, `admin@kiorly.com` still has **organization** admin (below) but **not** data explorer or all-tenants APIs.

### Group Admin without platform flag

Any user with role `GROUP_ADMIN` in an organization gets the organization admin tabs (clinics, **organization users** with search + role filter, organization patients, settings, governance, create users) but **not** data explorer or cross-tenant tenant list unless their email is in `PLATFORM_SUPER_ADMIN_EMAILS`.

---

## Organization users (tenant-wide)

These users belong to **Kiorly Clinic Group (Demo)** and typically see data across **all clinics** in that organization (no `ClinicAdminScope` row), except where role rules apply (e.g. physicians see their own encounters).

| Email | Password | Role | Display name | Scope / notes |
|-------|----------|------|--------------|---------------|
| `admin@kiorly.com` | `demo` | Group Admin | Group Administrator | Full org + Admin page; platform extras if env configured |
| `finance@kiorly.com` | `demo` | Finance Officer | Demo Finance Officer | Revenue, expenses, reports (no Admin) |
| `staff7@kiorly.com` | `demo` | HR Officer | Demo User 7 | HR module |
| `nurse@kiorly.com` | `demo` | Nurse | Demo Nurse | Patients, appointments, encounters |
| `receptionist@kiorly.com` | `demo` | Receptionist | Demo Receptionist | Front desk, operations |
| `callcenter@kiorly.com` | `demo` | Call Center | Demo Call Center | Org-wide patients & appointments only (all clinics) |
| `assistant@kiorly.com` | `demo` | Clinic Assistant | Demo Clinic Assistant | Patients, appointments, encounters, operations, revenue, expenses |

### Additional seeded org users (`staff3` … `staff15`)

Same password `demo`, same tenant. Useful for role variety and audit volume:

| Email | Role |
|-------|------|
| `staff3@kiorly.com` | Physician |
| `staff4@kiorly.com` | Branch Manager |
| `staff5@kiorly.com` | Nurse |
| `staff6@kiorly.com` | Receptionist |
| `staff7@kiorly.com` | HR Officer |
| `staff8@kiorly.com` | Finance Officer |
| `staff9@kiorly.com` | Physician |
| `staff10@kiorly.com` | Nurse |
| `staff11@kiorly.com` | Branch Manager |
| `staff12@kiorly.com` | Physician |
| `staff13@kiorly.com` | Receptionist |
| `staff14@kiorly.com` | Nurse |
| `staff15@kiorly.com` | Finance Officer |

> **Note:** Only `clinicadmin@kiorly.com` and `branchmgr@kiorly.com` have explicit clinic scope rows in seed. Other branch managers in this table behave as org-wide unless scopes are added via Admin.

---

## Clinic users (clinic-scoped & clinical)

### Clinic-scoped administrators

Assigned clinics via `ClinicAdminScope` — API filters encounters, appointments, revenue, expenses, HR, patients, etc. to those clinics only.

| Email | Password | Role | Display name | Assigned clinics |
|-------|----------|------|--------------|------------------|
| `clinicadmin@kiorly.com` | `demo` | Clinic Admin | Demo Clinic Administrator | **HQ** (Dubai) + **Branch 1** |
| `branchmgr@kiorly.com` | `demo` | Branch Manager | Demo Branch Manager | **HQ** (Dubai) only |

**Admin page (clinic scope):** Staff onboarding (`AdminCreateEmployeePanel`) + **Governance** (nav tab grants). No “Clinics & tenants” or data explorer.

### Physicians (clinical + clinic network)

Physicians see **their own** encounters and clinics linked through HR **Employee** records (HQ + branches under the same root).

| Email | Password | Role | Display name | HR clinic link (seed) |
|-------|----------|------|--------------|------------------------|
| `physician@kiorly.com` | `demo` | Physician | Dr. Demo Physician | Branch 3 |
| `doctor2@kiorly.com` | `demo` | Physician | Dr. Second Physician | Branch 8 |

**Typical nav:** Patients, Encounters, Appointments, Operations, Doctor revenue, Reports, Profile.

### Demo draft encounters

After seed, four **DRAFT** encounters (with medications) exist for prescription / editing QA — filter Encounters → **Draft only** or open recent drafts as `physician@kiorly.com` or `doctor2@kiorly.com`.

---

## Clinic hierarchy

| Kind | Name (EN) | Contact email (seed) |
|------|-----------|----------------------|
| HQ (parent) | Kiorly Medical Center — Dubai HQ | `dubai@kiorly.com` |
| Branch 1 | Kiorly Clinic Branch 1 | `branch1@kiorly.com` |
| Branch 2 … 14 | Kiorly Clinic Branch 2 … 14 | `branch2@kiorly.com` … `branch14@kiorly.com` |

Branches are children of HQ (`parentClinicId` → HQ).

---

## Quick test matrix

| Goal | Login |
|------|--------|
| Register patient with documents + camera | `assistant@kiorly.com` or `receptionist@kiorly.com` → **Patients → New patient** |
| Phone duplicate warning (use existing patient phone) | Same as above — enter a phone already on another patient |
| Patient profile age from DOB | Open any patient with DOB set — header shows date + calculated age |
| Patient profile clinical docs (labs / radiology / Rx / other) | Open any patient → scroll to document sections; upload at registration, via encounter, or **+ Add** on profile |
| National ID / passport in **Other documents** | Register or edit patient with national ID scan → profile **Other documents** shows read-only entry |
| Document viewer: zoom, swipe gallery, crop, delete | Open an image doc from profile → pinch/drag zoom, arrows between images; **Crop** / **Delete** with confirm (not on national ID) |
| Edit patient demographics | `assistant@kiorly.com`, `clinicadmin@kiorly.com`, `branchmgr@kiorly.com`, `callcenter@kiorly.com`, `supervisor@drahmedshall.com`, or `admin@kiorly.com` → patient profile → **Edit patient** |
| Delete patient (confirm dialog) | Same roles as edit → **Patients** list → delete action |
| Reports → acquisition channel → patient list | `finance@kiorly.com` or `admin@kiorly.com` → **Reports** → click a channel row |
| Audit trail (document view / crop / delete) | Perform action as any role → **Admin → Governance & audit** as `admin@kiorly.com` |
| Data explorer — SQL export | `admin@kiorly.com` + `PLATFORM_SUPER_ADMIN_EMAILS` → **Admin → Data explorer** → **Download SQL** |
| Data explorer — documents ZIP (local or S3) | Same as SQL → select entities → **Download documents ZIP**; verify `manifest.json` inside ZIP |
| Bulk delete patients (org admin) | `admin@kiorly.com` → **Admin → Organization patients** |
| Filter org users by role | `admin@drahmedshall.com` → **Admin → Organization users** → Role dropdown (e.g. Group supervisor, Nurse) |
| Upload profile picture | Any user → **Profile** → camera icon on avatar |
| HR employee profile | `hr@drahmedshall.com` or `admin@drahmedshall.com` → **HR → Employees** → row → **Employee profile** |
| Create tenants, clinics, org users (no org membership) | `superadmin@kiorly.com` |
| Platform data explorer + all tenants (legacy) | `admin@kiorly.com` + `PLATFORM_SUPER_ADMIN_EMAILS` |
| Organization settings & create clinic | `admin@kiorly.com` |
| Single-clinic admin experience | `clinicadmin@kiorly.com` or `branchmgr@kiorly.com` |
| Clinical workflow & prescriptions | `physician@kiorly.com` (draft encounters with meds) |
| Finance ledger | `finance@kiorly.com` |
| HR | `staff7@kiorly.com` |
| Reception / operations | `receptionist@kiorly.com` |
| Call center (org-wide patients edit/delete & appointments) | `callcenter@kiorly.com` or `callcenter@drahmedshall.com` |
| Dr Ahmed Shall — group admin | `admin@drahmedshall.com` |
| Dr Ahmed Shall — group supervisor (performance oversight) | `supervisor@drahmedshall.com` |
| Dr Ahmed Shall — clinical (all clinics) | `dr.ahmed@drahmedshall.com` |
| Dr Ahmed Shall — Heliopolis front desk | `receptionist.hel@drahmedshall.com` |
| Dr Ahmed Shall — CMC physician / scheduling | `physician.cmc@drahmedshall.com` |
| Dr Ahmed Shall — Mohandessin branch manager | `branchmgr.moh@drahmedshall.com` |
| Dr Ahmed Shall — Dokki clinic admin | `clinicadmin.dok@drahmedshall.com` |
| Clinic default currency on fees | `admin@drahmedshall.com` → **Admin → Clinics** → edit clinic → **Default currency** (EGP for Dr Ahmed) |
| Operation payment currency override | `receptionist@kiorly.com` → **Operations** → create/edit → **Payment currency** |
| Expense in clinic currency | `finance@kiorly.com` → **Expenses** → amount label shows clinic currency; optional currency selector |
| Edit scheduled operation (full form) | `receptionist@kiorly.com` → **Operations** → Edit on scheduled row |
| HR deactivate employee | `hr@drahmedshall.com` → **HR** → employee → Deactivate |
| HR re-hire employee | `hr@drahmedshall.com` → separated employee → Re-hire (set date) |
| Admin-only employee delete | `hr@drahmedshall.com` cannot delete; `admin@drahmedshall.com` or `clinicadmin.*` can |

---

## Related seed volume (non-user)

| Entity | Approx. count (main tenant) |
|--------|----------------------------|
| Patients | 300 (15 named + 285 bulk); optional docs at registration |
| Encounters | 360 (+ 4 demo drafts with meds / documents) |
| Appointments | 260 |
| Employees | 17 (+ physicians linked to users) |
| Organizations | 15 (1 Kiorly demo populated, 1 Dr Ahmed with 4 clinics, 13 shells) |
| Clinics | 19 (Kiorly: 1 HQ + 14 branches; Dr Ahmed: 4 standalone) |
| Dr Ahmed patients | 5 per clinic (20 total when fully seeded) |
| Patient documents | Registration uploads + encounter lab/radiology/Rx files (see profile **clinical document** sections) |

**Patient phone rule:** only one active patient per organization per normalized phone number; API `GET /api/v1/patients/phone-conflict?phone=...`.

Source of truth for accounts and roles: `apps/api/prisma/seed.ts`.
