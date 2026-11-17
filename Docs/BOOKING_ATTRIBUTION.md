# Booking attribution & new-patient rule (CR-02)

| Item | Status |
|------|--------|
| CR-02 Booking source, new-patient freeze, Kiorex attribution | **Done** |

## Purpose

Commission fairness: attribute each appointment to its booking channel (Kiorex vs clinic-owned) and **freeze** whether the patient was new to the organization at booking time so later chart edits do not silently change billing.

## Data model

Migration `20261117302000_cr02_booking_attribution`:

| Field | Notes |
|-------|--------|
| `BookingSource` enum | `FRONT_DESK`, `PHONE`, `WALK_IN`, `CLINIC_LINK`, `KIOREX_MARKETPLACE`, `KIOREX_WHATSAPP`, `INTEGRATION`, `IMPORT` |
| `Appointment.bookingSource` | Default `FRONT_DESK` |
| `Appointment.attributionJson` | Kiorex search id, campaign, landing page |
| `Appointment.isNewPatientAtBooking` | Set once at create |
| `Appointment.newPatientCheckedAt` | Timestamp of the rule evaluation |
| `PatientAcquisitionChannel.KIOREX` | Marketing channel enum extension |

## New-patient rule

`NewPatientService.isNewToTenant(tenantId, phone, nationalId, atDate)`:

- Lookback **24 months** by default (`Market.featureDefaults.newPatient.lookbackMonths` override).
- Phone compared in **E.164** (`libphonenumber-js`) with digit fallback.
- **National ID** exact match links identities across different phone numbers.
- Prior **attended** appointment (`CHECKED_IN` / `COMPLETED` with `checkedInAt` in window) or **signed** encounter (`FINALIZED` with `signedAt` / `finalizedAt` in window) → not new.

## Commission chargeability (CR-06 hand-off)

`isCommissionChargeableBooking(source, isNewPatientAtBooking)` — `CLINIC_LINK` is **never** chargeable. Kiorex / integration only when `isNewPatientAtBooking` is true.

## API

- Appointment payloads include `bookingSource`, `attributionJson`, `isNewPatientAtBooking`, `newPatientCheckedAt`, `commissionChargeableAtBooking`.
- `GET /api/v1/appointments?bookingSource=KIOREX_MARKETPLACE`
- Integration book: `kiorexChannel`, `attribution`, `marketplaceConsentGranted` → `KIOREX_*` source.

## Web

- `AppointmentSourceBadges` on list + detail (Kiorex logo chip, “New” chip). en + ar `appointments.bookingSource.*`.

## Tests

- `cr02-booking-attribution.node.test.ts` — CLINIC_LINK never chargeable.
- `cr02-new-patient.integration.test.ts` — 23m / 25m phone window, nationalId across phones.

## Follow-ups

- Stamp new-patient fields on **scheduling series** bulk creates (currently schema default `FRONT_DESK` only).
- Public clinic booking link → `CLINIC_LINK` + dedicated UI source picker (PHONE, WALK_IN) on manual book form.
- Persist normalized E.164 on `Patient.phone` at save for faster identity queries.
- Wire `commissionChargeableAtBooking` into CR-06 commission ledger.