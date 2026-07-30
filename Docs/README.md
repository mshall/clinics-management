# Documentation index

Reference material for the **Kiorly Clinics Management** platform (monorepo root: [`README.md`](../README.md)).

**Doc set version:** PRD **v1.8** · RFC **v1.7** (aligned with `main`, July 2026).

---

## Documentation portal

Browse all markdown (including synced **PiggyMetrics** reference) in a local UI:

```bash
npm run docs:sync   # refresh PiggyMetrics README from GitHub master
npm run docs:dev    # http://localhost:5175
```

See **[Documentation_Portal.md](./Documentation_Portal.md)** for module layout, sync workflow, and ports (API 3000 · Web 5173 · Docs 5175).

---

## Quick links

| Document | Purpose |
|----------|---------|
| [**Documentation_Portal.md**](./Documentation_Portal.md) | Docs workspace (`apps/docs`), PiggyMetrics sync, how to view locally |
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
| Organization users | **Admin → Organization users** | Search, role filter; create/edit; **deactivate**, **archive** (soft), **restore**; **Active / Archived** tabs with lifecycle dates |
| Organization patients | **Admin → Organization patients** | Search, bulk delete |
| Clinics & branches | **Clinics & branches** (`/clinics`) | Parent/branch directory; **disable / reactivate** with **operating history**; active vs disabled tabs; **working hours** on Settings tab |
| Clinics & tenants (settings) | **Admin → Clinics & tenants** | Registration, invoice & prescription branding, **opening/closing times** on create/edit |
| Organization & settings | **Admin → Organization & settings** | Default visit fee, feature flags, staff onboarding |
| Governance & audit | **Admin → Governance** | Audit trail |

**Organization users API:** `GET /api/v1/admin/users?page=&pageSize=&q=&role=&archived=` — `q` matches email or display name; `role` is a `UserRole` enum value; `archived=true` returns deactivated or archived users. Lifecycle: `POST .../deactivate`, `POST .../reactivate`, `DELETE ...` (soft archive), `POST .../restore`.

**Clinics API:** `GET /api/v1/clinics?includeInactive=true` (admin roles) lists disabled clinics; `POST /api/v1/clinics/:id/deactivate`, `POST .../reactivate`; detail includes `operatingPeriods[]`.

**Reports:** All charts and KPIs use the global **reporting period** (From → To) in the app header — not a separate “months of history” control. See PRD §6.7 and RFC §6.2.17.

**Profile picture:** any logged-in user → **Profile** → camera icon on avatar → crop and upload (`POST /api/v1/auth/me/avatar`).

**HR employee profile:** **HR → Employees** → row → **Employee profile** for a person-centric view (linked login avatar when available).

**HR lifecycle:** Deactivating an employee **also deactivates** the linked login user (1:1). **Archive** (soft delete) removes both from active lists; **restore** reactivates both. HR officers can deactivate/re-hire; **archive** is limited to **Group admin**, **Branch manager**, and **Clinic admin**. See **Active / Archived employees** tabs on the HR page.

**Clinic lifecycle:** Group admins (and clinic/branch managers in scope) can **disable** a clinic or branch — it disappears from operational pickers but remains in **Disabled clinics** with an **operating timeline** (periods + gaps when disabled). Disabling a parent also disables active branches.

**User ↔ employee link:** Every HR employee requires a linked organization user; archive/deactivate/restore keeps the 1:1 relationship intact (`user-employee-cascade.ts`).

---

## Multi-currency (clinic fees)

Supported currencies: **EGP**, **USD**, **OMR**, **SAR**, **AED**.

| Setting | Where | Effect |
|---------|-------|--------|
| **Organization base currency** | Admin → Organization & settings | Default for new clinics; changing org base **syncs inherited** clinics (those still on the previous base); custom clinic overrides are kept |
| **Clinic default currency** | Admin / clinic create & edit (`defaultCurrency`) | Visit fees, expense defaults, operation defaults |
| **Operation payment currency** | Operations create & edit (`feeCurrency`) | Per-procedure override when patient pays in another currency |
| **Expense currency** | Expenses create form | Defaults to clinic currency; optional override |
| **Employee salary currency** | HR → Employee profile | Override vs clinic default for payroll expense lines |

Amount labels and formatted values use org/clinic/operation resolution across encounters, operations, and expenses (`apps/web/src/lib/money-display.ts`, `useOrgBaseCurrency()`).

---

## Appointments & scheduling

