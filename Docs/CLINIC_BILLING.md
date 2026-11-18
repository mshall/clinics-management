# Clinic billing: refunds, packages, deposits

Patient-side money for clinics (not Kiorly's own SaaS billing — that is `KiorlyInvoice`). Every receiptable amount still goes through `postRevenue`; Kiorly never submits anything to ETA.

| Step | Item | Status |
|------|------|--------|
| MN-01 | Refunds + credit notes, prepaid packages, deposits, patient balances, refund dialog + patient "Packages & refunds" tab | **Done** |

## Money model

| Thing | Revenue | Drawer (`CashMovement`) |
|-------|---------|-------------------------|
| Refund (`BillingRefund`) | exactly **one** negative `REFUND` revenue row via `postRevenue`, on the same appointment/encounter/operation as the original, tax reversed pro-rata | exactly **one** `OUT` movement |
| Package sale (`PatientServicePackage`) | none — liability | `IN` (`PACKAGE_SALE`) |
| Package session (`PatientPackageConsumption`) | `PACKAGE_SESSION` = price ÷ sessions (last session takes the rounding remainder) | none |
| Package cancel | none (unused value was never revenue) | `OUT` for the unused value (`PACKAGE_CANCEL`) |
| Deposit taken (`PatientDeposit` HELD) | none — liability | `IN` (`DEPOSIT`) |
| Deposit applied | `DEPOSIT_APPLIED` via `postRevenue` (once — status guard + advisory lock) | none |
| Deposit released / forfeited | released: none · forfeited: `DEPOSIT_FORFEIT` revenue | released: `OUT` (`DEPOSIT_RELEASE`) · forfeited: none |

Refunding an applied deposit or a package session is an ordinary refund of that revenue row.

Cash close (`POST /billing/cash-close`) adds every non-`PAYMENT` cash movement of the day (signed) to the expected cash/card figures.

## Approval

- Market pack `providerConfig.billing.refundApprovalThreshold` (major units, default **1000**).
- Desk roles (reception, assistant) can refund up to the threshold; above it the refund is `PENDING_APPROVAL` and nothing posts until an owner / group admin / clinic admin / finance officer / branch manager approves (`REFUND_APPROVED`). The requester can never approve their own refund. Rejections post nothing.
- Package cancellation and deposit release are approver-only.
- Audit actions: `REFUND_REQUESTED`, `REFUND_COMPLETED`, `REFUND_APPROVED`, `REFUND_REJECTED`, `PACKAGE_SOLD`, `PACKAGE_SESSION_CONSUMED`, `PACKAGE_CANCELLED`, `DEPOSIT_TAKEN`, `DEPOSIT_APPLIED`, `DEPOSIT_RELEASED`, `DEPOSIT_FORFEITED`.

## API (Pro+, `mod_invoices`)

| Method | Path | Notes |
|--------|------|-------|
| POST | `/billing/refunds` | `{ paymentId | revenueEntryId, amount, reason, method? }` → 400 `REFUND_EXCEEDS_BALANCE` with `remaining` |
| GET | `/billing/refunds?status=` | |
| POST | `/billing/refunds/:id/approve` · `/reject` | 400 `REFUND_NOT_PENDING` |
| POST | `/billing/packages` | `{ clinicId, patientId, nameEn, nameAr?, totalSessions, paidAmount, method, expiresOn? }` |
| POST | `/billing/packages/:id/consume` | `{ appointmentId? }` → 400 `PACKAGE_EXHAUSTED` / `PACKAGE_EXPIRED` |
| POST | `/billing/packages/:id/cancel` | `{ reason, method? }` |
| POST | `/billing/deposits` | `{ clinicId, patientId, appointmentId?, amount, method, source? }` |
| POST | `/billing/deposits/:id/apply` | 400 `DEPOSIT_NOT_HELD` |
| POST | `/billing/deposits/:id/release` | `{ reason, outcome?: RELEASED | FORFEITED }` |
| GET | `/patients/:id/balances` | deposits held, package balances (+ expired flag), refunds, credit notes, refundable items |

## Tests

- `apps/api/src/billing/mn01-patient-money.integration.test.ts` — one reversal + one cash movement per refund, approval flow, packages, expiry, deposits, cash close.
- `apps/api/src/billing/mn01-patient-money.node.test.ts` — threshold, remaining, session split, roles.
- `apps/web/e2e/mn01-patient-money.spec.ts` — sell package, use a session, refund a payment from the patient tab.

## Follow-ups

- Store credit (credit note without cash out) and applying credit to a later visit.
- Revenue recognition of unused value when a package expires (breakage) — today it stays a liability.
- Voiding a sale that already has a refund leaves the refund row in place; the void flow should net the two.
