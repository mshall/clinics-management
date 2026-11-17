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

## Follow-ups

- Production Paymob/Fawry credentials via Secrets Manager
- Real settlement reconciliation API per provider
- Webhook replay dashboard for ops
- Card tokenization callback route from Paymob redirect