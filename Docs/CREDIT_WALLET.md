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

## CR-09 doctor-to-doctor referral credits

| Item | Status |
|------|--------|
| Referral codes & first-paid-period rewards | **Done** — `ReferralCode`, `Referral`, `GET /growth/referral`, signup `?ref=` |

Both referrer and referred receive one monthly plan-price credit (`CreditReason.REFERRAL`) after the referred org’s **first paid** Kiorly invoice (> 0). Fraud guards: same phone, shared card fingerprint, annual cap from market `commercialConfig.referral`. Tests: `cr09-referral.*.test.ts`.

## CR-10 no-show guarantee credits

Optional market offer (`commercialConfig.noShowGuarantee`, **`enabled: false` by default**):

| Window | Rule |
|--------|------|
| Baseline | Days 0–`baselineDays` (default 30) after `OnboardingProgress.activatedAt`; need ≥ `minBaselineAppointments` (100) COMPLETED+NO_SHOW outcomes |
| Evaluation | Days `baselineDays`–`evaluationDay` (default 120) |
| Grant | If reduction ≥ `targetReductionPercent` (30%) and WhatsApp reminders + deposits are on → `CreditReason.NO_SHOW_GUARANTEE` for `creditMonths` (3) × monthly plan price |

API: `GET /api/v1/billing/guarantee`. UI: Plan & billing guarantee tracker card (hidden when disabled). Daily scheduler evaluates and grants idempotently (`sourceRef=no-show-guarantee:<tenantId>`).

Tests: `billing/cr10-no-show-guarantee.*.test.ts`.

## Follow-ups

- Auto-grant hooks (Kiorex late reversal, promo campaigns beyond referral)
- Apply credits at Kiorly invoice issuance — wired on `KiorlyInvoicesService.issue` (`consume` with `invoiceId`)
- Platform UI for manual grants (API only today)
- `REVERSE` entry type for dispute workflows
## Provider credit v2 (GRW-P2-W)

Categories, spendable-on rules, the append-only trigger, idempotency keys, fee draw-down, promotion holds, usage bundles and the credit statement section are described in `GROWTH.md` ("P2-W provider credit integration"). This file keeps the CR-05 base model.
