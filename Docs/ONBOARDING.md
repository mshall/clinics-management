# Onboarding wizard & activation (ON-04)

| Item | Status |
|------|--------|
| ON-04 Checklist API + dashboard card | **Done** |
| ON-03 Doctor verification step (`doctor_verification`) | **Done** — see [CLINICIAN_VERIFICATION.md](./CLINICIAN_VERIFICATION.md) |
| ON-05 Data import from Excel / CSV (patients, appointments, price list, staff) | **Done** — see [Data import](#data-import-on-05) |

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

## Follow-ups

- Dedicated scheduling UI deep link for clinician availability.
- Public Kiorex doctor profile API (listing payload beyond `marketplaceBookable`).
- Product analytics export for median time in production (pilot sessions).
- ON-05: a durable job queue (the commit runs in-process; a restart mid-commit leaves the job `COMMITTING`); undo of `MERGE` field fills.