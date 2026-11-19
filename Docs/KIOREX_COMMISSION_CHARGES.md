# Kiorex commission charges (CR-03 / CR-08)

| Item | Status |
|------|--------|
| CR-03 Kiorex commission charge capture & lifecycle | **Done** |
| CR-08 Commission disputes & adjustments | **Done** |

## Purpose

One immutable **KiorexCommissionCharge** row per appointment (unique `appointmentId`) for attended, commissionable Kiorex new-patient bookings. Amount and rate are **snapshotted at check-in**. Lifecycle: `PENDING` → `CONFIRMED` (visit complete or 24h after check-in) → `BILLED` on invoice (CR-06 follow-up). Reversals emit outbox events; **BILLED** late reversals grant **CR-05** wallet credit (`KIOREX_LATE_REVERSAL`).

**CR-08** adds **CommissionDispute**: clinics dispute within `disputeDeadline` (market `kiorex.disputeWindowDays`, default 7), with reasons `EXISTING_PATIENT`, `DID_NOT_ATTEND`, `DUPLICATE`, `OTHER`. Auto-approval when prior visit matches identity (`EXISTING_PATIENT`) or duplicate charge within 7 days (`DUPLICATE`). Manual queue with **3 working-day SLA**; approved → `REVERSED` (or wallet credit if `BILLED`); rejected → charge back to `CONFIRMED` / `PENDING`. Resolutions are audited and enqueued to owners via `billing.commission_dispute_resolved`.

## Data model

Migrations `20261117307000_cr03_kiorex_commission_charges`, `20261118220000_cr08_commission_disputes`:

- `CommissionChargeStatus`: `PENDING`, `CONFIRMED`, `DISPUTED`, `REVERSED`, `WAIVED`, `BILLED`
- `KiorexCommissionCharge` — frozen `amount`, `rateId`, `currency`, `attendedAt`, `disputeDeadline`
- `CommissionDispute` — 1:1 `chargeId`, `reason`, `status` (`OPEN` | `AUTO_APPROVED` | `APPROVED` | `REJECTED`), `resolution`

## When charges are created

`isCommissionChargeableBooking` (CR-02): Kiorex / integration sources with `isNewPatientAtBooking`, never `CLINIC_LINK`.

Hooks:

- `CommissionChargeService.onCheckIn` — front desk check-in and appointment status → `CHECKED_IN`
- `onRevert` — check-in revert
- `onComplete` — encounter sign-off / appointment `COMPLETED`
- `onCancelOrNoShow` — `CANCELLED` / `NO_SHOW` while a charge exists
- `beforeAppointmentDelete` — reverse before delete
- Hourly job — auto-confirm `PENDING` older than 24h

Outbox topics: `COMMISSION_CHARGE_CREATED`, `COMMISSION_CHARGE_REVERSED`, `billing.commission_dispute_resolved`.

## API

| Endpoint | Auth | Notes |
|----------|------|--------|
| `GET /api/v1/billing/kiorex/charges?period=&status=` | Org user | Period `YYYY-MM` on `attendedAt`; includes dispute summary |
| `POST /api/v1/billing/kiorex/charges/:id/dispute` | Org user | Body: `reason`, optional `note`; before `disputeDeadline` |
| `GET /api/v1/admin/platform/disputes` | Platform super admin | Ops queue (default `OPEN`) |
| `POST /api/v1/admin/platform/disputes/:id/resolve` | Platform super admin | `decision`: `APPROVE` \| `REJECT`, optional `resolution` |

## Web

- Admin → Organization & settings → billing: **Kiorex commission charges** — dispute dialog (en + ar)
- Platform → **Commission disputes** queue (en + ar)

## Tests

- `cr03-commission-charge.node.test.ts` — active status helpers, dispute deadline pack
- `cr03-commission-charge.integration.test.ts` — check-in → revert → check-in (one active row), frozen amount after rate change, confirm
- `cr08-commission-dispute.node.test.ts` — 3 working-day SLA
- `cr08-commission-dispute.integration.test.ts` — closed window, auto `EXISTING_PATIENT`, manual reject + owner notify