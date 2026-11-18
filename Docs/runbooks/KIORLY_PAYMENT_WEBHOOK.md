# Kiorly payment webhook failure (KIORLY_PAYMENT_WEBHOOK_FAILED)

## Symptoms

- On-call alert **KIORLY_PAYMENT_WEBHOOK_FAILED**
- `KiorlyPayment.status = FAILED` after Paymob/Fawry webhook
- Tenant invoice stuck in ISSUED after customer paid

## First actions

1. Find payment by `providerRef` in admin billing tools; check `KiorlyPaymentWebhookEvent` idempotency row.
2. Verify webhook HMAC secret matches provider dashboard; compare raw payload in provider portal.
3. If signature OK but status failed: customer retry or manual **verify** flow for InstaPay/bank (UNDER_REVIEW).
4. Replay webhook from provider **once** if idempotency allows; otherwise create manual payment adjustment per [KIORLY_PAYMENTS.md](../KIORLY_PAYMENTS.md).

## Escalation

- **L2:** Billing-platform on-call — dunning pause if widespread; patch gateway mapping.
- **Tenant:** Finance contact for proof-of-payment if manual transfer.