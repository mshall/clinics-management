# Product Requirements Document (PRD)
## Clinic Management System (CMS)

| Field | Value |
|---|---|
| **Document Title** | Clinic Management System – Product Requirements Document |
| **Version** | 1.3 |
| **Status** | Living document (aligned with `main` as of June 2026) |
| **Author** | Product / Engineering |
| **Last Updated** | June 2026 |
| **Related Documents** | [`Clinic_Management_System_RFC.md`](./Clinic_Management_System_RFC.md), [`AWS_Cloud_Deployment_Guide.md`](./AWS_Cloud_Deployment_Guide.md), [`Test_Data_Users.md`](./Test_Data_Users.md) |

---

## 1. Executive Summary

The Clinic Management System (CMS) is a multi-tenant, multi-branch SaaS platform that enables healthcare organizations to operate clinical, administrative, financial, and human-resource functions from a single source of truth. It combines an Electronic Health Record (EHR) with prescription management, multi-branch governance, expense tracking, HR, and bilingual (English/Arabic) experiences.

The product targets clinic groups that operate one or more parent clinics with sister or sub-branches, and need centralized oversight without sacrificing per-branch autonomy.

**Tenancy (decided):** The platform is **multi-tenant SaaS**. One deployed application serves many **organizations (tenants)** on shared infrastructure. Each clinic group is a tenant; users authenticate into exactly one tenant (except the platform operator account). See [§3.4 Tenancy & deployment model](#34-tenancy--deployment-model).

The MVP focuses on operational efficiency, data integrity, and a clean clinical workflow; later phases extend into analytics, patient self-service, and integrations with external systems (labs, pharmacies, insurance, national health IDs).

## 2. Problem Statement

Independent and group clinics today rely on a patchwork of paper records, spreadsheets, and disconnected point solutions for EHR, billing, payroll, and inventory. This produces:

- Fragmented patient histories across branches.
- Inconsistent prescription practices and difficulty tracking medication safety.
- Limited visibility into branch-level financial performance (expenses, salaries, utilization).
- Manual HR processes (attendance, leave, payroll) that scale poorly.
- No support for bilingual patient populations in regions where Arabic is required alongside English.

The CMS solves these by unifying clinical and operational data within one bilingual platform that respects the parent–branch hierarchy.

## 3. Product Vision & Goals

### 3.1 Vision
Become the operating system for clinic groups in bilingual markets — clinically rigorous, financially transparent, and operationally simple.

### 3.2 Strategic Goals
1. Deliver a complete EHR experience that clinicians actually want to use.
2. Provide group-level governance over a network of branches.
3. Make clinic finances and workforce management measurable and predictable.
4. Be fully bilingual (English/Arabic) with proper RTL support, not bolted on.
5. Be deployable to a new clinic in under one business day.

### 3.3 Non-Goals (for v1)
- Hospital-grade inpatient management (wards, OR scheduling, ICU).
- Telemedicine video infrastructure (planned for v2).
- Insurance claims adjudication engine (basic claims only in v1).
- Pharmacy POS / retail dispensing.
- **Dedicated single-tenant deployment per customer as the default product SKU** (supported as an enterprise hosting option, not the primary model).

### 3.4 Tenancy & deployment model

| Concept | Definition |
|---|---|
| **Platform** | One SaaS product instance (e.g. AWS stack in `eu-central-1`) operated by Kiorly / the software vendor. |
| **Tenant (organization)** | One clinic **group** — customers who subscribe. Has its own users, clinics, patients, ledger, and settings. Identified by `tenantId` on all business data. |
| **Clinic / branch** | A site within a tenant (HQ parent or branch). Not a separate tenant. |
| **Platform Super Admin** | Vendor operator with **no** `tenantId`; provisions new tenants on the shared platform. |

**Decision: multi-tenant SaaS (not one deployment per clinic group by default).**

| Model | Description | Status |
|---|---|---|
| **Multi-tenant SaaS (default)** | Shared PostgreSQL schema; every row scoped by `tenantId`; many organizations on one App Runner + RDS stack. Platform admin creates tenants via `/platform`. | **Implemented** |
| **Dedicated single-tenant** | Same codebase, separate AWS stack and database for one customer only (one tenant populated). Stronger isolation for enterprise contracts. | **Supported as hosting option**, not separate product fork |
| **Single-tenant per VM** | Customer runs their own copy on Lightsail/EC2. | Documented in AWS guide; ops responsibility on customer |

**Isolation guarantees (current build):**
- JWT carries `tenantId`; API handlers reject cross-tenant access.
- Unique constraints are **per tenant** (MRN, national ID, phone).
- Platform APIs (`/admin/platform/*`) are restricted to `PLATFORM_SUPER_ADMIN`.
- Org-scoped admins never see another tenant’s data unless break-glass email allowlist is configured for support tooling.

**Future hardening (not required for MVP):** PostgreSQL row-level security (RLS), per-tenant encryption keys, dedicated DB per enterprise tenant.

## 4. Target Users & Personas

| Persona | Role | Primary Needs |
|---|---|---|
| **Platform Super Administrator** | SaaS operator (no tenant) | Create organizations, clinics, and initial users on the shared platform |
| **Group Administrator** | Owns the clinic group | Branches, users, org settings, org-wide patients, governance |
| **Group Supervisor** | Org-wide oversight | Patients, appointments, encounters, operations, finance views (no Admin/HR) |
| **Branch Manager** | Runs assigned clinic(s) | Staff, expenses, schedules, scoped operations |
| **Clinic Administrator** | Scoped to assigned clinics | Same as branch manager patterns; clinic-scoped API filters |
| **Clinic Assistant** | Front office / clinical support | Patient registration, appointments, encounters, operations |
| **Physician / Clinician** | Clinical care | Own schedule, encounters, prescriptions, doctor revenue |
| **Nurse / Medical Assistant** | Supports clinical workflow | Vitals capture, triage, appointment prep |
| **Receptionist / Front Desk** | Patient intake and scheduling | Registration, appointment booking |
| **Call Center** | Remote booking | Org-wide patients & appointments (read/book) |
| **HR Officer** | Manages employees | Onboarding, attendance, leave |
| **Finance Officer** | Tracks money | Expense entry, revenue, reports |
| **Patient (Indirect, v2)** | Receives care | View records, prescriptions, appointments |

## 5. Scope

### 5.1 In Scope (v1)

**Platform & tenancy**
- **Multi-tenant SaaS** with platform super-admin onboarding (organizations, clinics, users).
- Shared-schema isolation by `tenantId`; optional dedicated deployment for enterprise (hosting pattern).

**Clinical & patients (implemented on `main`)**
- Patient registry with bilingual names, optional DOB (**calculated age on profile**), **unique phone per tenant**, national ID, acquisition tracking, registration documents (camera capture), edit/delete (role-gated — includes **Call Center** and **Group Supervisor**).
- Patient profile: vitals history, encounters, **clinical document sections** (labs, radiology, prescriptions, other) with **in-app viewer** (pinch zoom, swipe/gallery navigation), **crop** (confirm before replace), and **delete** (confirm dialog); national ID / SSN / passport scan surfaced in **Other documents**.
- Encounters: SOAP, vitals, ICD-10 diagnoses, medications, lab/radiology/Rx uploads, generate prescription image, finalize workflow.
- Appointments: schedule, status lifecycle, physician/clinic scope.
- Surgical **operations** module (schedule, balance, documents, revenue linkage).

**Financial & HR**
- Expense tracking with proof uploads; revenue ledger (visit fees, manual entries, operations); reports/monthly series.
- HR: employees, attendance, leave; employee ID document upload.

**Administration**
- Organization settings, clinics (parent/branch), users, feature flags, audit log.
- Org patients CRUD, bulk patient delete, bulk user delete, data explorer, **SQL export** and **documents ZIP export** (group admin / break-glass).
- Expanded **audit trail** for patient/encounter views, clinical document list/view/upload/delete/crop (visible in Governance).

**Experience**
- Bilingual UI (English / Arabic with RTL).
- Role-based access control and clinic scope for admins/physicians.
- Responsive web SPA (no native mobile app in repo).

### 5.2 Out of Scope (v1)
- Patient mobile app.
- Telemedicine.
- Lab equipment integration.
- Government health insurance claim submission (manual export only).
- Inventory management beyond basic materials expense tracking.

## 6. Functional Requirements

### 6.1 Electronic Health Record (EHR)

> **Legend:** Bullets in **Patient Record**, **Prescriptions**, and **Clinical Safeguards** below describe the **full EHR product vision**. Subsections **6.1a–6.1f** describe what is **shipped** in the current web/API build.

**Patient Record (roadmap)**
- Unique patient ID per group (visible across branches that the patient consents to).
- Demographics: name (EN/AR), DOB, gender, national ID/passport, contact, address, emergency contact.
- Medical history: allergies, chronic conditions, family history, surgical history, social history.
- Vitals capture: BP, HR, temperature, weight, height, BMI, SpO₂.
- Encounter notes: chief complaint, examination, assessment, plan (SOAP format).
- Attachments: lab reports, imaging, scanned documents (PDF, JPG, PNG, DICOM in v2).
- Diagnoses with ICD-10 coding.
- Procedures with CPT coding (configurable).
- Visit timeline showing all encounters across branches (with consent rules).

**Prescriptions (roadmap)**
- Drug catalog (sourced from configurable list; v2 integrates with national drug registries).
- Per-prescription fields: drug name, strength, dosage form, route, frequency, duration, quantity, refills, instructions (EN/AR).
- Drug–drug interaction check (basic ruleset in v1, full clinical engine in v2).
- Drug–allergy alert.
- Prescription history view per patient.
- Print prescription with clinic letterhead, doctor signature/stamp, both languages.
- Digital prescription PDF download.

**Clinical Safeguards (roadmap)**
- Amendments recorded with reason and timestamp; original retained.
- Doctor authentication required for finalizing notes and prescriptions.

### 6.1a Appointments & encounters (current build)

- **Appointment statuses:** Scheduled (default when booking), Confirmed, Cancelled, Completed. The appointment record is read-only after Completed.
- **Encounter link:** An optional booked appointment (same patient) may be attached when creating an encounter; linking sets the appointment to **Confirmed**; **finalizing** the encounter sets it to **Completed**.
- **Visit fee** is set on **encounter** creation (tenant default in administration); amounts greater than zero create a `VISIT_FEE` revenue ledger line. Appointments do not store a fee.
- **Physician experience:** The web app exposes **Appointments** in the main navigation for physicians. List and detail APIs return only appointments where the JWT user is the **attending clinician**; physicians may only **book** appointments as themselves. The appointments ledger table highlights **clinic** (localized name) for at-a-glance branch context.
- **Clinic administrator:** Appointment lists are limited to clinics in the administrator’s **scope**; detail and mutations outside that scope are denied.

### 6.1b Patient registry & profile (current build)

**Registration (Patients → New patient)**
- Required: English/Arabic names (Arabic first and last required), gender, phone. **Date of birth is optional.**
- **Phone uniqueness:** Each phone number may belong to only one active patient per organization. While typing, the form checks for conflicts, highlights the phone field, shows the existing patient’s name/MRN, and links to their profile; **Create patient** stays disabled until resolved.
- Optional: email, national ID, national ID scan (PDF/image), home branch, **how did they find us?** (social, website, doctor referral with name, other with free text).
- Optional **attached documents** at registration: type **Lab results**, **Radiology**, **Prescription**, or **Other** (custom description); multiple photos/files per row; in-browser **camera capture** on supported devices.

**Patient list & administration**
- Search/filter by MRN, phone, name, national ID, gender; column filters; pagination and sort.
- **Soft delete** (single or bulk) for **Group Admin**, **Group Supervisor**, **Call Center**, **Clinic Admin**, **Clinic Assistant**, and **Branch Manager** (with confirm dialog in the UI).
- **Group Admin** also manages patients under **Administration → Organization patients** (create/edit, bulk delete, filters).

**Patient profile**
- Demographics with **calculated age** when date of birth is set (e.g. `15/05/1990 · 35 years`), optional national ID download, acquisition source, local profile photo (browser storage).
- **Vitals history** and **encounters** list (role-gated) with pagination.
- **Clinical document sections:** **Lab results**, **Radiology**, **Prescriptions**, and **Other documents** — aggregated from registration uploads, encounter documents, and the **national ID / SSN / passport scan** (shown in **Other** with `source: nationalId`; not deletable/croppable from the profile). Per-section **+ Add** uploads from the profile.
- In-app **document viewer:** images support **pinch zoom**, **swipe** (or arrow controls) for multi-image galleries, **download**, **crop** (confirmation before replacing the stored file), and **delete** (confirmation dialog) for patient and encounter documents except the national-ID scan.
- Encounter-sourced items link back to the visit.
- **Edit patient** (demographics dialog) for Group Admin, Group Supervisor, Call Center, Clinic Admin, Clinic Assistant, and Branch Manager — includes the same phone conflict check on save.
- **New encounter** shortcut from profile (when encounters nav is allowed).

**API highlights:** `GET /patients/phone-conflict`, `GET /patients/:id/clinical-documents`, document upload/download/delete/crop endpoints (patient and encounter paths), `PATCH /patients/:id`, `POST /patients/bulk-delete`.

### 6.1c Encounters & clinical documents (current build)

- Encounter editor: SOAP fields, structured vitals, ICD-10 diagnoses, medications, **lab / radiology / prescription** document uploads per visit, optional **generate prescription** image from manual meds, finalize workflow.
- **Mandatory attending doctor** validation and field highlighting on save when required data is missing.
- Patient profile clinical sections roll up encounter documents by kind across all visits the user is allowed to see (respecting physician/clinic scope).

### 6.1d Organization administration (current build)

Beyond tenant settings and clinic directory, **Group Admin** (and platform break-glass where configured) can use:
- **Organization patients** — full CRUD aligned with the registry.
- **Organization users** — create users; **bulk delete** selected or filtered users.
- **Data explorer** — read/write on allowlisted tenant tables (patients, encounters, documents, etc.).
- **SQL export** — selectable entity subsets for backup/analysis.
- **Documents ZIP export** — downloads uploaded blobs (patient/encounter/operation documents, national ID scans, expense proofs, employee ID docs) from local disk or S3 into a ZIP with `manifest.json`; entity filter mirrors SQL export.
- **Governance / audit** — org-wide audit log tail for administrators (includes views of patients/encounters, clinical document list/view/upload/delete/crop, and other sensitive reads).

See [`Test_Data_Users.md`](./Test_Data_Users.md) for demo logins and QA scenarios.

### 6.1e Operations (current build)

- Schedule **operations** (procedures) per clinic with patient, clinician, date, cost, down payment, and balance.
- Status workflow posts or voids linked **revenue** when completed or cancelled.
- Attach documents and medications per operation (similar patterns to encounters).
- Physicians see only operations where they are the assigned clinician; clinic-scoped roles see assigned clinics.

### 6.1f Platform tenancy (current build)

- **`PLATFORM_SUPER_ADMIN`** user (`tenantId: null`) uses the **Platform** tab only: create/list/edit organizations, clinics under any tenant, users, feature flags.
- Each **organization** has independent base currency, locale, default visit fee, clinics, and user directory.
- Demo seed includes multiple tenants (Kiorly demo, Dr Ahmed Shall Group, shell orgs) on one database — see [`Test_Data_Users.md`](./Test_Data_Users.md).
- Production deployment: single CloudFront URL, App Runner API, RDS — see [`AWS_Cloud_Deployment_Guide.md`](./AWS_Cloud_Deployment_Guide.md).

### 6.2 Multi-Branch Support

- **Tenant** = clinic group. **Clinic** = parent HQ or branch within that tenant.
- Group structure: one **Parent Clinic** may own multiple **Branches** (sister or sub-clinics); branches may also be modeled as standalone roots under the tenant (flat layout).
- Each branch has its own staff roster, schedule, expenses, and financial attribution by `clinicId`.
- **Patient records are tenant-scoped** (shared across all branches in the organization). Branch visibility for operations is enforced by **role and clinic scope**, not separate patient registries per branch.
- Group-level reports roll up branch data; branch-level views filter by clinic.
- A user may hold different roles or clinic assignments within the same tenant.
- **Patient consent for cross-branch sharing** — product vision; not a separate consent module in the current build.

### 6.3 Expense Management

Expense categories (extensible):
- **Salaries** – synced from HR/payroll outputs.
- **Materials** – medical supplies, consumables, office supplies.
- **Utilities** – electricity, water, internet, telecom, rent.
- **Other** – marketing, maintenance, professional services.

Each expense entry records: branch, category, sub-category, vendor, amount, currency, tax, payment method, date, supporting document (receipt/invoice upload), entered-by user.

Reporting: monthly/quarterly/annual expense by branch, by category, group consolidation, year-over-year comparison, expense vs. revenue.

### 6.4 HR Module

- **New employee registration** for organization and clinic administrators is performed under **Administration** (employment type, salary, clinic assignment, optional ID document). The HR area remains the operational hub for directory, attendance, and leave.
- **Employee directory** per branch with profile, contract, documents (ID, license, certifications, expiry tracking).
- **Roles & employment type** (full-time, part-time, contractor, locum).
- **Attendance** – clock in/out, manual entry, biometric integration hook.
- **Leave management** – annual, sick, unpaid, custom; approval workflow.
- **Payroll inputs** – base salary, allowances, deductions, overtime; export to payroll system or generate payslip PDF.
- **Performance & licensing** – track license expiry (medical license, board certification), automatic alerts.

### 6.5 Localization (English & Arabic)

- All UI strings translatable; no hard-coded text.
- Right-to-Left (RTL) layout for Arabic, including form alignment, navigation, charts, and tables.
- Bilingual data fields where appropriate (patient name, drug instructions, clinic name).
- Date/time formatting per locale (Hijri calendar display optional).
- Number and currency formatting per locale.
- Printed documents (prescriptions, invoices, reports) available in either language or bilingual.
- Language switch available per user; defaults at clinic level.

### 6.6 Admin Dashboard

- Manage **clinics** (parent/branch) **within the signed-in organization** (tenant).
- Manage users, roles, clinic assignments, optional **nav tab grants**, and feature flags.
- View group-level KPIs: patients, encounters, revenue, expenses, headcount (dashboard + reports).
- **Group administrators** use organization admin tabs; **platform-only** tools (cross-tenant directory, provisioning) require `PLATFORM_SUPER_ADMIN`; raw **data explorer** also available to group admin and break-glass allowlist emails.
- Subscription / licensing billing integration — future SaaS commercial layer.

### 6.6.0 Platform super administration

A dedicated **Platform Super Administrator** operates **outside any organization** (`tenantId: null`, role `PLATFORM_SUPER_ADMIN`). This is the **SaaS vendor** account used to onboard paying clinic groups onto the **shared multi-tenant** instance.

| Capability | Description |
|---|---|
| **Platform overview** | Cross-tenant KPIs: organization count, users, clinics, patients, encounters |
| **Create organization** | Name, base currency, default locale; atomically provision the first **Group Admin** (email/username + password + display name) |
| **Optional HQ clinic** | When creating an organization, optionally create the first parent (HQ) clinic in the same transaction |
| **List & manage organizations** | Paginated directory with per-org user/clinic/patient counts |
| **Organization settings** | Update name, currency, locale, default visit fee for any tenant |
| **Clinic provisioning** | Add parent clinics or branches under any organization |
| **User provisioning** | Create any organization role; assign clinics for clinic admin / branch manager |
| **User directory** | List all users within a selected organization |
| **Global feature flags** | View and toggle platform-wide feature flags |

**Out of scope for the dedicated platform account:** clinical workflows (patients, encounters, prescriptions), org-scoped finance/HR, and the raw data explorer (reserved for legacy break-glass org admins via email allowlist). The platform super admin signs in to the **Platform** tab only (plus Profile).

**Representative user story:** *As a Platform Super Administrator*, I want to create a new clinic group with a group admin login in one step so the customer can sign in and complete clinic onboarding immediately.

### 6.6.1 Reports & analytics

- The **Reports** area charts **visit volume** (finalized encounters), **posted revenue**, and **new patient registrations** per calendar month from live ledger and patient data—not illustrative placeholders.
- **Patient acquisition** breakdown (how patients found the clinic) with date range filter; each channel row is **clickable** to open a paginated patient list dialog for that channel and period.

### 6.7 Clinic Onboarding Form

When adding a clinic (parent or branch), the following fields are captured:

| Field | Type | Required | Notes |
|---|---|---|---|
| Clinic Name (EN) | Text | Yes | |
| Clinic Name (AR) | Text | Yes | |
| Logo | Image upload | Yes | PNG/JPG/SVG; size and dimension constraints |
| Specialities | Multi-select | Yes | From configurable master list (e.g., GP, Dermatology, Pediatrics) |
| Country | Dropdown | Yes | ISO country list |
| City | Dropdown / Text | Yes | Driven by selected country |
| Full Address | Multiline text | Yes | Bilingual support |
| Location Link | URL | Yes | Validated as URL (e.g., Google Maps link) |
| Parent Clinic | Reference | Conditional | Required when adding a sub/sister clinic |
| Phone | Text | Yes | International format |
| Email | Email | Yes | |
| License Number | Text | Yes | Regulatory clinic license |
| Working Hours | Schedule | Yes | Per day, supports breaks |
| Default Language | Enum (EN/AR) | Yes | |

### 6.8 Roles & Permissions

**Implemented roles** (`UserRole` enum): Platform Super Admin, Group Admin, Group Supervisor, Branch Manager, Clinic Admin, Clinic Assistant, Physician, Nurse, Receptionist, Call Center, HR Officer, Finance Officer.

Authorization model:
- **Role-based** checks in services and controllers (e.g. physician sees own encounters; clinic admin filtered by `ClinicAdminScope`).
- **Patient create/edit/delete** (list and profile): Group Admin, Group Supervisor, Call Center, Clinic Admin, Clinic Assistant, Branch Manager (`PATIENT_MANAGE_ROLES` on API).
- Optional **nav tab grants** per user to hide/show main navigation areas.
- Custom permission matrix / auditor role — roadmap; not fully implemented as configurable CASL matrix.

### 6.9 Audit & Compliance

- **Audit log** records administrative and sensitive actions plus selected reads (patient/encounter detail, clinical documents list, document view/download, national ID view) and document mutations (upload, delete, crop). Org admins review entries under **Admin → Governance & audit**.
- Login via JWT; session in SPA until logout or expiry.
- Soft-delete for patients (retain row with `deletedAt`).
- Configurable data retention, login history export, formal patient consent module — roadmap.

## 7. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | P95 page load < 2s on broadband; encounter save < 1s |
| **Availability** | 99.9% monthly uptime target |
| **Scalability** | Support 500 branches and 5M patients per tenant in v1 design |
| **Security** | TLS 1.2+, encryption at rest, RBAC, MFA for admins (roadmap), secrets in AWS Secrets Manager |
| **Multi-tenancy** | Shared schema with application-level `tenantId` isolation; unique business keys per tenant; platform admin segregated |
| **Compliance** | Alignment with applicable health-data regulations in target markets (e.g., DHA/MOH in UAE, HIPAA-equivalent controls); data residency configurable per tenant |
| **Backup & DR** | Daily backups, point-in-time recovery, RPO ≤ 1h, RTO ≤ 4h |
| **Accessibility** | WCAG 2.1 AA |
| **Browser Support** | Latest two versions of Chrome, Edge, Safari, Firefox |
| **Mobile** | Responsive web in v1; native apps in v2 |

## 8. User Stories (Representative Sample)

- *As a Platform Super Administrator*, I want to create a new organization with a group admin in one step so the customer can sign in immediately on the shared SaaS instance.
- *As a Receptionist*, I want immediate feedback when a phone number already belongs to another patient so I do not create duplicate records.
- *As a Call Center agent*, I want to search and book appointments across the organization so I can serve patients remotely.
- *As a Group Admin*, I want to onboard a new sub-clinic in one form so that branches can go live quickly.
- *As a Physician*, I want to see the patient's full history from any branch so that my decisions are informed.
- *As a Physician*, I want drug–allergy alerts at prescription time so that I avoid harm.
- *As a Branch Manager*, I want to see this month's expenses by category so that I can control costs.
- *As an HR Officer*, I want automatic alerts before a clinician's medical license expires so that we stay compliant.
- *As an Arabic-speaking Receptionist*, I want the entire UI in RTL Arabic so that I can work fluently.
- *As a Finance Officer*, I want to consolidate expenses across all branches so that I can report to ownership.

## 9. Success Metrics

- Time to onboard a new branch: ≤ 1 business day.
- Encounter completion time: ≤ 5 minutes median.
- Prescription error rate: reduction of 50% versus baseline within 6 months of go-live.
- Monthly active clinicians: ≥ 90% of licensed users.
- NPS from branch managers: ≥ 40 within 12 months.
- Expense variance reporting cycle: from monthly to weekly.

## 10. Assumptions, Dependencies, Constraints

**Assumptions**
- Clinics have basic broadband and modern browsers.
- Each branch has at least one designated administrator.
- Drug catalog and ICD-10 reference data can be licensed or sourced.
- **Default production hosting** is AWS (CDK stack: CloudFront, S3, App Runner, RDS PostgreSQL) in `eu-central-1`, multi-tenant by default.

**Dependencies**
- AWS account and GitHub Actions OIDC for deploy (see [`AWS_Cloud_Deployment_Guide.md`](./AWS_Cloud_Deployment_Guide.md)).
- SMS / email provider for notifications (not wired in current build).
- Mapping provider for location links validation.
- Identity provider for SSO (optional; JWT login implemented).

**Constraints**
- Regulatory data residency may require region-specific deployments.
- Bilingual content requires translation review before any release.

## 11. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Regulatory non-compliance in a target market | High | Medium | Legal review per market; configurable data residency |
| RTL/Arabic UX defects after release | Medium | Medium | Native Arabic QA from sprint one; bilingual design reviews |
| Data migration from legacy systems | High | High | Standard import templates; migration toolkit; pilot before full cutover |
| Low clinician adoption | High | Medium | Co-design with practicing clinicians; usability testing each milestone |
| Cross-branch data leakage | High | Low | Application `tenantId` checks on every query; unique keys per tenant; security review; optional RLS later |

## 12. Release Plan (Phased)

### 12.1 Delivered on `main` (June 2026)

| Area | Status |
|---|---|
| Multi-tenant SaaS + platform super admin | Shipped |
| Clinics (parent/branch), users, RBAC, nav tab grants | Shipped |
| Patients (registry, phone uniqueness, age from DOB, clinical doc viewer/crop/delete, national ID in Other, soft delete) | Shipped |
| Reports (monthly charts, acquisition channel drill-down) | Shipped |
| Appointments, encounters (SOAP, vitals, ICD-10, meds, documents, Rx image) | Shipped |
| Operations (schedule, balance, revenue linkage) | Shipped |
| Expenses, revenue ledger, reports/monthly charts | Shipped |
| HR (employees, attendance, leave) | Shipped |
| Admin (org patients/users, data explorer, SQL + documents ZIP export, expanded audit) | Shipped |
| Bilingual EN/AR web SPA | Shipped |
| AWS deploy (App Runner + RDS + CloudFront + S3 uploads) | Shipped |

### 12.2 Roadmap

**Phase 2 – Operational depth**
- Payroll exports and payslips; biometric attendance hooks.
- Advanced clinical features (drug interaction engine, structured lab orders, DICOM).
- Patient consent workflows; configurable permission matrix.
- MFA for admins; refresh tokens; Redis rate limiting.

**Phase 3 – Ecosystem**
- Patient portal; telemedicine; insurance claims.
- Lab and pharmacy integrations; native mobile apps.
- Per-tenant billing / subscription management.

## 13. Decisions & open questions

### 13.1 Resolved decisions

| # | Question | Decision |
|---|---|---|
| 1 | Single-tenant per clinic group vs multi-tenant SaaS? | **Multi-tenant SaaS** on shared infrastructure; dedicated stack optional for enterprise. See [§3.4](#34-tenancy--deployment-model). |
| 2 | Default cloud hosting? | **AWS CDK** — CloudFront, S3, App Runner, RDS (`eu-central-1`). |

### 13.2 Open questions

1. Which markets define the next commercial launch? (Compliance and language defaults depend on this.)
2. Is offline-capable mode required for branches with unreliable connectivity?
3. What is the preferred drug catalog source per market?
4. Will SSO with hospital identity providers be required at launch?
5. Is there a preferred payroll system to integrate with first?
6. When is patient-facing portal/app in scope (v1.5 vs v2)?

## 14. Glossary

- **Tenant / Organization** – A clinic group customer on the SaaS platform; all business data is scoped by `tenantId`.
- **Multi-tenant SaaS** – One application deployment serving many tenants on shared DB and compute, with logical isolation.
- **Platform operator** – Vendor staff using `PLATFORM_SUPER_ADMIN` to provision tenants (not a customer role).
- **Parent Clinic** – The top-level clinic entity within a tenant that may own one or more branches.
- **Branch / Sister Clinic / Sub Clinic** – A clinic site within a tenant (may reference a parent clinic).
- **Encounter** – A single clinical visit/interaction between a patient and clinician.
- **EHR** – Electronic Health Record.
- **RBAC** – Role-Based Access Control.
- **RTL** – Right-To-Left text direction (used for Arabic).
