# Kiorly payment collection (SB-02)

| Item | Status |
|------|--------|
| SB-02 Kiorly payment collection | **Done** |
| SB-03 Dunning & access (depends on SB-02) | **Done** — see [DUNNING.md](./DUNNING.md) |

SaaS billing payments for Egypt (and market-extensible). **Separate** from clinic patient `TenantPaymentChannel` / front-desk collections.

## Payment gateway interface

`apps/api/src/billing-platform/payment-gateways/payment-gateway.interface.ts` — mirrors fiscal provider shape:

`createPaymentLink`, `createCardSession` / `tokenizeFromWebhook`, `chargeToken`, `handleWebhook`, `refund`.

Providers: **paymob** (card), **fawry**, **instapay**, **bank**.

PAN/CVV never hit Kiorly APIs — hosted iframe/redirect + `assertNoPanOrCvvInBody`.

## Data model

| Model | Purpose |
|-------|---------|
| `KiorlyPaymentMethod` | Token ref + last4 (no PAN) |
| `KiorlyPayment` | Provider ref, status, optional proof key |
| `KiorlyPaymentWebhookEvent` | Webhook idempotency |
| `Subscription.kiorlyDunningPausedUntil` | Pause dunning while manual payment under review |
| `KiorlyInvoice.paymentUnderReview` | UI + ops visibility |

## API

| Endpoint | Auth | Notes |
|----------|------|--------|
| `POST /api/v1/billing/payment-methods/card-session` | Tenant JWT | Paymob hosted session |
| `GET /api/v1/billing/payment-methods` | Tenant JWT | Saved tokens |
| `POST /api/v1/billing/payments/proof` | Tenant JWT | InstaPay/bank proof upload |
| `POST /api/v1/billing/invoices/:id/pay` | Tenant JWT | `{ method, proofUploadKey?, paymentMethodId? }` |
| `GET /api/v1/billing/payments/:id/status` | Tenant JWT | Poll status |
| `POST /api/v1/webhooks/payments/:provider` | HMAC signature | Idempotent settlement |
| `POST /api/v1/admin/platform/payments/:id/verify` | Platform super admin | Approve/reject manual payments |

## Jobs

`KiorlyPaymentScheduler`: hourly auto-charge retries (D+1, D+3, D+7), daily reconciliation pass.

On invoice **issue**, default card auto-charge runs when a token exists.

## Web

Pay modal on Kiorly invoices table: card (hosted add + saved charge), Fawry code, InstaPay/bank proof upload, status polling.

## Migration

`20261117306000_sb02_kiorly_payments`

## Tests

- `sb02-kiorly-payments.node.test.ts` — no PAN/CVV, dunning pause, webhook HMAC
- `sb02-kiorly-payments.integration.test.ts` — webhook idempotency, InstaPay UNDER_REVIEW + verify

### Pay screens in the Clinic web (Nov 2026, flag `clinic.pay_collections`, launch-locked: OFF until the gate is recorded)

- **Staff `/pay`** (revenue or admin tab; entry link on the Revenue page only while the flag is on): *Matching* (finance roles: upload a bank file, queue of rows to review with the invoice each one points at, suggested invoices with confidence and plain-language reasons, manual match by invoice number or patient name, reject, per-row audit trail, counts and the contract safety floors), *Links and status* (invoice payment status: owed and paid, links, bank rows, payments, refunds; create an amount-locked link with QR; request a refund for a payment), *Refunds* (list, request, approve or reject for approvers), *Report* (rollup by branch, organisation, payment method or day; CSV and PDF).
- **Patient `/pay/l/:token`** (public, never flag-gated so issued links keep working): amount, reference to write in the transfer note, the clinic's channels, state (waiting, paid, expired, cancelled), AR/EN with RTL.
- **Safety floors stay on the server**: auto-apply only for an exact reference and exact remaining amount with a clear margin (`@kiorex/pay-contract` `MATCH_FLOORS`); a reversal row, an amount-only row, an overpayment or another tenant's invoice can never auto-apply or be confirmed; every decision is audited (`PAY_MATCH_AUTO_APPLIED`, `PAY_MATCH_CONFIRMED`, `PAY_MATCH_REJECTED`). Mock providers only; no real PSP is called.
- **API additions** (all under the flag, finance-only where they show bank rows): `GET /billing/pay/matching/summary`, `GET /billing/pay/matching/invoices?q=`, `GET /billing/pay/matching/:id/audit`, `GET /billing/pay/invoices/:id/status`, `GET /billing/pay/links`; `GET /billing/pay/matching/queue` now returns each row with its invoice and candidate invoices (superset of the old shape).
- **Deposit checkout routing**: `POST /appointments/:id/deposit-link` accepts `provider: "AUTO"` (Kiorly Pay routing: Kiorex Pay first when `KIOREX_PAY_LINK_BASE_URL` is set and its circuit is closed, the organisation's preference wins, the clinic page is the floor; the answer carries `routing` with the order and why). `deposit-requirement` returns `suggestedProvider`. Omitting `provider` keeps the old default (the clinic page). Gated by the existing `clinic.kiorly_pay_deposits`.
- **Tests**: `pay-collections.integration.test.ts`, `deposit-routing.node.test.ts`, `pay-collections-flag.node.test.ts`, web `features/pay/pay.node.test.ts`, Playwright `e2e/pay-collections.spec.ts` (private stack: `scripts/pay-e2e-stack.sh`, `playwright.pay.config.ts`).

## Follow-ups

- Production Paymob/Fawry credentials via Secrets Manager
- Real settlement reconciliation API per provider
- Webhook replay dashboard for ops
- Card tokenization callback route from Paymob redirect
## Unified Kiorly Pay collections (LG-INT-PAY-14..19, Nov 2026)

Clinic collections now speak the shared `@kiorex/pay-contract` (vendored tarball in `vendor/`, no registry). SaaS gateways: `PaymentGatewayRegistry.getPayAdapter(key)`. Patient invoices: `POST /billing/pay/matching/ipn` (finance roles) matches bank IPN rows to invoices by reference and remaining amount (AUTO only when exact and unambiguous, recorded as a TRANSFER payment; the rest in `GET /billing/pay/matching/queue`), `POST /billing/pay/collections/prepare` (front desk: rail, reference, tenant channels), `POST /billing/pay/links` (amount-locked, expiring links, consumed by the exact payment; public view `GET /public/pay/l/:token`), `GET /billing/pay/reports/rollup` (branch / organisation, json, csv, AR/EN pdf). Migration `20270303090000_pay_unified_collections`. Kiorly never holds funds; the bank layout and every funds-flow question are NEEDS_HUMAN (see kiorex-platform `Docs/PAYMENTS_UNIFIED_LAYER.md`).
