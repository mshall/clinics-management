# Onboarding wizard & activation (ON-04)

| Item | Status |
|------|--------|
| ON-04 Checklist API + dashboard card | **Done** |
| ON-03 Doctor verification step (`doctor_verification`) | **Done** — see [CLINICIAN_VERIFICATION.md](./CLINICIAN_VERIFICATION.md) |
| ON-05 Data import from Excel / CSV (patients, appointments, price list, staff) | **Done** — see [Data import](#data-import-on-05) |
| ON-06 Staff invitations by WhatsApp or email | **Done** — see [Staff invitations](#staff-invitations-on-06) (delivery template: NH-005) |
| ON-07 Field-sales assisted onboarding & rep attribution | **Done** — see [Field-sales reps](#field-sales-reps-on-07) (OTP / welcome templates: NH-006) |

## Purpose

Resumable, skippable activation checklist for new tenants (after ON-01 signup). Drives first real bookings in the first 14 days (conversion predictor).

## Data

`OnboardingProgress` (per tenant): `stepsJson` ISO timestamps or `"skipped"`, `completedAt`, `activatedAt`.

## API

- `GET /api/v1/onboarding` — sync auto-detected steps from clinic data, return checklist + progress.
- `PATCH /api/v1/onboarding/steps/:key` — body `{ "action": "complete" | "skip" }` (required steps cannot skip).

## CR-01 activation

Tenant is **activated** when **first appointment** and **first check-in** steps are satisfied (auto-detect from data or timestamps). Writes audit `TENANT_ACTIVATED` and sets `activatedAt`. UI celebrates on `activationJustAchieved`.

## Required vs optional

**Required (6):** clinic profile, working hours, appointment types, doctor availability, first appointment, first check-in.

**Optional (skippable):** logo, invite receptionist, WhatsApp, patient import, ETA, Kiorex profile.

## Web

- `/onboarding` full-page checklist (post-signup landing).
- Dashboard card for tenant owners until `completedAt`.

## Tests

- `on04-onboarding.node.test.ts` — CR-01, median pilot path &lt; 30 minutes.
- `on04-onboarding.integration.test.ts` — skip rules, auto activation on check-in.

## Data import (ON-05)

"We move you in 48 hours": `/onboarding/import` wizard (the `import_patients` checklist step links here).

- **Templates:** `GET /api/v1/imports/templates/:entity?lang=ar|en` — UTF-8 BOM CSV with Arabic or English headers. Uploads accept `.xlsx` (first sheet) or `.csv`; headers may be the key, English or Arabic label.
- **Validate → preview:** `POST /api/v1/imports` (multipart `file`, `entity` = `PATIENTS|APPOINTMENTS|PRICE_LIST|STAFF`, `dedupeMode` = `SKIP|MERGE`) stores the file (`imports/` upload kind), validates every row (mobile via market country, `dd/mm/yyyy` dates incl. Arabic digits / Excel serials, Arabic-script names, national ID from `Market.clinicalConfig.nationalIdPattern` or the market default) and returns an `ImportJob` in `READY` with row errors + preview. Error report CSV: `GET /api/v1/imports/:id/error-report`.
- **Dedupe:** patients match existing records by mobile (E.164) or national ID. `SKIP` leaves them untouched; `MERGE` only fills empty fields (never overwrites). In-file duplicates are row errors.
- **Commit:** `POST /api/v1/imports/:id/commit` → `202`, status `COMMITTING`, background chunked `createMany` (10,000 patients ≈ 1 s locally). Poll `GET /api/v1/imports/:id`.
- **Undo:** `POST /api/v1/imports/:id/undo` within 24 h deletes rows created by the job that are untouched (not edited, no appointments / encounters / invoices / payments / sessions); others are kept and counted.
- **Attribution:** imported patients get `acquisitionChannel = IMPORT`; imported appointments get `bookingSource = IMPORT`, `isNewPatientAtBooking = false` (completed history gets `checkedInAt`). `NewPatientService` treats any identity matching an imported patient as **not new**, so later Kiorex bookings never charge a new-patient commission.
- **Staff:** users are created with an unusable random password (reset / ON-06 invitation to sign in); physicians beyond `Subscription.clinicianSeats` get `billingSeatActive = false`.
- **Field-rep hook (ON-07):** `ImportJob.actingRepUserId` records a rep importing on behalf of the clinic; `ImportsService.upload/commit` take an `ImportActor` with that id.
- **Access:** tenant owner, group admin, clinic admin, branch manager. Audit: `IMPORT_UPLOADED`, `IMPORT_COMMITTED`, `IMPORT_UNDONE`.

Tests: `onboarding/imports/on05-import.node.test.ts` (parsing, validation, templates) and `on05-import.integration.test.ts` (10k rows < 2 min non-blocking, IMPORT attribution never new for Kiorex, dedupe, error report, undo window).

## Staff invitations (ON-06)

Team screen `/team` (also embedded in Admin → staff / organization users and the Lite admin page); the `invite_receptionist` checklist step links here.

- `POST /api/v1/invitations` `{ phoneOrEmail, roles[], displayName?, clinicIds? }` — owner / group admin / clinic admin / branch manager. A phone (normalized to E.164 with the market country) means **WhatsApp**, an email means **email**. Clinic-scoped roles need `clinicIds`.
- **Seat check before sending:** physician invites count against `max_clinicians` (plan ∩ `Subscription.clinicianSeats`), other roles against `max_assistant_seats`; active users **plus pending invitations** in the same pool. Over the limit → `402 { code: "PLAN_UPGRADE_REQUIRED", entitlement, requiredPlan }` (global paywall modal).
- Delivery goes through the transactional outbox: `OutboxEvent` type `staff.invitation`, target `INTERNAL`, bilingual `textEn`/`textAr` + `acceptUrl` (`APP_WEB_URL/invite/<token>`). The inviter also gets a copyable link. Token stored as SHA-256 hash; 7-day expiry.
- `POST /api/v1/invitations/:id/resend` rotates the token (old link dies) and extends expiry; `DELETE /api/v1/invitations/:id` revokes.
- Public: `GET /api/v1/public/invitations/:token`, `POST /api/v1/public/invitations/:token/accept` `{ password, email? (WhatsApp invites), displayName? }` → creates the user with primary + additional roles, clinic scopes and HR employee link; seat re-checked at accept. Expired / revoked / used links → `410` with `INVITE_*` code.
- Audit: `STAFF_INVITATION_SENT|RESENT|REVOKED|ACCEPTED`.

Tests: `users/invitations/on06-invitations.integration.test.ts` (402 beyond seat limit, WhatsApp outbox + accept, resend/revoke/expiry, pending invites consume seats, RBAC) and `e2e/on06-invitations.spec.ts`.

## Field-sales reps (ON-07)

Kiorly field reps sign clinics in person from a mobile console at `/rep` (login role `SALES_REP`, no tenant; `SalesRep` row holds the attribution `code`). Demo login: `rep@kiorly.com` / `demo` (code `REP-DEMO`). Platform super admins create reps with `POST /api/v1/platform/sales-reps` `{ email, displayName, code, phone?, password? }`.

- `POST /api/v1/rep/tenants` `{ marketId, phone, specialty, planKey, clinic, owner: { displayName, email } }` provisions the same tenant as public signup with `Tenant.salesRepCode` **and** `Subscription.salesRepCode` = rep code, `Tenant.createdBySalesRepId`, a random owner password and **`Tenant.status = PENDING_OWNER`**. A 6-digit OTP (10 min, 5 attempts, purpose `REP_OWNER_CONFIRM:<tenantId>`) goes to the owner's phone (same channel as signup OTP; `SIGNUP_OTP_DEV_CODE` fixes it in dev/tests).
- While `PENDING_OWNER`: owner login is refused (`401 TENANT_PENDING_OWNER`) and the rep cannot import data.
- `POST /api/v1/rep/tenants/:id/confirm` `{ code, legalAcceptances }` — the owner reads the code and accepts the plan's legal pack on the rep's phone (recorded as the owner's acceptance). Tenant → `ACTIVE`, `ownerConfirmedAt` set, and an INTERNAL outbox event `rep.owner_welcome` carries a 7-day set-password link (`/reset-password?token=…`) to the owner — the link is never shown to the rep. `POST …/resend-otp` re-sends (5/hour).
- Imports on behalf of the clinic: `POST /api/v1/rep/tenants/:id/imports` (multipart, same validator as ON-05) and `POST …/imports/:jobId/commit`; jobs record `actingRepUserId`.
- `GET /api/v1/rep/portfolio` — clinics created by the rep or signed up with their code: totals for signups, awaiting owner, activated (`OnboardingProgress.activatedAt`), paid (any PAID `KiorlyInvoice`).
- `GET /api/v1/rep/commission?period=YYYY-MM` — PAID Kiorly invoices in the month from the rep's clinics, grouped by currency; commission is paid only on **retained** clinics (subscription active/trialing/past-due and tenant older than the retention window). Rate and window come from the market pack `commercialConfig.salesRep { commissionPercent, retentionDays }` (optional; default 10 % / 90 days until a market sets them).
- Audit: `REP_TENANT_CREATED`, `REP_TENANT_OWNER_CONFIRMED` (tenant audit log).

Tests: `sales-reps/on07-sales-reps.integration.test.ts` (PENDING_OWNER until OTP, login blocked, wrong code/other rep rejected, legal recorded, welcome outbox, portfolio and retained commission), `on07-sales-reps.node.test.ts`, `e2e/on07-rep-console.spec.ts` (mobile viewport).

## Follow-ups

- Dedicated scheduling UI deep link for clinician availability.
- Public Kiorex doctor profile API (listing payload beyond `marketplaceBookable`).
- Product analytics export for median time in production (pilot sessions).
- ON-05: a durable job queue (the commit runs in-process; a restart mid-commit leaves the job `COMMITTING`); undo of `MERGE` field fills.
- ON-06: INTERNAL outbox sender for `staff.invitation` (WhatsApp template + transactional email) — NH-005.
- ON-07: INTERNAL sender for `rep.owner_welcome`; platform UI to manage reps (API only); payout workflow for rep commission (report only); platform-level audit for rep account creation (no tenant to attach it to).
