# Monthly settlement engine (CR-06)

| Item | Status |
|------|--------|
| CR-06 “Pay the higher of, never both” monthly settlement | **Done** |
| QA-03 Settlement & credit engine test matrix | **Done** |
| CR-11 Monthly statement (reads settled invoices) | **Done** |

## Purpose

Turn **subscription**, **Kiorex commissions**, **trial policy**, **prepaid** periods, **Lite carry-forward**, and **credit wallet** into one correct `KiorlyInvoice` per calendar month.

## Core rule (§04)

`settlePeriod()` in `settlement-calculator.ts`:

1. Compute subscription stack (subscription + seats + addons + usage).
2. Sum **CONFIRMED** Kiorex charges in the period; optional **Lite monthly cap** scales commission line amounts proportionally when capped.
3. Apply **trial commission policy** to commission for the higher-of comparison.
4. Bill **`max(subscription, commission)`**, not both — informational `KIOREX_COMMISSION_OFFSET` line for the lower side.
5. Apply **PREPAID**, **CREDIT** wallet, **TAX** (half-up per line, 2 decimals).

### Trial commission policy

| Policy | Effect |
|--------|--------|
| `WAIVE_ALL` | Commission does not count toward amount due |
| `WAIVE_UP_TO_PLAN_PRICE` (default) | Only commission **above** reference plan price counts |
| `CHARGE` | Full commission counts |

Resolved from `Market.featureDefaults.trial.commissionPolicy` + `Subscription.trialConfigOverride`.

### Lite

Commission only; balances below `kiorlyBilling.liteMinInvoice` (default **50** EGP) roll into `Tenant.kiorlySettlementCarry`.

## API

| Endpoint | Auth |
|----------|------|
| `GET /api/v1/billing/settlement/preview?period=YYYY-MM` | Tenant owner (or platform `tenantId=` param) |
| `POST /api/v1/admin/platform/settlement/run` | Platform super admin `{ period, tenantIds? }` |

## Scheduler

`SettlementScheduler` — hourly check; runs previous calendar month on **day 1 @ 02:00 Africa/Cairo** for all tenants with subscriptions.

Draft invoices for a `periodKey` are **regenerated** until **ISSUED** (`@@unique([tenantId, periodKey])`).

## Data

Migration `20261117308000_cr06_monthly_settlement`:

- `Tenant.kiorlySettlementCarry`
- `KiorlyInvoice.settlementSummaryJson` (explanation EN/AR for UI)

Confirmed charges → `BILLED` with `kiorlyInvoiceId` on settlement.

## Tests

- `cr06-settlement.node.test.ts` — nine §04 worked examples + rounding
- `cr06-settlement.integration.test.ts` — idempotent single invoice per period
- `qa03-settlement-matrix.node.test.ts` — table-driven §04 + edge cases; **fast-check** (10k runs) for `payable ≥ 0`, `payable ≤ max(S,C)+addons`, and credit-wallet **Σ ledger = balance** (`settlement-invariants.ts`, `settlement-test-matrix.ts`)

## Statements

Owner-facing monthly statement (JSON + bilingual PDF) built from the settled invoice — see **[MONTHLY_STATEMENT.md](./MONTHLY_STATEMENT.md)** (CR-11). Invoice `subtotal` excludes display-only `TAX` lines; VAT is computed once on `subtotal − creditsApplied`.

## Follow-ups

- Prorated subscription for partial months / mid-period plan changes
- ADDON / USAGE_OVERAGE from metered entitlements
- Auto-issue drafts after settlement review window