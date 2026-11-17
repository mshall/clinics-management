# Kiorex commission charges (CR-03)

| Item | Status |
|------|--------|
| CR-03 Kiorex commission charge capture & lifecycle | **Done** |

## Purpose

One immutable **KiorexCommissionCharge** row per appointment (unique `appointmentId`) for attended, commissionable Kiorex new-patient bookings. Amount and rate are **snapshotted at check-in**. Lifecycle: `PENDING` → `CONFIRMED` (visit complete or 24h after check-in) → `BILLED` on invoice (CR-06 follow-up). Reversals emit outbox events; **BILLED** late reversals grant **CR-05** wallet credit (`KIOREX_LATE_REVERSAL`).

## Data model

Migration `20261117307000_cr03_kiorex_commission_charges`:

- `CommissionChargeStatus`: `PENDING`, `CONFIRMED`, `DISPUTED`, `REVERSED`, `WAIVED`, `BILLED`
- `KiorexCommissionCharge` — frozen `amount`, `rateId`, `currency`, `attendedAt`, `disputeDeadline` (market pack `kiorex.disputeDeadlineDays`, default 30)

## When charges are created

`isCommissionChargeableBooking` (CR-02): Kiorex / integration sources with `isNewPatientAtBooking`, never `CLINIC_LINK`.

Hooks:

- `CommissionChargeService.onCheckIn` — front desk check-in and appointment status → `CHECKED_IN`
- `onRevert` — check-in revert
- `onComplete` — encounter sign-off / appointment `COMPLETED`
- `onCancelOrNoShow` — `CANCELLED` / `NO_SHOW` while a charge exists
- `beforeAppointmentDelete` — reverse before delete
- Hourly job — auto-confirm `PENDING` older than 24h

Outbox topics: `COMMISSION_CHARGE_CREATED`, `COMMISSION_CHARGE_REVERSED`.

## API

| Endpoint | Auth | Notes |
|----------|------|--------|
| `GET /api/v1/billing/kiorex/charges?period=&status=` | Org user | Period `YYYY-MM` on `attendedAt` |
| `POST /api/v1/billing/kiorex/charges/:id/dispute` | Org user | Before `disputeDeadline`; sets `DISPUTED` |

## Web

Admin → Organization & settings → billing section: **Kiorex commission charges** (en + ar).

## Tests

- `cr03-commission-charge.node.test.ts` — active status helpers, dispute deadline pack
- `cr03-commission-charge.integration.test.ts` — check-in → revert → check-in (one active row), frozen amount after rate change, confirm

## Follow-ups

- Dispute approval → `onApprovedDispute` (platform workflow)
- Platform dispute review workflow
- Entitlement / nav gating for Kiorex billing tab