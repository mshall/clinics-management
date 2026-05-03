# Product Requirements Document (PRD)
## Clinic Management System (CMS)

| Field | Value |
|---|---|
| **Document Title** | Clinic Management System – Product Requirements Document |
| **Version** | 1.0 (Draft) |
| **Status** | For Review |
| **Author** | Product / Engineering |
| **Last Updated** | May 2026 |
| **Related Documents** | Technical RFC (separate), UX Wireframes (separate), Compliance Matrix (separate) |

---

## 1. Executive Summary

The Clinic Management System (CMS) is a multi-tenant, multi-branch SaaS platform that enables healthcare organizations to operate clinical, administrative, financial, and human-resource functions from a single source of truth. It combines an Electronic Health Record (EHR) with prescription management, multi-branch governance, expense tracking, HR, and bilingual (English/Arabic) experiences.

The product targets clinic groups that operate one or more parent clinics with sister or sub-branches, and need centralized oversight without sacrificing per-branch autonomy. The MVP focuses on operational efficiency, data integrity, and a clean clinical workflow; later phases extend into analytics, patient self-service, and integrations with external systems (labs, pharmacies, insurance, national health IDs).

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

## 4. Target Users & Personas

| Persona | Role | Primary Needs |
|---|---|---|
| **Group Administrator** | Owns the parent clinic and oversees branches | Provision branches, view consolidated KPIs, manage permissions |
| **Branch Manager** | Runs a single clinic or branch | Manage staff, expenses, schedules, daily operations |
| **Physician / Clinician** | Sees patients, writes prescriptions, updates records | Fast EHR entry, prescription safety, history at a glance |
| **Nurse / Medical Assistant** | Supports clinical workflow | Vitals capture, triage, appointment prep |
| **Receptionist / Front Desk** | Patient intake and scheduling | Registration, appointment booking, billing |
| **HR Officer** | Manages employees | Onboarding, attendance, leave, payroll inputs |
| **Finance Officer** | Tracks expenses and revenue | Expense entry, salary management, financial reports |
| **Patient (Indirect, v2)** | Receives care | View records, prescriptions, appointments |

## 5. Scope

### 5.1 In Scope (v1)
- Electronic Health Record with prescription module.
- Multi-branch architecture with parent/sub-clinic relationships.
- Expense tracking (Salaries, Materials, Utilities, Other).
- HR module (employees, attendance, leave, payroll inputs).
- Admin dashboard for clinic and branch onboarding.
- Bilingual UI (English / Arabic with RTL).
- Role-based access control.
- Audit trail for clinical and financial changes.

### 5.2 Out of Scope (v1)
- Patient mobile app.
- Telemedicine.
- Lab equipment integration.
- Government health insurance claim submission (manual export only).
- Inventory management beyond basic materials expense tracking.

## 6. Functional Requirements

### 6.1 Electronic Health Record (EHR)

**Patient Record**
- Unique patient ID per group (visible across branches that the patient consents to).
- Demographics: name (EN/AR), DOB, gender, national ID/passport, contact, address, emergency contact.
- Medical history: allergies, chronic conditions, family history, surgical history, social history.
- Vitals capture: BP, HR, temperature, weight, height, BMI, SpO₂.
- Encounter notes: chief complaint, examination, assessment, plan (SOAP format).
- Attachments: lab reports, imaging, scanned documents (PDF, JPG, PNG, DICOM in v2).
- Diagnoses with ICD-10 coding.
- Procedures with CPT coding (configurable).
- Visit timeline showing all encounters across branches (with consent rules).

**Prescriptions**
- Add / edit / discontinue prescriptions tied to an encounter.
- Drug catalog (sourced from configurable list; v2 integrates with national drug registries).
- Per-prescription fields: drug name, strength, dosage form, route, frequency, duration, quantity, refills, instructions (EN/AR).
- Drug–drug interaction check (basic ruleset in v1, full clinical engine in v2).
- Drug–allergy alert.
- Prescription history view per patient.
- Print prescription with clinic letterhead, doctor signature/stamp, both languages.
- Digital prescription PDF download.

**Clinical Safeguards**
- Required fields enforced before saving an encounter.
- Amendments recorded with reason and timestamp; original retained.
- Doctor authentication required for finalizing notes and prescriptions.

### 6.1a Appointments & encounters (current build)

- **Appointment statuses:** Scheduled (default when booking), Confirmed, Cancelled, Completed. The appointment record is read-only after Completed.
- **Encounter link:** An optional booked appointment (same patient) may be attached when creating an encounter; linking sets the appointment to **Confirmed**; **finalizing** the encounter sets it to **Completed**.
- **Visit fee** is set on **encounter** creation (tenant default in administration); amounts greater than zero create a `VISIT_FEE` revenue ledger line. Appointments do not store a fee.