| Topic | Behaviour |
|-------|-----------|
| **Earliest slot** | Selected clinic **`openingTime`** (default 9:00 AM) |
| **Default duration** | 15 minutes when end time omitted |
| **Next slot** | Booking form suggests next free slot for clinician/day |
| **Overlap** | Confirm dialog to double-book same clinician/time (`confirmOverlap`); **multiple conflicts** shown one-at-a-time with “+N more booking(s)” |
| **After hours** | Bookings after **`closingTime`** allowed; **call center** sees warning |
| **Calendar** | **Appointments → Calendar** — month grid, day agenda, shared-slot highlights |
| **API** | `GET /api/v1/appointments/scheduling-conflicts`; optional `endsAt`; finalize sets end from encounter |

Configure hours: **Clinic detail → Settings → Working hours**, or group admin clinic create/edit forms.

---

## UI themes

| Theme | Description |
|-------|-------------|
| **Kiorly Light / Dark** | Default product tokens (`data-theme="default-*"`) |
| **Material Light / Dark** | Material Design 3 layer — Roboto, pill buttons, M3 surfaces, light-blue primary accent |

**Theme switcher:** app shell (and login). Optional **“Use as default when I sign in again”** persists via `localStorage`; in-tab choice uses `sessionStorage` until sign-out.

Implementation: `apps/web/src/stores/theme-store.ts`, `apps/web/src/components/theme-switcher.tsx`, `apps/web/src/styles/material-theme.css`.

---

## Document camera (mobile)

On phones and touch devices, patient/encounter document capture opens the **native OS camera** instead of a live browser preview — see `DocumentCameraCaptureDialog` and `apps/web/src/lib/platform.ts`.

---

## Roadmap & comprehensive platform vision

Shipped capabilities are listed in the PRD [§12.1 Delivered on `main`](./Clinic_Management_System_PRD.md#121-delivered-on-main). For a **production-grade, feature-rich** target platform, see:

| Section | Contents |
|---------|----------|
| PRD **§12.3** | Full backlog by domain (security, clinical, finance, HR, analytics, integrations) with P0–P3 priorities |
| PRD **§12.3.13** | **Near-term enhancements to shipped modules** (reports scheduling, invoice bulk, holiday calendar, HR offboarding, etc.) |
| PRD **§12.3.12** | Admin, governance & org lifecycle (access reviews, tenant export, clinic merge) |
| PRD **§13** | International expansion phases (country packs, patient portal, payments, FHIR, payroll) |
| RFC **§6.2** | Implemented API behaviour; **§6.1** module map |

**Suggested next waves (summary):**

1. **Production gate** — MFA, refresh tokens, rate limiting, WAF, audit export, patient invoicing at scale, notifications (SMS/WhatsApp).
2. **Operations depth** — Patient portal, online payments, expense approval workflows, executive dashboard alerts, scheduled reports.
3. **Clinical & insurance** — Formulary, interaction checks, structured labs, first insurance connector.
4. **Enterprise scale** — SSO, white-label, subscription billing, native mobile apps, embedded BI.

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
| User ↔ employee cascade | `apps/api/src/common/user-employee-cascade.ts` |
| Clinic disable / operating periods | `apps/api/src/clinics/clinics.service.ts` |
| Clinic working hours | `apps/api/src/common/clinic-hours.ts`, `apps/web/src/lib/clinic-hours.ts`, `ClinicHoursSettingsPanel` |
| Appointment scheduling & overlap | `apps/api/src/common/appointment-scheduling.ts`, `apps/web/src/features/appointments/` |
| Document camera (mobile native) | `apps/web/src/components/document-camera-capture-dialog.tsx`, `apps/web/src/lib/platform.ts` |
| Web clinics directory | `apps/web/src/features/clinics/clinics-page.tsx` |
| Reports (date-range charts) | `apps/api/src/reports/reports.service.ts`, `apps/web/src/features/reports/reports-page.tsx` |
| Supported currencies | `apps/api/src/common/base-currencies.ts`, `apps/web/src/lib/base-currencies.ts` |
| Clinic / fee currency resolution | `apps/api/src/common/clinic-currency.ts`, `apps/api/src/common/sync-inherited-clinic-currencies.ts`, `apps/web/src/lib/money-display.ts`, `useOrgBaseCurrency()` |
| UI themes (Kiorly + Material M3) | `apps/web/src/stores/theme-store.ts`, `apps/web/src/styles/material-theme.css` |
| Docs portal + PiggyMetrics sync | `apps/docs/`, `scripts/sync-piggymetrics-docs.sh` |
| HR deactivate / archive / restore | `apps/api/src/hr/hr.service.ts`, `apps/web/src/lib/employee-manage-policy.ts` |
| Operations UI | `apps/web/src/features/operations/operations-page.tsx` |
| Invoices & clinic invoice settings | `apps/api/src/invoices/`, `apps/web/src/features/invoices/` |
| Prescription clinic branding | `apps/api/src/clinics/` (prescription settings), Admin clinic panels |
