# Credit wallet & ledger (CR-05)

Immutable SaaS billing credits per tenant (distinct from patient invoice `CreditNote`).

## Data model

| Model | Purpose |
|-------|---------|
| `CreditWallet` | One row per tenant; `currency` = tenant `baseCurrency`; materialised `balance` + optimistic `version` |
| `CreditLedgerEntry` | Append-only `GRANT`, `CONSUME`, `EXPIRE`, `REVERSE` with `CreditReason` |

Balance = Σ `amount` (positive grants, negative consumes/expirys). Grants keep `remaining` for FIFO consumption by earliest `expiresAt`.

## API

| Endpoint | Auth | Notes |
|----------|------|--------|
| `GET /api/v1/billing/wallet` | Tenant JWT | Balance, upcoming expiries, paged ledger |
| `POST /api/v1/admin/platform/tenants/:id/credits` | Platform super admin | Manual grant; large amounts need `secondApproverUserId` |

## Jobs

`CreditWalletScheduler` (daily): expire overdue grant remainders; reconcile materialised balance vs ledger sum.

## Web

Organization → **Plan & billing** — credit wallet card and ledger table (`AdminOrgBillingPanel`).

## Migration

`20261117304000_cr05_credit_wallet_ledger`

## Tests

- `apps/api/src/credits/cr05-credit-wallet.node.test.ts` — FIFO + property (no negative balance, balance = Σ)
- `apps/api/src/credits/cr05-credit-wallet.integration.test.ts` — ledger sum + concurrent consume

## Follow-ups

- Auto-grant hooks (referral, Kiorex late reversal, promo campaigns)
- Apply credits at Kiorly invoice issuance — wired on `KiorlyInvoicesService.issue` (`consume` with `invoiceId`)
- Platform UI for manual grants (API only today)
- `REVERSE` entry type for dispute workflows