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

## Commission rate view (COM-2)

The commission **rate** is set by Kiorex super admins (default per organisation type, own rate per organisation, maker-checker, append-only, effective-dated; see `kiorex-platform/Docs/INTEGRATION_RUNBOOK_PAYMENTS.md`). The Clinic only **displays** it:

- `POST /marketplace/v1/commission-rates` (HMAC, Kiorex to Clinic): the organisation's view (`CommissionRateView`, contracts 1.13.0). Idempotent, newest `version` wins, malformed refused whole, unknown organisation 404. Stored in `KiorexCommissionRateView` (one row per tenant; migration `20270304090000`).
- `GET /api/v1/billing/kiorex-commissions/rate`: the effective rate now, the default, the own rate (with its reason), the next change and the history. Same visibility as the other commission figures (finance, owner, group admin; administrators when the organization enables it). The effective rate is computed at read time from the history, so a future-dated change takes effect by itself and an old instant keeps the old rate.
- No rate known = `state: NOT_SET`: the page says "Rate not set" and no commission is charged. Nothing is invented.
- Web: Admin > Billing > Kiorex commissions > **Rate** tab (en + ar, RTL, 320 / 640x450 / 768 / 1440 / 2560).
- **Pricing.** At check-in the engine prices the charge from the organisation's Kiorex rate when one is in force at `attendedAt` (default per type or own rate; percent of the visit fee, flat, floor, cap, round half up on exact integers: the same arithmetic as the contract vectors); the charge then has `rateId` null and `rateSource` `KIOREX_DEFAULT` or `KIOREX_OVERRIDE` with `rateVersion`, and the append-only decision carries the source and a policy version suffixed `+KIOREX_...:v<n>` (a rate change is a new policy version, the earlier decision stays as written). With no Kiorex rate the market rate table (`KiorexCommissionRate`) applies exactly as before (`rateSource` MARKET_ROW); with neither, no charge and the decision `NO_RATE_CONFIGURED`. A frozen charge is never re-priced. Migration `20270304100000` (rateId nullable, `rateSource`, `rateVersion`, decision `rateSource`, the decision CHECK accepts a Kiorex source instead of a market row).
- Charges keep the rate they were recorded with on the Kiorex side (`CommissionClaim.rateSnapshot`).

## Marketplace daily cap

`ClinicianAvailabilityTemplate.marketplaceDailyCap` (default 20) limits Kiorex bookings per doctor per clinic-local day. It is enforced on every write path, not only on the slot list: `SlotService.assertMarketplaceDailyCapRoom` runs inside the hold, booking and reschedule transactions under a per-doctor-per-day advisory lock and counts non-cancelled Kiorex bookings plus active holds (a hold's own booking is not counted twice). Over the cap: `409 MARKETPLACE_DAILY_CAP_REACHED`. The slot list now counts whole local days (a narrow window used to see no earlier bookings). Test: `marketplace-daily-cap.integration.test.ts` (fails without the fix).

## Web

- Admin → Organization & settings → billing: **Kiorex commission charges** — dispute dialog (en + ar)
- Platform → **Commission disputes** queue (en + ar)

## Tests

- `commission-rate-view.node.test.ts`, `com2-commission-rate-view.integration.test.ts`, `com2-org-rate-charge.integration.test.ts` (COM-2 rate view and pricing), `marketplace-daily-cap.integration.test.ts` (daily cap)
- Playwright (private stack, self-created fixtures, `playwright.private.config.ts`): `kiorex-commissions.spec.ts`, `credits-wallet.spec.ts`, `promotions.spec.ts`

- `cr03-commission-charge.node.test.ts` — active status helpers, dispute deadline pack
- `cr03-commission-charge.integration.test.ts` — check-in → revert → check-in (one active row), frozen amount after rate change, confirm
- `cr08-commission-dispute.node.test.ts` — 3 working-day SLA
- `cr08-commission-dispute.integration.test.ts` — closed window, auto `EXISTING_PATIENT`, manual reject + owner notify