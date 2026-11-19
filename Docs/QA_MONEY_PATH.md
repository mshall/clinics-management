# QA-02 Money-path API tests

| Item | Status |
|------|--------|
| Billing / billing-platform / credits ≥85% line coverage | **Done** |

## Scope

Integration and unit coverage for **patient billing**, **Kiorly SaaS billing**, **credits wallet**, and related gateways—complementing fiscal coverage (`fiscal-revenue-coverage.node.test.ts`).

| Path | Primary tests |
|------|----------------|
| Catalog + list pricing | `qa02-billing-money-path.integration.test.ts` |
| Split payments + allocations | `qa02-billing-money-path.integration.test.ts`, `qa02-billing.node.test.ts` |
| Cash close | `qa02-billing-money-path.integration.test.ts`, `billing-cash-close.node.test.ts` |
| Refunds, packages, deposits (MN-01) | `mn01-patient-money.integration.test.ts`, `mn01-patient-money.node.test.ts` — see [CLINIC_BILLING.md](./CLINIC_BILLING.md) |
| Kiorex Pay deposits → check-in payment, refund reversal, payouts (KX-07) | `kx07-kiorex-deposits.integration.test.ts`, `kx07-kiorex-deposits.node.test.ts` |
| Payment-link deposits: pending → held → applied, late-cancel forfeit, early-cancel refund, expiry auto-cancel (FS-04) | `fs04-deposit-links.integration.test.ts`, `fs04-deposit-policy.node.test.ts` |
| Doctor revenue share: statements reconcile with collected revenue, approve lock, payout (MN-02) | `mn02-revenue-share.integration.test.ts`, `mn02-revenue-share-engine.node.test.ts` |
| Payment gateways (Paymob, Fawry, InstaPay, bank) | `qa02-payment-gateways.node.test.ts` |
| Kiorly invoices, saved card pay, credits on issue, void/PDF | `qa02-kiorly-money-path.integration.test.ts`, `sb01-kiorly-invoice.*`, `sb02-kiorly-payments.*` |
| Settlement + subscription invoice math | `cr06-settlement.*`, `qa03-settlement-matrix.node.test.ts` |
| Credit wallet (grant, consume, expiry) | `qa02-credit-wallet.integration.test.ts`, `cr05-credit-wallet.*` |
| Kiorex marketplace commission (revenue share) | `kiorex/cr03-commission-charge.integration.test.ts` (outside the 85% gate modules) |

Patient payments in integration tests use `submitEta: false` so ETA fiscal setup is not required.

## Coverage gate

From `apps/api`:

```bash
npm run test:money-coverage
```

Runs all `*.test.ts` under `src/billing`, `src/billing-platform`, and `src/credits` with Node’s coverage reporter and **fails below 85% lines** on those trees (aggregate; see script output for per-file gaps).

## CI

After API integration tests in the reusable **CI test** job:

- `npm run test:money-coverage -w api`

Same step is mirrored in `scripts/ci-test-local.sh` (`npm run ci:test`).

## Follow-ups

- Dedicated **care package** purchase/redemption tests if package logic moves into `billing` (today largely catalog + visit fee paths).
- Broader `kiorly-payment.service` branches (manual proof, webhook replay, dunning reactivation) for files still below 85% in the detailed report.
- Optional: fold Kiorex commission tests into a second coverage include set if marketplace money paths get their own QA gate.