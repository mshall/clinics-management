# Clinic billing: refunds, packages, deposits

Patient-side money for clinics (not Kiorly's own SaaS billing — that is `KiorlyInvoice`). Every receiptable amount still goes through `postRevenue`; Kiorly never submits anything to ETA.

| Step | Item | Status |
|------|------|--------|
| MN-01 | Refunds + credit notes, prepaid packages, deposits, patient balances, refund dialog + patient "Packages & refunds" tab | **Done** |
| FS-04 | Payment-link deposits (`PENDING` → `HELD` on payment, `EXPIRED` / `CANCELLED` when unpaid), desk mark-paid, Kiorex Pay link callback; late patient cancellation forfeits per clinic policy — see [FRONT_DESK.md](./FRONT_DESK.md#deposits--payment-links-for-high-risk-bookings-fs-04) | **Done** |
| KX-07 | Kiorex Pay deposits → held deposit on the booking → `BillingPayment` at check-in via `postRevenue`; refund/forfeit per policy; payouts reconciliation; deposit badge | **Done** |
| MN-02 | Doctor revenue-share rules (percent / fixed per visit / room rental, by doctor · visit type · category · payer · branch), monthly statements with adjustments, approve-to-lock, payout, bilingual PDF, reconciliation — see [Doctor revenue share](#doctor-revenue-share-mn-02) | **Done** |

## Money model

| Thing | Revenue | Drawer (`CashMovement`) |
|-------|---------|-------------------------|
| Refund (`BillingRefund`) | exactly **one** negative `REFUND` revenue row via `postRevenue`, on the same appointment/encounter/operation as the original, tax reversed pro-rata | exactly **one** `OUT` movement |
| Package sale (`PatientServicePackage`) | none — liability | `IN` (`PACKAGE_SALE`) |
| Package session (`PatientPackageConsumption`) | `PACKAGE_SESSION` = price ÷ sessions (last session takes the rounding remainder) | none |
| Package cancel | none (unused value was never revenue) | `OUT` for the unused value (`PACKAGE_CANCEL`) |
| Deposit link sent (`PatientDeposit` PENDING) | none | none |
| Deposit taken / link paid (`PatientDeposit` HELD) | none — liability | `IN` (`DEPOSIT`) |
| Link expired / voided (EXPIRED / CANCELLED) | none | none |
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
| POST | `/billing/deposits` | `{ clinicId, patientId, appointmentId?, amount, method }` (desk deposits are always source `CLINIC`) |
| POST | `/billing/deposits/:id/apply` | 400 `DEPOSIT_NOT_HELD` |
| POST | `/billing/deposits/:id/release` | `{ reason, outcome?: RELEASED | FORFEITED }` |
| GET | `/patients/:id/balances` | deposits held, package balances (+ expired flag), refunds, credit notes, refundable items |
| POST | `/billing/deposits/:id/mark-paid` | FS-04 — `{ method, reference }`; 400 `DEPOSIT_NOT_PENDING` / `DEPOSIT_LINK_EXPIRED` / `DEPOSIT_REFERENCE_REQUIRED` |
| GET | `/billing/kiorex-payouts?from&to&clinicId` | approvers only — collected, refunded, net due, payouts received, outstanding + deposit rows |
| POST | `/marketplace/v1/bookings/:ref/deposit-paid` | Kiorex (platform client) — `{ amount, currency?, paymentRef, paidAt? }`; idempotent per `paymentRef`; 400 `DEPOSIT_EXCEEDS_FEE` / `DEPOSIT_CURRENCY_MISMATCH` |
| POST | `/marketplace/v1/payouts` | Kiorex — `{ payoutRef, clinicId?, amount, currency?, paidAt?, depositPaymentRefs? }`; idempotent per `payoutRef` |

## Kiorex Pay deposits (KX-07)

- Payment method `KIOREX_PAY` is in the market pack (`Market.paymentMethods`, no desk transfer channel) and a `TenantPaymentChannel` (`KIOREX_PAY`) is created on the first Kiorex deposit.
- `deposit-paid` records a `PatientDeposit` (`source=KIOREX_PAY`, `HELD`, `externalRef` = Kiorex payment ref) on the booking. No revenue and no drawer movement — the money sits with Kiorex until payout.
- Settlement (`DepositSettlementService`) runs inside front-desk check-in and every 60 s for bookings that ended elsewhere:
  - checked in / completed → a `BillingPayment` (method = deposit method) with one allocation; the allocation's revenue is the `DEPOSIT_APPLIED` row from `postRevenue` (`BillingPaymentAllocation.revenueEntryId`);
  - cancelled → released (refund to patient), or forfeited when the KX-06 cancellation policy made it non-refundable (`Appointment.depositRefundable=false`);
  - no-show → forfeited (`DEPOSIT_FORFEIT` revenue).
- The visit-fee receivable is reduced by applied deposits (minus refunds), so a fully prepaid visit leaves no balance due.
- Refunding the converted payment or its allocation row is one shared balance (MN-01 refund flow); the reversal posts negative revenue only — never a drawer `OUT` for `KIOREX_PAY`.
- Cash close ignores payments converted from deposits (cash was counted when the deposit was taken, or never touched the drawer for Kiorex Pay).
- Payout report: `collected − (released + Kiorex-Pay refunds) = net due`; `net due − payouts = outstanding`. Audit: `KIOREX_DEPOSIT_PAID`, `KIOREX_PAYOUT_RECEIVED`.

## Doctor revenue share (MN-02)

Monthly statement per doctor, computed from **collected** revenue only — `POSTED` `RevenueEntry` rows with `postedAt` inside the month in the market timezone, excluding rejected bank transfers. Receivables (billed, not paid) never count. Refund rows are negative, so they reduce the doctor's share automatically.

- **Doctor attribution:** revenue row → encounter → appointment → operation `clinicianId`. Rows with no doctor (e.g. pharmacy counter sales) are reported as *not linked to a doctor* and stay with the clinic.
- **Rules (`CommissionRule`):** `PERCENT` (of net collected), `FIXED_PER_VISIT` (per visit that still has positive net after refunds) and `ROOM_RENTAL` (doctor keeps unmatched collections and pays a fixed monthly rental; can go negative). The most specific matching rule wins: doctor 8, visit type 4, revenue category 2, payer 2, branch 1; then `priority`; then newest. No rule → clinic keeps it (`unmatchedNet`).
- **Payer:** `KIOREX_PAY` when the row came from a Kiorex Pay allocation, otherwise `PATIENT`.
- **Lifecycle (`DoctorStatement`):** `DRAFT` (recomputed on every read; owner/finance may add adjustments) → `APPROVED` (recomputed once, then frozen — later revenue does not move it) → `PAID` (payout recorded with method/reference). Each step writes an `AuditLog` row (`DOCTOR_STATEMENT_ADJUSTED` / `_APPROVED` / `_PAID`, `REVENUE_SHARE_RULE_CREATED` / `_DEACTIVATED`).
- **Reconciliation:** `GET /revenue-share/reconciliation?period=YYYY-MM` — total collected = Σ doctor statements + not-linked rows (`balanced`).
- **Access:** gated by `mod_revenue`. Doctors see only their own statement (Doctor revenue page); owners / finance / branch managers see all, approve, pay and manage rules (Revenue page). PDF: `GET /revenue-share/statements/:id/pdf` (EN + AR).
- Statements never create or change revenue; paying a doctor is not a patient payment and is not posted through `postRevenue`.

## Tests

- `apps/api/src/billing/mn01-patient-money.integration.test.ts` — one reversal + one cash movement per refund, approval flow, packages, expiry, deposits, cash close.
- `apps/api/src/billing/mn01-patient-money.node.test.ts` — threshold, remaining, session split, roles.
- `apps/web/e2e/mn01-patient-money.spec.ts` — sell package, use a session, refund a payment from the patient tab.
- `apps/api/src/billing/kx07-kiorex-deposits.integration.test.ts` — deposit-paid idempotency, check-in conversion through `postRevenue`, refund reverses revenue without a drawer movement, cancellation release/forfeit, payouts reconciliation.
- `apps/api/src/billing/kx07-kiorex-deposits.node.test.ts` — settlement outcomes, payout maths.
- `apps/web/e2e/kx07-deposits.spec.ts` — deposit badge on the appointment, payouts card on the Kiorex tab.
- `apps/api/src/revenue-share/mn02-revenue-share.integration.test.ts` — totals reconcile with revenue for the period, rule precedence, room rental, fixed per visit, doctor scope, adjust → approve lock → mark paid, PDF.
- `apps/api/src/revenue-share/mn02-revenue-share-engine.node.test.ts` — precedence, refunds, rental, unmatched, payable, timezone periods.
- `apps/web/e2e/mn02-doctor-statements.spec.ts` — owner sees statements + balanced reconciliation; a doctor sees only their own, no approve.

## Follow-ups

- MN-02: payer dimension is `PATIENT` / `KIOREX_PAY` only (revenue rows carry no insurer link yet); rules by service catalog item are not applied (revenue rows have no catalog link).
- MN-02: doctor payouts are recorded, not posted to expenses/payroll automatically.

- Store credit (credit note without cash out) and applying credit to a later visit.
- Revenue recognition of unused value when a package expires (breakage) — today it stays a liability.
- Voiding a sale that already has a refund leaves the refund row in place; the void flow should net the two.
- Front-desk check-in does not emit an outbox `CHECKED_IN` event to Kiorex; deposit settlement does not need it (in-process + reconciler), but Kiorex learns of the visit only from its own status sync.
