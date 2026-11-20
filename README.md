<div align="center">

<img src="Docs/assets/clinic-lockup.svg" alt="Kiorly Clinic by Kiorex" height="84">

# Kiorly Clinic

**The clinic management platform of the Kiorly suite, built Arabic-first.**
Multi-clinic tenants, front desk and queues, encounters and prescriptions, HR, billing and reports, **home visits**, and the **Nurse edition** for home nursing and agencies. It works on its own; with Kiorex switched on it is also the only system of record for marketplace appointments.

![NestJS](https://img.shields.io/badge/NestJS-10-0D9488?logo=nestjs&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-6-3730A3?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%2B-0369A1?logo=postgresql&logoColor=white)
![React](https://img.shields.io/badge/React-18%20%2B%20Vite-0D9488?logo=react&logoColor=white)
![Node](https://img.shields.io/badge/node-%3E%3D20-3730A3?logo=node.js&logoColor=white)
![Languages](https://img.shields.io/badge/Arabic--first-AR%20%7C%20EN%20%7C%20RTL-0369A1)
![Edition](https://img.shields.io/badge/edition-Clinic%20%2B%20Nurse-E11D48)
![Unit tests](https://img.shields.io/badge/unit%20tests-795%20passing-0D9488)
![Providers](https://img.shields.io/badge/providers-mocked-E8735E)
![Tax authority](https://img.shields.io/badge/tax--authority%20reporting-never-E8735E)
![License](https://img.shields.io/badge/license-private-lightgrey)

[At a glance](#at-a-glance) · [Arabic-first](#arabic-first) · [Standalone vs Integrated](#standalone-vs-integrated) · [Modules](#modules-and-status) · [Nurse edition](#kiorly-nurse-edition) · [Home visits](#home-visits) · [Professions](#professions-and-scope-of-practice) · [Kiorex](#kiorex-integration) · [Plans](#plans-and-entitlements) · [Quick start](#quick-start) · [Docs](#where-to-read-next)

</div>

> **Synthetic data only.** Demo logins, URLs and reset steps: [Docs/TEST_DATA.md](Docs/TEST_DATA.md) (DEV ONLY, blocked in production). Repository: [github.com/mshall/kiorly-clinics-management](https://github.com/mshall/kiorly-clinics-management). Working branch: **`kiorex`** (never push it without founder approval).

---

## What and why

Kiorly Clinic is a full-stack **clinic management system** for healthcare groups that run one clinic or many: parent locations and branches share one tenant with users, patients, schedules, money and audit. Reception checks patients in and calls them from a live queue, clinicians document and sign encounters and prescriptions within their **scope of practice**, finance and HR see only what their role allows, and group admins control plans, flags and branding. The same codebase also ships **Kiorly Nurse**, an *edition* (not a separate product) for solo nurses and home-nursing agencies, and **home visits** for any clinic, both built on one shared safety package. When a clinic connects to **Kiorex** it publishes live slots and receives bookings, deposits and reviews over HMAC REST and outbox webhooks; without Kiorex nothing is missing.

<img src="Docs/assets/patient-journey.svg" alt="A visit in Kiorly Clinic: book, check in, call, visit, sign, bill" width="100%">

## At a glance

| | |
|---|---|
| **Product** | Kiorly Clinic by Kiorex (accent Clinic Teal `#0D9488`), with the **Nurse edition** (accent Nurse Rose `#E11D48`) in the same app |
| **API** | NestJS 10 + Prisma 6 + PostgreSQL, **modular monolith**, `:3010`, prefix `/api/v1`, Swagger `/docs`; 190 Prisma models, 85 enums, 179 migrations |
| **Web** | React 18 + Vite + TanStack Query + React Router + Tailwind + shadcn-style primitives, `:5174`; docs portal `:5175` |
| **Languages** | **Arabic and English**, full RTL, Jost and IBM Plex Sans Arabic, light, dark and a compact density mode |
| **Roles** | 13 user roles (group admin, branch manager, physician, nurse, receptionist, finance, HR, call centre ...) plus professions Physician, Dentist, Physiotherapist, Nurse, Assistant |
| **Editions and plans** | Edition `CLINIC` or `NURSE`; plans Lite, Pro, Clinic, Enterprise and Nurse Lite, Pro, Agency (see [Plans](#plans-and-entitlements)) |
| **Identity** | Staff login with JWT; "Sign in with Kiorex Passport" (OIDC, `aud=kiorly-clinic`, account linking, back-channel logout) |
| **Talks to** | Kiorex (marketplace HMAC API + outbox), Kiorly Lab and Pharmacy (lab orders, e-prescriptions), Passport (OIDC), control-plane flag snapshot |
| **Mobile** | A Kiorly mobile app (design in progress, see [Docs/MOBILE.md](Docs/MOBILE.md)); the web app is also an installable PWA |
| **Providers** | Mocked by default (`KIORLY_PROVIDER_MODE=mock`): WhatsApp, email, SMS, push, PSPs, AI; a dev inbox at `/dev/inbox` shows every message |
| **Standing rule** | No tax-authority reporting, ever (ADR-011): VAT lines and CSV or PDF exports only |

## Arabic-first

Arabic is not a translation layer here; it is a design constraint. Every screen is built right-to-left first and checked in both directions.

- **Every string exists in `ar.json` and `en.json`** (`apps/web/src/locales/`), enforced by locale-parity tests; names of patients, clinics, doctors and appointment types carry **Arabic and English** variants side by side.
- **RTL verified**: logical CSS properties, mirrored layout, charts and tables that read right to left, and axe accessibility sweeps in EN and AR, light and dark (`apps/web/scripts/axe-check.mjs`).
- **Arabic documents**: prescriptions, invoices, reports and family updates render in Arabic with embedded, shaped IBM Plex Sans Arabic.
- **Arabic lockup**: the logo reads «كيورلي للعيادات من كيوريكس» with the mark on the right (start) side; the artwork is never mirrored. The brand spelling is **كيوريكس**.
- **Open item**: the Arabic name of the Nurse edition is a placeholder until the founder decides question Q12 (NH-037).

<img src="Docs/assets/clinic-lockup-ar.svg" alt="Arabic lockup: Kiorly Clinic by Kiorex" height="64">

## Standalone vs Integrated

<img src="Docs/assets/standalone-vs-integrated.svg" alt="Kiorly Clinic standalone versus integrated with Kiorex, Passport, Pharmacy and Lab" width="100%">

| | **Standalone** | **Integrated** |
|---|---|---|
| Staff sign-in | Email and password (JWT), TOTP MFA | Same, plus **Sign in with Kiorex Passport** |
| Appointments | Booked by staff, phone, walk-in, the clinic's own booking link | The same, plus **Kiorex bookings** via holds with `Idempotency-Key`; Kiorly stays the only system of record (ADR-005) |
| Payments | Cash, InstaPay, Fawry, card (mock or real PSP per market) | Plus Kiorex Pay deposits, payouts and commission statements |
| Hand-offs | PDF and print | e-prescription to Pharmacy and lab orders to Lab (`PrescriptionIssued`, `LabOrderPlaced`) |
| Controls | Layered feature flags from the clinic's own platform admin | Flags also come from the signed Kiorex snapshot (30 s poll plus `flag.changed` push) |
| Safety controls | Identical | Identical |

Integration is configured per environment (`KIOREX_OUTBOX_WEBHOOK_URL`, marketplace client) and per clinic (listings, Kiorex tab); turning it off never removes data.

## Modules and status

Status icons: :white_check_mark: shipped, :test_tube: shipped on mock providers, :lock: launch-locked behind a human gate (code never records a gate), :hourglass_flowing_sand: proposed or needs a human decision. Sources: [Docs/CLINIC_PLATFORM_CAPABILITIES.md](Docs/CLINIC_PLATFORM_CAPABILITIES.md), [Docs/PRODUCT_EPIC_ROADMAP.md](Docs/PRODUCT_EPIC_ROADMAP.md) and the per-feature docs linked.

| Area | What it does | Status | Doc |
|---|---|---|---|
| Auth and access | JWT, refresh sessions, TOTP MFA, multi-role users, per-user nav and money visibility | :white_check_mark: | [AUTH_SESSIONS](Docs/AUTH_SESSIONS.md), [RBAC_MULTI_ROLE](Docs/RBAC_MULTI_ROLE.md) |
| Patients and Patient 360 | Registry, allergies, timeline, family merge, consent, record sharing | :white_check_mark: | [PATIENT_360_AND_SCHEDULING](Docs/PATIENT_360_AND_SCHEDULING.md), [PATIENT_CONSENT](Docs/PATIENT_CONSENT.md) |
| Scheduling | Slot engine, appointment types, series, waitlist, follow-ups, calendar (month, week, day) | :white_check_mark: | [PATIENT_360_AND_SCHEDULING](Docs/PATIENT_360_AND_SCHEDULING.md) |
| Front desk | Check-in, queue, board, waiting-room TV, auto exam room, global search | :white_check_mark: | [FRONT_DESK](Docs/FRONT_DESK.md) |
| Clinical | Encounters, specialty templates, vitals, Rx with safety checks, orders, sign and amend, specialty packs | :white_check_mark: | [CLINICAL_WORKFLOW](Docs/CLINICAL_WORKFLOW.md), [CLINICAL_RX_SAFETY](Docs/CLINICAL_RX_SAFETY.md), [CL06](Docs/CL06_CLINICAL_ORDERS.md), [CL07](Docs/CL07_SPECIALTY_PACKS.md) |
| Egypt drug database | Brand to ingredient catalogue, search, Rx autocomplete | :white_check_mark: | [EGYPT_DRUG_DATABASE](Docs/EGYPT_DRUG_DATABASE.md) |
| Billing, invoices, revenue, expenses | Visit fee ledger, invoices, deposits, cash drawer, installments, payers | :white_check_mark: :test_tube: | [CLINIC_BILLING](Docs/CLINIC_BILLING.md), [QA_MONEY_PATH](Docs/QA_MONEY_PATH.md) |
| HR and payroll | Employees, attendance, leave, payroll estimate | :white_check_mark: | [Docs/README](Docs/README.md) |
| Reports | Operations, finance, AR aging, branch P&L, exports, Kiorex impact | :white_check_mark: | [REPORTS_OPERATIONS](Docs/REPORTS_OPERATIONS.md), [REPORTS_EXPORTS](Docs/REPORTS_EXPORTS.md) |
| Messaging | WhatsApp, email, SMS reminders with consent and templates | :test_tube: | [MESSAGING_CONSENT](Docs/MESSAGING_CONSENT.md), [MOCK_PROVIDERS](Docs/MOCK_PROVIDERS.md) |
| AI assistant and scribe | Role-scoped assistant, scribe drafts, honest labels, plan gates | :white_check_mark: :test_tube: | [ASSISTANT](Docs/ASSISTANT.md), [AI_SCRIBE](Docs/AI_SCRIBE.md) |
| Plans, billing platform, credits | Plans, entitlements, trials, dunning, credit wallet, usage metering | :white_check_mark: | [PLANS_AND_PRICING](Docs/PLANS_AND_PRICING.md), [CREDIT_WALLET](Docs/CREDIT_WALLET.md) |
| Platform admin | Markets, plans, drug datasets, verifications, commission disputes, insights | :white_check_mark: | [PLATFORM_MARKETS_AND_INSIGHTS](Docs/PLATFORM_MARKETS_AND_INSIGHTS.md) |
| Clinician verification | Syndicate and licence checks, re-verification, ops queue | :white_check_mark: | [CLINICIAN_VERIFICATION](Docs/CLINICIAN_VERIFICATION.md) |
| Professions and scope | Capability matrix per market pack, `@RequiresScope` | :white_check_mark: CMO sign-off :hourglass_flowing_sand: | [PROFESSIONS_AND_SCOPE](Docs/PROFESSIONS_AND_SCOPE.md) |
| Home visits | Coverage, travel buffers, safety timer, SOS, address privacy | :lock: new bookings behind GHV1 and GHV2 | [HOME_VISITS](Docs/HOME_VISITS.md), [FIELD_VISIT](Docs/FIELD_VISIT.md) |
| Kiorly Nurse edition | Care plans, visit records, MAR, shifts, agency dispatch, lab samples | :white_check_mark: structured MAR and care plans :lock: (GKN1) | [NURSE_EDITION](Docs/NURSE_EDITION.md) |
| Kiorex connector | Listings, slots, holds, deposits, reviews, commission, record share, waitlist | :white_check_mark: :test_tube: | [KIOREX_CONNECTOR](Docs/KIOREX_CONNECTOR.md) |
| Self-serve signup and onboarding | Phone OTP signup, trial engine, onboarding wizard, field reps | :white_check_mark: | [PUBLIC_SIGNUP](Docs/PUBLIC_SIGNUP.md), [ONBOARDING](Docs/ONBOARDING.md), [TRIAL_ENGINE](Docs/TRIAL_ENGINE.md) |
| Compliance and security | Consent, legal pack, audit, residency, backup drills, MFA policy | :white_check_mark: PDPC and counsel gates :hourglass_flowing_sand: | [COMPLIANCE_CONTROLS](Docs/COMPLIANCE_CONTROLS.md), [SC02_PDPC_EGYPT](Docs/SC02_PDPC_EGYPT.md) |
| Customer support | Tickets, log tracking with resolution hints | :white_check_mark: | [SUPPORT_OPS](Docs/SUPPORT_OPS.md) |

<details>
<summary><b>What "launch-locked" means</b></summary>

Every capability ships ON and can be switched OFF at platform, market or organisation scope (ADR-023); OFF answers `403 FEATURE_DISABLED {key, scope}` and never hides data. A **launch-locked** flag (for example `clinic.home_visits`, `nurse.care_plans`, `nurse.mar`, `nurse.individual_kiorex_listing`) is effective only when a human has recorded the gate evidence in the Kiorex control plane (counsel memo, CMO-signed protocol). **Safety controls are never flags** (ADR-025): home-visit safety, scope of practice, MAR checks, lab-sample checks, critical vitals escalation, audit and tenant isolation. A test (`ff-safety-never-flags.node.test.ts`) fails CI if a safety path reads a flag.
</details>

## Architecture

```mermaid
flowchart LR
  subgraph Web[apps/web :5174]
    FD[Front desk, board, TV]
    CL[Clinical, Rx, billing, HR, reports]
    NU[Nurse edition and home visits]
    PW[Public booking page and PWA]
  end
  API[NestJS API :3010<br/>modular monolith, /api/v1]
  DB[(PostgreSQL)]
  FV[@kiorly/field-visit<br/>safety package]
  FF[feature-flags<br/>layered flags + safety list]
  SC[scope-of-practice<br/>RequiresScope]
  OB[Outbox + HMAC dispatcher]
  PR[providers<br/>mock or real adapters]
  KX[Kiorex :4000]
  PP[Kiorex Passport :4400]
  PH[Kiorly Pharmacy :3100]
  LB[Kiorly Lab :3200]
  FD --> API
  CL --> API
  NU --> API
  PW --> API
  API --> DB
  API --> FV
  API --> FF
  API --> SC
  API --> PR
  API --> OB
  OB -- webhooks --> KX
  KX -- HMAC REST /marketplace/v1 --> API
  KX -. "flag snapshot and flag changed" .-> FF
  API -. OIDC .-> PP
  OB -. PrescriptionIssued .-> PH
  OB -. LabOrderPlaced .-> LB
```

The API is a **modular monolith**: bounded contexts are Nest modules under `apps/api/src/*` that import each other only through public entry points ([Docs/MODULAR_MONOLITH.md](Docs/MODULAR_MONOLITH.md)). CI runs every `src/**/*.node.test.ts` and `*.integration.test.ts` by glob.

### Key flow: a Kiorex booking

```mermaid
sequenceDiagram
  participant Pt as Patient (Kiorex)
  participant X as Kiorex API
  participant K as Kiorly Clinic
  participant Staff as Clinic staff
  Pt->>X: choose slot
  X->>K: POST /marketplace/v1/holds (HMAC, Idempotency-Key)
  K-->>X: hold (slot engine, buffers, coverage)
  X->>K: POST /marketplace/v1/bookings (confirm, deposit reference)
  K-->>X: outbox status event: confirmed
  Staff->>K: check in, visit, finalize
  K-->>X: outbox status event: completed (commission, review eligibility)
```

### Key flow: a home visit

```mermaid
stateDiagram-v2
  [*] --> REQUESTED
  REQUESTED --> CONFIRMED: address confirmed, rules pass
  CONFIRMED --> ON_MY_WAY: depart
  ON_MY_WAY --> ARRIVED: arrive (check-in)
  ARRIVED --> FINISHED: encounter finalized
  ARRIVED --> ABORTED_UNSAFE: unsafe abort, never a no-show
  CONFIRMED --> CANCELLED
  CONFIRMED --> NO_SHOW
  FINISHED --> [*]
  ABORTED_UNSAFE --> [*]
```

### Data model overview

```mermaid
erDiagram
  Tenant ||--o{ Clinic : owns
  Tenant ||--o{ User : employs
  Tenant ||--o{ Patient : registers
  Clinic ||--o{ Appointment : schedules
  Patient ||--o{ Appointment : books
  Appointment ||--o| Encounter : documented_in
  Appointment ||--o| HomeVisit : may_be
  Encounter ||--o{ VitalsObservation : records
  Appointment ||--o{ Invoice : billed
  CarePlan ||--o{ HomeVisit : generates
  ClinicalOrder ||--o| LabSampleCollection : collected_as
  User ||--o{ ProfessionalRegistration : verified_by
  Tenant }o--|| Plan : subscribes
  Plan ||--o{ PlanEntitlement : grants
  Tenant ||--o{ OutboxEvent : emits
```

190 models in [`apps/api/prisma/schema.prisma`](apps/api/prisma/schema.prisma); migrations are the single source of truth for schema.

## Kiorly Nurse edition

One codebase, one database, one API and one Kiorex connector: `Organization.edition = CLINIC | NURSE` (ADR-031). There is **no separate `kiorly-nurse` repo**. Only the Kiorex super admin changes an edition; a clinic that employs nurses stays CLINIC. Solo practices and agencies are distinguished by `nurseTenantKind` (ADR-032). Branding switches to Nurse Rose and nurse terminology (Clinic becomes Practice or Agency, Encounter becomes Visit record); `nurse.kiorly.com` selects the edition only before sign-in.

| Capability | What it does | Gate |
|---|---|---|
| Edition and sign-up | Phone-OTP sign-up, solo or agency, service catalogue seeded as HOME visit types | `nurse.edition`, `nurse.individual_tenants` |
| Care plans | Services x frequency x duration generate real home visits; pause, resume, extend, end with discharge note | `nurse.care_plans` :lock: GKN1 |
| Visit record and vitals | Checklist, assessment, intervention, evaluation; out-of-range flags; **critical value needs an escalation entry before signing** | never a flag |
| Medication administration (MAR) | **No order, no administration**; allergy and duplicate checks; controlled medicines need an order and a witness | checks never flagged; structured screens `nurse.mar` :lock: GKN1 |
| Family updates | WhatsApp template with a link only, no PHI, behind an expiring token and consent | `nurse.family_updates` |
| Private-duty shifts | 8, 12 or 24 h shifts, geostamped check-in and out, handover note | `nurse.private_duty_shifts` |
| Agency dispatch | Roster, zones, skills, pay rates, dispatch guard (only VERIFIED nurses in zone; aides never dispatchable) | entitlement `nurse_agency` |
| Lab samples (KNLAB01) | Transcribe a doctor's lab order, record collection with tube labels and two identifier matches, hand off to Kiorly Lab | `nurse_lab_samples`, flag `clinic.lab_order_handoff` |
| Kiorex listing | Agencies list; solo nurses only with `nurse.individual_kiorex_listing` (GKN2) **and** identity evidence | :lock: GKN2 |

Nurse plans are **PROPOSED** (NEEDS_HUMAN, NH-036): `NURSE_LITE`, `NURSE_PRO`, `NURSE_AGENCY`, no `PlanPrice` rows and no published price. Home-visit safety is in every plan including Lite. Demo tenants: `npm run db:seed:nurse -w api` and the Rev 2.3 demo set. Full detail: [Docs/NURSE_EDITION.md](Docs/NURSE_EDITION.md).

| Nurse on a phone | Care plan | Lab order |
|---|---|---|
| <img src="Docs/assets/shots/phone-today.jpg" alt="Today route on a phone" height="320"> | <img src="Docs/assets/shots/phone-care-plan.jpg" alt="Care plan detail on a phone" height="320"> | <img src="Docs/assets/shots/phone-lab-order.jpg" alt="Lab sample order on a phone" height="320"> |

## Home visits

Built on the shared `@kiorly/field-visit` package ([Docs/FIELD_VISIT.md](Docs/FIELD_VISIT.md), ADR-030). **New home bookings are gated by `clinic.home_visits`, launch-locked behind GHV1 (counsel memo) and GHV2 (CMO-signed safety protocol)**; booked visits, SOS, safety prompts and address masking are never gated.

| Concern | How it works |
|---|---|
| Coverage and rules | Coverage districts, optional max travel minutes, daily cap, home hours, 30/30 travel buffers; `422 OUT_OF_COVERAGE` |
| Address privacy | AES-256-GCM with the tenant as AAD; visible to the assigned clinician and org admins from CONFIRMED, **masked 24 h after the visit**; audit redacts address and location |
| Execution | Route list in time order, legs and navigation link (Pro and up), depart, arrive (= check-in), finish (= complete) |
| Safety | Prompt at planned end + 30 min, alert to the organisation safety contact 10 min later, escalation if unacknowledged; **SOS** shows 123 and 122; unsafe abort is never a no-show and holds the deposit for review |
| Money | Home surcharge is a separate line and never enters commission or revenue share; cash at home reconciles through the cashier shift |
| First visit rule | A new patient needs a Kiorex-verified phone or a deposit |

## Professions and scope of practice

Scope of practice and professional verification are **safety controls, never flags** (ADR-029). Each user has a profession; the server enforces `@RequiresScope("<capability>")` and answers `403 SCOPE_NOT_ALLOWED {capability, profession}`; the web only hides. The matrix lives in market-pack data (versioned, CMO sign-off pending, `cmoSignOff: null`).

| Capability | Physician | Dentist | Physiotherapist | Nurse | Assistant |
|---|:-:|:-:|:-:|:-:|:-:|
| Appointments, patients, payments (`practice.core`) | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | |
| Prescribe (`rx.prescribe`) | :white_check_mark: | :white_check_mark: | | | |
| Lab and radiology orders | :white_check_mark: | :white_check_mark: | | | |
| SOAP template | :white_check_mark: | | | | |
| Dental chart template | | :white_check_mark: | | | |
| Physio template | | | :white_check_mark: | | |
| Nursing template | | | | :white_check_mark: | |
| Administer medication (MAR) | :white_check_mark: | | | :white_check_mark: | |
| Perform home visits | :white_check_mark: | | :white_check_mark: | :white_check_mark: | |
| Vitals, outcome measures, session notes | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| Sign or amend an encounter | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | |

Verification per profession (syndicate card, ministry licence, extra documents for solo nurses) feeds the ops queue and the public badge; changes to name, profession or specialty force re-verification, and licence expiry triggers reminders ([Docs/CLINICIAN_VERIFICATION.md](Docs/CLINICIAN_VERIFICATION.md)).

## Kiorex integration

Kiorly Clinic is the **only system of record for appointments**. Kiorex books against it with holds and idempotency keys. Detail pages: [Docs/KIOREX_CONNECTOR.md](Docs/KIOREX_CONNECTOR.md) (hub), [KIOREX_MARKETPLACE](Docs/KIOREX_MARKETPLACE.md), [BOOKING_ATTRIBUTION](Docs/BOOKING_ATTRIBUTION.md), [KIOREX_FEES](Docs/KIOREX_FEES.md), [KIOREX_COMMISSION_CHARGES](Docs/KIOREX_COMMISSION_CHARGES.md), [REPORTS_KIOREX_IMPACT](Docs/REPORTS_KIOREX_IMPACT.md), [KX11_RECORD_SHARE](Docs/KX11_RECORD_SHARE.md), [QA_KIOREX_CONTRACT](Docs/QA_KIOREX_CONTRACT.md).

| Capability | Status |
|---|---|
| Marketplace listings, slots, holds, booking intake, reschedule and cancel policies | :white_check_mark: |
| Outbox status events, signed webhooks, replay | :white_check_mark: |
| Deposits and prepayments (Kiorex Pay), payouts, commission statements | :white_check_mark: :test_tube: |
| Verified reviews, waitlist offers, liquidity counts | :white_check_mark: |
| Consent-based record sharing, e-prescription and lab-order hand-offs | :white_check_mark: |
| Sign in with Kiorex Passport, back-channel logout | :white_check_mark: |
| Flag control plane (snapshot client, `flag.changed`, `FEATURE_DISABLED`) | :white_check_mark: |
| Contract tests against `@kiorex/contracts` | :white_check_mark: (Kiorex CI wiring NH-019) |

Local dev seed (`db:seed`) creates a marketplace client, a Kiorex dev tenant with two clinics and three live doctors; the dev secrets are in [Docs/KIOREX_CONNECTOR.md](Docs/KIOREX_CONNECTOR.md) and `apps/api/.env.example` (dev only).

## Plans and entitlements

Source of truth: `apps/api/src/entitlements/plans-matrix.ts`; hub: [Docs/PLANS_AND_ENTITLEMENTS.md](Docs/PLANS_AND_ENTITLEMENTS.md) (a test keeps the doc and the code equal). Public prices are versioned per market ([Docs/PLANS_AND_PRICING.md](Docs/PLANS_AND_PRICING.md)); none are fixed here. Plan gates answer `402`; flags answer `403 FEATURE_DISABLED`.

| Entitlement | Lite | Pro | Clinic | Enterprise |
|-------------|------|-----|--------|------------|
| `max_clinicians` | 2 | 10 | 50 | Unlimited |
| `max_branches` | 1 | 5 | 25 | Unlimited |
| `max_assistant_seats` | 2 | 10 | 30 | Unlimited |
| `mod_clinical` |  | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| `mod_front_desk` |  | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| `mod_operations` |  |  | :white_check_mark: | :white_check_mark: |
| `mod_invoices` |  | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| `mod_revenue` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| `mod_expenses` |  | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| `mod_hr` |  | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| `mod_payroll` |  |  | :white_check_mark: | :white_check_mark: |
| `mod_reports` |  | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| `mod_messaging` |  | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| `mod_integrations` |  |  | :white_check_mark: | :white_check_mark: |
| `mod_data_explorer` |  |  | :white_check_mark: | :white_check_mark: |
| `ai_assistant` |  | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| `ai_scribe` |  |  | :white_check_mark: | :white_check_mark: |
| `deposits` |  | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| `multi_branch` |  |  | :white_check_mark: | :white_check_mark: |
| `whatsapp_reminders` |  | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| `card_payments` |  | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| `instapay` |  | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| `fawry` |  | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| `dedicated_support` |  |  |  | :white_check_mark: |
| `pack_dental` |  |  |  |  |
| `pack_aesthetics` |  |  |  |  |
| `pack_physio` |  |  |  | :white_check_mark: |
| `home_route_view` |  | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| `home_dispatch` |  |  | :white_check_mark: | :white_check_mark: |
| `nurse_family_updates` |  |  |  | :white_check_mark: |
| `nurse_private_duty_shifts` |  |  |  | :white_check_mark: |
| `nurse_lab_samples` |  |  |  | :white_check_mark: |
| `nurse_agency` |  |  |  | :white_check_mark: |


Nurse-edition plans (`NURSE_LITE`, `NURSE_PRO`, `NURSE_AGENCY`) reuse the `nurse_*`, `home_*` and module entitlements and are **PROPOSED** only. A `SUSPENDED` subscription turns entitlements off; support can override per tenant (`TenantEntitlementOverride`).

## Screens

Captured from the running app with synthetic data (English, light theme first, then Arabic RTL and dark). Full before and after sets are in the workspace `_docs/ui-review/kiorly-clinic` and `/kiorly-nurse`.

| Dashboard | Appointments | Front desk board |
|---|---|---|
| <img src="Docs/assets/shots/home.jpg" alt="Dashboard" width="300"> | <img src="Docs/assets/shots/appointments.jpg" alt="Appointments" width="300"> | <img src="Docs/assets/shots/front-desk.jpg" alt="Front desk board" width="300"> |

| Patients | Revenue | Reports |
|---|---|---|
| <img src="Docs/assets/shots/patients.jpg" alt="Patients" width="300"> | <img src="Docs/assets/shots/revenue.jpg" alt="Revenue" width="300"> | <img src="Docs/assets/shots/reports.jpg" alt="Reports" width="300"> |

| Arabic dashboard (RTL) | Arabic appointments (RTL) | Dark theme |
|---|---|---|
| <img src="Docs/assets/shots/home-ar.jpg" alt="Arabic dashboard" width="300"> | <img src="Docs/assets/shots/appointments-ar.jpg" alt="Arabic appointments" width="300"> | <img src="Docs/assets/shots/home-dark.jpg" alt="Dark dashboard" width="300"> |

| Nurse: today | Nurse: care plans | Nurse: MAR | Nurse: safety |
|---|---|---|---|
| <img src="Docs/assets/shots/nurse-today.jpg" alt="Nurse today route" width="220"> | <img src="Docs/assets/shots/nurse-care-plans.jpg" alt="Care plans" width="220"> | <img src="Docs/assets/shots/nurse-mar.jpg" alt="MAR" width="220"> | <img src="Docs/assets/shots/nurse-safety.jpg" alt="Safety" width="220"> |

## Quick start

Prerequisites: Node 20+, npm 9+, PostgreSQL (the workspace cluster on `:5433`, or Docker Compose on `:5432`; see [full local setup](#local-setup) below).

```bash
npm install
cp apps/api/.env.example apps/api/.env   # set DATABASE_URL; never commit .env
npm run db:setup                         # migrate + full demo seed
npm run dev                              # API :3010 + web :5174 + docs portal :5175
```

| Service | URL | Command |
|---|---|---|
| API | http://localhost:3010/api/v1 | `npm run dev:api` (`/health/live`, `/health/ready`) |
| Swagger | http://localhost:3010/docs | on by default in development |
| Web | http://localhost:5174 | `npm run dev:web` |
| Docs portal | http://localhost:5175 | `npm run docs:dev` |
| Nurse e2e stack | OPEN `:3011` / `:5185`, locked `:3012` / `:5186` | `bash scripts/nurse-e2e-stack.sh` |

Demo users, tenants and what each sees (including the Nurse personas and home-visit data): [Docs/TEST_DATA.md](Docs/TEST_DATA.md) and [Docs/Test_Data_Users.md](Docs/Test_Data_Users.md). Reset the demo dataset with `npm run db:seed:demo -- --reset` inside `apps/api`.

## Tests

```bash
npm run test:unit            # api unit (795 passing, 20 Nov 2026), web unit, field-visit package, infra
npm run test:integration     # 107 integration test files against the real DB
npm run test:money-coverage  # money-path coverage gate (>= 85 %)
npm run test:integration-smoke
npm run test:e2e             # Playwright (about 59 spec files in apps/web/e2e), EN and AR
npm run test:perf            # SLO load smoke on /health/live
npm run typecheck && npm run lint
```

| Suite | Count | Notes |
|---|---|---|
| API unit (`*.node.test.ts`) | **795 passing** | includes `ff-safety-never-flags`, `scope-of-practice`, `no-tax-authority`, plan-matrix equality |
| API integration (`*.integration.test.ts`) | 107 files | real DB; `prsop-scope-contract`, marketplace, money paths, mobile, nurse |
| Playwright | ~59 spec files | golden flow, RBAC, branding, Nurse OPEN and gated projects |
| Perf | load smoke, slot load, Lighthouse budget | `scripts/` |

Merge is by pull request with the **CI test** check required (`bash scripts/apply-github-branch-protection.sh`).

## Folder map

```text
clinics-management/
├── apps/
│   ├── api/         NestJS API: src/<bounded context>/, prisma/ (schema, migrations, seeds), openapi/
│   ├── web/         React SPA: src/features/*, locales/ (ar, en), brand/, e2e/ (Playwright)
│   └── docs/        documentation portal (Vite, :5175)
├── packages/
│   └── field-visit/ @kiorly/field-visit: home-visit and collector safety package
├── Docs/            product, API, safety, runbooks, assets/ (this README's images)
├── Design/          UI design catalogue, Clinical OS explorer
├── infra/           OpenTofu stacks (nothing applied) and infra tests
├── platform/        market and residency data
├── scripts/         db, sync, CI, deploy helpers, perf
└── perf/            load-test scenarios
```

## Environment variables

Minimal local set; the full commented list is in [`apps/api/.env.example`](apps/api/.env.example) (dev defaults, never reuse in staging or production).

| Variable | Purpose | Default (dev) |
|---|---|---|
| `DATABASE_URL` | Postgres connection | local cluster or Compose |
| `JWT_SECRET` | JWT signing; strong in any shared environment | dev placeholder |
| `PORT`, `APP_WEB_URL`, `SWAGGER_ENABLED` | API port, web origin, Swagger | `3010`, `http://localhost:5174`, on |
| `KIORLY_PROVIDER_MODE` (and per integration `_EMAIL`, `_WHATSAPP`, `_SMS`, `_PUSH`, `_PSP`) | `mock` or `real` adapters | `mock` |
| `KIOREX_OUTBOX_WEBHOOK_URL`, `KIOREX_OUTBOX_WEBHOOK_SECRET` | Where marketplace events go | unset |
| `HOME_VISIT_ADDRESS_ENCRYPTION_KEY` | AES-256-GCM key for home addresses (required in production) | dev only |
| `CLINICIAN_PII_ENCRYPTION_KEY` | Encrypts clinician national ID at rest | dev only |
| `KIOREX_OIDC_REDIRECT_URI`, `NURSE_WEB_URL` | Passport redirect URIs per edition host | local |
| `SIGNUP_OTP_DEV_CODE` | Fixed signup OTP for local and E2E | dev only |
| `UPLOAD_STORAGE`, `S3_UPLOAD_BUCKET`, `AWS_REGION` | Local or private S3 uploads | local |
| `VITE_API_URL` (web) | API base when not same-origin | empty (Vite proxies `/api`) |

## Security notes

- **Safety controls are never flags** and are test-enforced: home-visit safety, scope of practice, MAR and lab-sample checks, critical-vitals escalation, audit, tenant isolation.
- **Server enforces, web hides**: RBAC, scope of practice and entitlements are checked in the API.
- **Sensitive fields encrypted at rest**: home-visit addresses (AES-256-GCM, tenant AAD, masked after 24 h), clinician national ID; audit metadata redacts address and location.
- **No PHI in logs, analytics, family updates or notifications**; consent is checked before any share.
- **Privileged MFA** (TOTP) on production, login rate limits, refresh-session revocation.
- **No secrets in git**: `.env` ignored, demo seeds blocked in production (`ALLOW_DEMO_SEED`, `DEMO_SEED_ALLOWED` plus a non-production environment).
- **Mock providers by default**; real providers are wired in a dedicated pre-launch pass, staging first ([Docs/MOCK_PROVIDERS.md](Docs/MOCK_PROVIDERS.md)).
- **No tax-authority integration** of any kind ([Docs/NO_TAX_AUTHORITY_REPORTING.md](Docs/NO_TAX_AUTHORITY_REPORTING.md)).
- **No deploy** to AWS until the founder says so; pushing `kiorex` needs founder approval.

## Glossary

| Term | Meaning |
|---|---|
| **Tenant / organisation** | A healthcare group with its own users, clinics, patients and data |
| **Edition** | `CLINIC` or `NURSE`; one codebase, different terminology, plans and flags |
| **Profession** | Physician, Dentist, Physiotherapist, Nurse or Assistant; decides scope of practice |
| **Scope of practice** | Server-enforced capability matrix; `403 SCOPE_NOT_ALLOWED` |
| **Hold** | Temporary slot reservation made by Kiorex before confirmation |
| **Outbox** | Table written in the same transaction as a change and delivered reliably |
| **Launch-locked flag** | A flag that works only with human-recorded gate evidence |
| **MAR** | Medication administration record |
| **KNLAB01** | A nurse collects a sample against a doctor's order and hands it to Kiorly Lab |
| **Never-flag** | A safety control no flag can switch off (ADR-025) |

## Where to read next

| Read | For |
|---|---|
| [Docs/README.md](Docs/README.md) | The full documentation index (all documents, admin cheat sheet, roadmap) |
| [Docs/TEST_DATA.md](Docs/TEST_DATA.md) · [Docs/Test_Data_Users.md](Docs/Test_Data_Users.md) | Synthetic QA data, logins, reset |
| [Docs/MOBILE.md](Docs/MOBILE.md) | Backend contract for the Kiorly mobile app (design in progress) |
| [Docs/NURSE_EDITION.md](Docs/NURSE_EDITION.md) · [Docs/HOME_VISITS.md](Docs/HOME_VISITS.md) · [Docs/PROFESSIONS_AND_SCOPE.md](Docs/PROFESSIONS_AND_SCOPE.md) | Rev 2.3 features |
| [Docs/KIOREX_CONNECTOR.md](Docs/KIOREX_CONNECTOR.md) | Everything about the Kiorex link |
| [Docs/FEATURE_FLAGS.md](Docs/FEATURE_FLAGS.md) | Layered flags, safety list |
| [Docs/PLANS_AND_ENTITLEMENTS.md](Docs/PLANS_AND_ENTITLEMENTS.md) | Entitlement matrix |
| [Docs/MODULAR_MONOLITH.md](Docs/MODULAR_MONOLITH.md) | Bounded contexts and import rules |
| [Docs/Clinic_Management_System_PRD.md](Docs/Clinic_Management_System_PRD.md) · [RFC](Docs/Clinic_Management_System_RFC.md) | Requirements and technical design |
| [Docs/KIORLY_NEEDS_HUMAN.md](Docs/KIORLY_NEEDS_HUMAN.md) | Open decisions and sign-offs |
| [Docs/AWS_Cloud_Deployment_Guide.md](Docs/AWS_Cloud_Deployment_Guide.md) · [Docs/runbooks/](Docs/runbooks) | Deployment notes and operational runbooks |

<details>
<summary><b>Complete document index (every file in Docs/)</b></summary>

The tables above link the main documents; these are the rest, grouped. [Docs/README.md](Docs/README.md) stays the canonical index.

**Money, billing and plans**: [BILLING_AND_CREDITS](Docs/BILLING_AND_CREDITS.md) · [AUDIT_BILLING](Docs/AUDIT_BILLING.md) · [COMMERCIAL_CONFIG](Docs/COMMERCIAL_CONFIG.md) · [DUNNING](Docs/DUNNING.md) · [KIORLY_INVOICES](Docs/KIORLY_INVOICES.md) · [KIORLY_PAYMENTS](Docs/KIORLY_PAYMENTS.md) · [MONTHLY_SETTLEMENT](Docs/MONTHLY_SETTLEMENT.md) · [MONTHLY_STATEMENT](Docs/MONTHLY_STATEMENT.md) · [USAGE_METERING](Docs/USAGE_METERING.md) · [RP04_AR_AGING_BRANCH_PL](Docs/RP04_AR_AGING_BRANCH_PL.md) · [MN05_CLAIMS](Docs/MN05_CLAIMS.md) · [SALES_KIT](Docs/SALES_KIT.md) · [FD-00_MARKET_TAX_DEFAULTS](Docs/FD-00_MARKET_TAX_DEFAULTS.md)

**Compliance, privacy, residency and go-live**: [LEGAL_PACK](Docs/LEGAL_PACK.md) · [RECORDS_OF_PROCESSING_EG](Docs/RECORDS_OF_PROCESSING_EG.md) · [SC-01_FRANKFURT_RESIDENCY](Docs/SC-01_FRANKFURT_RESIDENCY.md) · [DATA_RESIDENCY_DECISION](Docs/DATA_RESIDENCY_DECISION.md) · [SUB_PROCESSORS_BY_MARKET](Docs/SUB_PROCESSORS_BY_MARKET.md) · [SC04_MFA_POLICY](Docs/SC04_MFA_POLICY.md) · [SC05_TENANT_EXPORT](Docs/SC05_TENANT_EXPORT.md) · [SC06_RATE_LIMIT_WAF_SECRETS](Docs/SC06_RATE_LIMIT_WAF_SECRETS.md) · [SC08_BACKUP_RESTORE_DRILL](Docs/SC08_BACKUP_RESTORE_DRILL.md) · [SC08_BACKUP_RESTORE_DRILL_REPORT](Docs/SC08_BACKUP_RESTORE_DRILL_REPORT.md) · [EGYPT_GO_LIVE](Docs/EGYPT_GO_LIVE.md) · [MARKET_GO_LIVE_TEMPLATE](Docs/MARKET_GO_LIVE_TEMPLATE.md) · [MULTI_MARKET](Docs/MULTI_MARKET.md) · [MULTI_MARKET_BACKLOG](Docs/MULTI_MARKET_BACKLOG.md)

**Retired tax-authority pages (history only, no tax-authority reporting exists)**: [FD-02_ETA_RETIRED](Docs/FD-02_ETA_RETIRED.md) · [MN04_ETA_PRODUCTION](Docs/MN04_ETA_PRODUCTION.md)

**AI and messaging**: [AI_HONEST_LABELS](Docs/AI_HONEST_LABELS.md) · [AI_PLAN_GATES](Docs/AI_PLAN_GATES.md) · [MS06_AI_RECEPTIONIST](Docs/MS06_AI_RECEPTIONIST.md) · [MESSAGING_EMAIL](Docs/MESSAGING_EMAIL.md) · [MESSAGING_WHATSAPP](Docs/MESSAGING_WHATSAPP.md)

**Quality, operations and infrastructure**: [QA_GOLDEN_FLOW](Docs/QA_GOLDEN_FLOW.md) · [QA_LOAD_DEVICE_PERF](Docs/QA_LOAD_DEVICE_PERF.md) · [QA_OBSERVABILITY](Docs/QA_OBSERVABILITY.md) · [QA_STAGING](Docs/QA_STAGING.md) · [HB07_EGRESS](Docs/HB07_EGRESS.md) · [OPENTOFU_MIGRATION](Docs/OPENTOFU_MIGRATION.md)

**UX, help and design**: [GUIDE_BOOK](Docs/GUIDE_BOOK.md) · [HELP_CENTRE](Docs/HELP_CENTRE.md) · [UX01_PWA](Docs/UX01_PWA.md) · [UX02_MOBILE_DOCTOR](Docs/UX02_MOBILE_DOCTOR.md) · [UX03_ARABIC_RTL_QA](Docs/UX03_ARABIC_RTL_QA.md) · [UX04_THERMAL_PRINTING](Docs/UX04_THERMAL_PRINTING.md) · [UI_DESIGN_DIRECTIONS](Docs/UI_DESIGN_DIRECTIONS.md)

**Build tracking**: [kiorly-cursor-build-sequence](Docs/kiorly-cursor-build-sequence.md) · [KIORLY_BUILD_LOG](Docs/KIORLY_BUILD_LOG.md)

</details>

---

# Full reference

The sections below are the original platform reference, kept intact and updated where ports changed (the local API runs on `3010` and the web app on `5174`).

## System overview

The platform is designed for **healthcare groups** that operate **one or many clinics** (parent locations and branches). Each **tenant** owns users, clinics, patients, and operational data. Users authenticate with **JWT** and see navigation and actions according to **role-based access control (RBAC)**.

Typical flows:

- **Front desk / nurses:** check-in → waiting queue → call ticket → **start visit** (auto exam room) → encounter; live board and waiting-room TV ([`Docs/FRONT_DESK.md`](Docs/FRONT_DESK.md)).
- **Physicians:** patients, encounters, **own** appointments schedule, doctor revenue, clinical documentation.
- **Finance:** expenses, revenue (where permitted), reports.
- **HR:** employees, attendance, leave.
- **Group admin:** tenant settings, clinics, users, feature flags, cross-tenant views where implemented.

---

## Features and modules

### Authentication & access

- JWT login; session stored in the SPA.
- Roles include (among others): `GROUP_ADMIN`, `BRANCH_MANAGER`, `PHYSICIAN`, `NURSE`, `RECEPTIONIST`, `HR_OFFICER`, `FINANCE_OFFICER`.
- Example: **Revenue** is hidden from roles such as nurse and receptionist (see `apps/web/src/lib/permissions.ts`).

### Dashboard

- KPIs and summaries driven by a configurable **reporting date range** (shared store for dashboard/reports).

### Patients

- Register and list patients; advanced filters (MRN, phone, name, national ID, gender).
- Column filters on the main table; **home branch** and demographics.
- Patient detail view; **allergies** section (paginated table) with catalog multi-select + **Other** on registration and new encounter.

### Encounters (clinical visits)

- List and open encounters; structured visit data, diagnoses, medications, **document uploads** (e.g. lab / radiology).
- Optional **specialty form templates** (org-wide EN/AR defaults per specialty + clinic customs under **Clinics → Settings**); see [`Docs/CLINICAL_WORKFLOW.md`](Docs/CLINICAL_WORKFLOW.md).
- Finalization workflow aligned with the API.
- Creating an encounter captures a **visit fee** (default from tenant admin **default visit fee**); amounts greater than zero post a revenue ledger line (`VISIT_FEE`).

### Front desk (reception)

- **Quick check-in** on appointments (ticket, `WAITING` queue, optional preferred exam room and visit payment — cash, InstaPay, or Fawry).
- **Live board** and **waiting-room screen**; **start visit** opens encounter and assigns a room; **finalize encounter** frees the room automatically.
- See [`Docs/FRONT_DESK.md`](Docs/FRONT_DESK.md).

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

### In-product AI assistant

- Role-scoped floating chat: live data, how-to playbook with **Navigate** / **Open patient** actions, optional OpenAI for phrasing.
- Rich markdown rendering in the widget (headings, lists, metric-style revenue lines).
- Gated by layered flag **`ai_assistant`** (platform · market · organization) — see `Docs/FEATURE_FLAGS.md`.
- See `Docs/ASSISTANT.md` and `Docs/ASSISTANT_OPENAI_SETUP.md`.

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

- **Tabs:** clinics & tenants, **organization users**, organization patients, organization & settings, **insights & performance**, governance (group admin).
- **Organization users:** search by email or display name, **filter by role**, create/edit/delete users, clinic assignment, bulk delete.
- Current tenant overview, **default visit fee**, audit tail, **organization feature flags** (overrides on country/platform defaults), clinic creation (parent/branch), clinic directory.
- **Clinic regulatory IDs:** each branch → **Settings** → **License & tax authority** (market-specific labels for invoicing and fiscal) — see `Docs/CLINIC_TAX_AND_LICENSING.md`.
- **Insights & performance:** audit volumes, clinical/financial counters, top actions/resources, staff leaderboard (configurable date range).
- **All tenants** list and **data explorer** for platform super admin / break-glass group admin (see [Test_Data_Users.md](Docs/Test_Data_Users.md)).

### Customer support

- **Tickets** across product modules with status workflow and timeline.
- **Log tracking:** searchable audit trail with **resolution hints**; open a ticket from any log row.
- Roles: group admin, group supervisor, branch/clinic admin, call center (sidebar **Customer support**).

### Profile & HR

- **Profile:** any signed-in user can upload a profile picture (crop + server storage).
- **HR:** employees list; employee HR record; **employee profile** view with back navigation to the list and HR record.

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
| API | NestJS 10, Prisma 6, PostgreSQL (**modular monolith** — bounded contexts as Nest modules) |
| Auth | Passport JWT, `bcryptjs` |
| Web | React 18, Vite, TanStack Query, React Router, Tailwind, shadcn-style UI primitives |
| Monorepo | npm workspaces (`apps/api`, `apps/web`) |

See **[Docs/MODULAR_MONOLITH.md](./Docs/MODULAR_MONOLITH.md)** for bounded contexts, import rules, and microservice extraction. CI runs all `src/**/*.node.test.ts` via `npm run test:unit -w api` (glob — add a `*.node.test.ts` file and it is picked up automatically). Merge via PR with **CI test / CI test** required (`bash scripts/apply-github-branch-protection.sh` — needs `gh` + admin; enforces for admins too).

**Local dev traffic:** Vite dev server proxies `/api` → `http://localhost:3010` (see `apps/web/vite.config.ts`). The SPA calls relative `/api/v1/...` unless `VITE_API_URL` is set.

---

## Prerequisites

- **Node.js** 20+ (LTS recommended)
- **npm** 9+
- **Docker** and Docker Compose (for local PostgreSQL / Redis)

---

## Local setup

### 1. Clone the repository

```bash
git clone git@github.com:mshall/kiorly-clinics-management.git
cd kiorly-clinics-management
```

Use this folder as your editor workspace root (e.g. Cursor **File → Open Folder**). If the project used to live under `.../AhmedClinic`, reopen at `.../kiorly-clinics-management` so terminals, search, and Git all resolve to the current path.

To align Cursor’s own project metadata folder with this path (optional, run once in Terminal):

`mv ~/.cursor/projects/Users-shall-Documents-Peraonal-Work-AhmedClinic ~/.cursor/projects/Users-shall-Documents-Peraonal-Work-kiorly-clinics-management`

Skip this if the destination name already exists or you use a different editor layout.

### 2. Install dependencies

From the **repository root**:

```bash
npm install
```

### 3. Configure the API (first time)

Create **`apps/api/.env`** (minimal example):

```env
DATABASE_URL="postgresql://cms:cms@localhost:5432/cms?schema=public"
JWT_SECRET="change-me-to-a-long-random-string-in-production"
PORT=3010
```

- **`DATABASE_URL`** — use Docker Compose (`cms:cms@localhost:5432/cms`) or a local Postgres you own (see the commented examples in `.env.example`).

### 4. Start PostgreSQL

**Automatic (recommended):** `npm run dev` and `npm run test:integration-smoke` run **`npm run db:ensure`** first (starts Postgres via Docker or repo **`.pgdata/`**, applies migrations, seeds if the DB is empty).

**Manual:** `npm run db:up` (start only), `npm run db:down` (stop workspace `.pgdata` and/or Docker), `npm run db:ensure` (start + migrate + seed-if-empty).

Docker Compose (`docker-compose.yml`) exposes Postgres on **5432** and Redis on **6379** when Docker works on your Mac.

### 5. Apply migrations and seed demo data (optional)
- **`JWT_SECRET`** must be a strong secret in any shared or production environment.

```bash
npm run db:setup
```

Forces migrate deploy + full demo seed (see `apps/api/prisma/seed.ts`). Skip if `db:ensure` already seeded a fresh database.

### 6. Run the app (API + web)

```bash
npm run dev
```

- **Web:** [http://localhost:5174](http://localhost:5174)
- **API:** [http://localhost:3010](http://localhost:3010)
- **Docs portal** (with `npm run dev`): [http://localhost:5175](http://localhost:5175)

When using **Cursor** in this repo, workspace rule `.cursor/rules/dev-server-refresh.mdc` instructs the agent to restart `npm run dev` and verify API health after meaningful code changes (no need to ask manually).

If the UI shows **“Local API is not reachable”**, from the repo root run `npm run db:ensure && npm run dev` and wait until the `[api]` log prints **`API listening on http://localhost:3010/api/v1`** before reloading. Quick check: `npm run api:ensure` (uses `/api/v1/health/ready` with DB connectivity, not liveness alone).

- **Swagger:** [http://localhost:3010/docs](http://localhost:3010/docs)

After `db:setup`, use the **demo seed users** below (dev-only passwords are listed in the test-data docs). Full list, AWS demo URL, and role matrix: **[`Docs/Test_Data_Users.md`](Docs/Test_Data_Users.md)**. Additional mixed-role staff accounts `staff3@kiorly.com` … `staff15@kiorly.com` are also created; see `apps/api/prisma/seed.ts` for exact role assignment.

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
| `npm run dev` | API (watch) + Vite + docs portal |
| `npm run api:ensure` | Exit 0 only when API is ready (`health/ready` + DB) |
| `npm run dev:api` / `npm run dev:web` | One app only |
| `npm run dev:web:aws` | Local Vite UI against live AWS API (`sync:aws` writes `apps/web/.env.aws`) |
| `npm run sync:github` | Fetch + fast-forward pull `origin/main` |
| `npm run sync:aws` | Stack `AppUrl`, health check, write `.env.aws` |
| `npm run sync:aws:smoke` | Post-deploy smoke: `/health/ready` + demo login (`scripts/cicd-post-deploy-smoke.sh`) |
| `npm run sync:aws:deploy` | Pull GitHub + local CDK deploy (needs AWS CLI + Docker) |
| `npm run sync:all` | `sync` (GitHub + DB) then `sync:aws` |
| `npm run db:ensure` | Postgres up + migrate + seed-if-empty (also runs before `dev` / integration smoke) |
| `npm run db:up` / `npm run db:down` | Start / stop Postgres (Docker or `.pgdata/`) |
| `npm run db:setup` | Generate client, migrate, full seed |
| `npm run test:integration-smoke` | End-to-end integration API check (auto `db:ensure`) |
| `npm run build` | Build API then web |
| `npm run test:unit` | API unit/policy tests (Node test runner) |
| `npm run test:perf` | Concurrent health load smoke (default ≥99.9% success on `/api/v1/health/live`) |
| `npm run lint` | Lint web |
| `npm run codegen -w web` | Regenerate TS types from OpenAPI (after export) |

---

## Environment variables

### API (`apps/api/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for signing JWTs |
| `PORT` | No | HTTP port (default `3000` in code; `.env.example` sets `3010`) |
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
   - **Nest API** via `node dist/src/main.js` (after `npm run build -w api`) behind **Nginx** reverse proxy (TLS with Let’s Encrypt).
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
3. Run `prisma migrate deploy` against production `DATABASE_URL` after each deploy (includes front-desk queue flow and clinical template migrations); no seed in production unless intended.
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

## Documentation (original list)

- **Documentation portal (local UI):** [`Docs/Documentation_Portal.md`](Docs/Documentation_Portal.md) — run `npm run docs:dev` → [http://localhost:5175](http://localhost:5175). Includes synced [PiggyMetrics](https://github.com/sqshq/PiggyMetrics) reference (`npm run docs:sync`).
- **Documentation index:** [`Docs/README.md`](Docs/README.md)
- **UI design catalog:** [`Design/README.md`](Design/README.md) — shipped themes plus **Kiorly Clinical OS** Screen Explorer (`npm run design:clinical-os`)
- **Test users & passwords (QA / demos):** [`Docs/Test_Data_Users.md`](Docs/Test_Data_Users.md)
- Product / requirements context: [`Docs/Clinic_Management_System_PRD.md`](Docs/Clinic_Management_System_PRD.md) (v1.9 — customer support, admin insights, scale/perf notes)
- Technical RFC: [`Docs/Clinic_Management_System_RFC.md`](Docs/Clinic_Management_System_RFC.md) (v1.8)
- Front desk automated flow: [`Docs/FRONT_DESK.md`](Docs/FRONT_DESK.md)
- Clinical templates & chart tools: [`Docs/CLINICAL_WORKFLOW.md`](Docs/CLINICAL_WORKFLOW.md)
- AWS deployment (RDS, App Runner, S3/CloudFront, checklist): [`Docs/AWS_Cloud_Deployment_Guide.md`](Docs/AWS_Cloud_Deployment_Guide.md)

---

## License

Private / unlicensed unless you add a `LICENSE` file. Confirm ownership and terms with the repository owner before redistribution.

## Brand ("Kiorly by Kiorex")
Palette, typography and components come from the shared Kiorex brand kit (`_brand/` in the workspace), vendored into `apps/web/src/brand` and `apps/docs/src/brand` (tokens, Tailwind preset, `KiorexLogo`, shared UI primitives in `ui-kit.tsx`). Jost (Latin) and IBM Plex Sans Arabic are bundled via `@fontsource`. The Nurse edition keeps Nurse Rose `#E11D48` as its single accent (`html[data-edition="nurse"]`, see `brand-bridge.css`). Never redraw the logo: use the SVG/components. UI screenshots: `_docs/ui-review/kiorly-clinic` and `/kiorly-nurse` (`TAG=after node apps/web/scripts/ui-shots.mjs`; filters `ONLY`, `MODES`, `ROUTE`).

### Clinical OS UX conventions (apps/web)
- **Density**: `html[data-density="compact"]` (toggle in the top bar or `Shift+D`) tightens card padding (`--kx-card-pad`) and table rows (`--kx-row-py`); persisted per device (`stores/density-store.ts`).
- **Keyboard** (desktop, no field focused): `?` cheat sheet, `g` then `d/p/a/b/e/r/k` to navigate, `Ctrl/Cmd+K` patient search (Enter opens the first hit), `N` quick-book on Appointments, `N`/`S` call/start on the front-desk board (`components/keyboard-shortcuts.tsx`).
- **Calendar**: Appointments > Calendar has Month / Week / Day (`appointments-time-grid.tsx`): overlap packing, now-line, click an empty half-hour to quick-book (`/appointments?book=1&start=...`).
- **Charts** use `--kx-chart-1..7` (indigo, ocean, coral first; designed dark set) with a hairline grid; numerals are tabular.
- **A11y**: `scripts/axe-check.mjs` covers every redesigned page in EN/AR x light/dark (`SETS`, `LANGS`, `DARK`, `VERBOSE=1` env knobs); `lib/a11y-autofix.ts` wires legacy `<Label>`s to their control.
- **Nurse e2e**: `bash scripts/nurse-e2e-stack.sh` (OPEN :3011/:5185) and `STACK=locked` (:3012/:5186) with `DATABASE_URL=...kiorly_test?connection_limit=3`; run `PLAYWRIGHT_NO_SERVER=1 npx playwright test --project=nurse-open|nurse-gated`. The Playwright API helper now follows `PLAYWRIGHT_BASE_URL` (override with `PLAYWRIGHT_API_URL`).
- **Dialogs are sheets on phones** (`components/ui/dialog.tsx`): centred card from `sm` up, bottom sheet below it (drag handle, safe-area padding), sticky `DialogFooter` so the primary action never scrolls away. Options of `SearchablePickList` render in a body portal and carry `pointer-events-auto` (a modal Radix dialog sets `pointer-events:none` on `<body>`).
- **Section navigation** for consoles: `components/section-nav.tsx` (`SectionNav`, buttons with `aria-current`) for Admin and HR; Platform uses `NavLink`s inside `.kx-secnav`. Underline tabs scroll sideways on phones.
- **Clinical/safety states** use `.kx-callout[data-tone="danger|warn|good|info"]` (icon + text + tone; never colour alone) and `.kx-actionbar` (sticky 56 px action bar) in the Nurse pages (safety timer phases, MAR allergy/order blocks, lab refusals, critical vitals).
- **Playwright on a shared Postgres**: the API rate-limits logins (20/min per email); the `login`/`apiLogin` helpers honour `Retry-After`. Run the suite against a throw-away stack on `kiorly_test` (`DATABASE_URL=...kiorly_test?connection_limit=2 bash scripts/nurse-e2e-stack.sh`, then `PLAYWRIGHT_BASE_URL=http://localhost:5185 PLAYWRIGHT_NO_SERVER=1 npx playwright test --project=chromium`). Screenshot sweep for round 3: `TAG=r3-after MODES=en-light,en-dark,ar-light VIEWS=desk node apps/web/scripts/ui-shots-r3.mjs`.