### 6.2 Multi-Branch Support

- Group structure: one **Parent Clinic** owns multiple **Branches** (also called sister or sub-clinics).
- Each branch has its own staff roster, schedule, expenses, inventory, and financial books.
- Patient records are owned at the group level; branch access is governed by consent and role.
- Group-level reports roll up branch data; branch-level views are scoped to that branch.
- A user may have different roles at different branches.

### 6.3 Expense Management

Expense categories (extensible):
- **Salaries** – synced from HR/payroll outputs.
- **Materials** – medical supplies, consumables, office supplies.
- **Utilities** – electricity, water, internet, telecom, rent.
- **Other** – marketing, maintenance, professional services.

Each expense entry records: branch, category, sub-category, vendor, amount, currency, tax, payment method, date, supporting document (receipt/invoice upload), entered-by user.

Reporting: monthly/quarterly/annual expense by branch, by category, group consolidation, year-over-year comparison, expense vs. revenue.

### 6.4 HR Module

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

- Provision a new **Parent Clinic** (group).
- Add **Sister/Sub Clinics** under a parent.
- Manage users, roles, and permissions across the group.
- View group-level KPIs: total patients, encounters, revenue, expenses, headcount.
- Manage subscription / licensing (if SaaS billing is in scope).

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

Default roles (customizable):
- Group Admin (full access across the group).
- Branch Manager (full access within assigned branches).
- Physician.
- Nurse.
- Receptionist.
- HR Officer.
- Finance Officer.
- Auditor (read-only).

Permissions are matrix-based (resource × action) and assignable to custom roles.

### 6.9 Audit & Compliance

- Append-only audit log for all create/update/delete actions on clinical and financial data.
- Login history per user.
- Configurable data retention.
- Patient consent management for cross-branch record access.

## 7. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | P95 page load < 2s on broadband; encounter save < 1s |
| **Availability** | 99.9% monthly uptime target |
| **Scalability** | Support 500 branches and 5M patients per tenant in v1 design |
| **Security** | TLS 1.2+, encryption at rest, RBAC, MFA for admins, secrets management |
| **Compliance** | Alignment with applicable health-data regulations in target markets (e.g., DHA/MOH in UAE, HIPAA-equivalent controls); data residency configurable per tenant |
| **Backup & DR** | Daily backups, point-in-time recovery, RPO ≤ 1h, RTO ≤ 4h |
| **Accessibility** | WCAG 2.1 AA |
| **Browser Support** | Latest two versions of Chrome, Edge, Safari, Firefox |
| **Mobile** | Responsive web in v1; native apps in v2 |

## 8. User Stories (Representative Sample)

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

**Dependencies**
- Cloud hosting environment (TBD per tenant requirements).
- SMS / email provider for notifications.
- Mapping provider for location links validation.
- Identity provider for SSO (optional).

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
| Cross-branch data leakage | High | Low | Strict tenancy isolation; consent enforcement; security review |

## 12. Release Plan (Phased)

**Phase 1 – MVP (Months 1–4)**
- Clinic onboarding, multi-branch core.
- EHR (encounters, prescriptions, basic vitals).
- Expense tracking.
- HR core (directory, attendance, leave).
- Bilingual UI.
- Admin dashboard, RBAC, audit log.

**Phase 2 – Operational Depth (Months 5–8)**
- Payroll exports and payslips.
- Advanced clinical features (drug interaction engine, lab orders, imaging attachments).
- Reporting and dashboards.
- Patient consent workflows.

**Phase 3 – Ecosystem (Months 9–12)**
- Patient portal.
- Telemedicine.
- Insurance claims.
- Lab and pharmacy integrations.
- Mobile apps.

## 13. Open Questions

1. Which markets define the v1 launch? (Compliance and language defaults depend on this.)
2. Will the platform be single-tenant per clinic group or multi-tenant SaaS?
3. Is offline-capable mode required for branches with unreliable connectivity?
4. What is the preferred drug catalog source per market?
5. Will SSO with hospital identity providers be required at launch?
6. Is there a preferred payroll system to integrate with first?

## 14. Glossary

- **Parent Clinic** – The top-level clinic entity that owns one or more branches.
- **Branch / Sister Clinic / Sub Clinic** – A clinic operated under a parent clinic.
- **Encounter** – A single clinical visit/interaction between a patient and clinician.
- **EHR** – Electronic Health Record.
- **RBAC** – Role-Based Access Control.
- **RTL** – Right-To-Left text direction (used for Arabic).
