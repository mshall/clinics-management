# Monthly settlement engine (CR-06)

| Item | Status |
|------|--------|
| CR-06 “Pay the higher of, never both” monthly settlement | **Done** |
| QA-03 Settlement & credit engine test matrix | **Done** |
| CR-11 Monthly statement (reads settled invoices) | **Done** |
| SB-05 Lite commission invoicing & minimum invoice | **Done** |

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

Commission only (SB-05). An invoice is created only when this month's Kiorex fees **plus carry-forward** reach `kiorlyBilling.liteMinInvoice` (market pack; code default **100**, matching `commercialConfig.lite.minInvoice`). Below the minimum the balance rolls into `Tenant.kiorlySettlementCarry` and is added next month as a `carry-forward` line; the carried `CONFIRMED` charges are marked `BILLED` on that invoice.

Re-runs are idempotent: `Tenant.kiorlySettlementCarryPeriodKey` + `kiorlySettlementCarryIn` record which period wrote the carry and what went into it, so re-settling the same month never double-counts.

Payment uses the same SB-02 rails (card token, Fawry, InstaPay). Unpaid Lite invoices are reminded and aged but **never pause or hide the Kiorex listing** (decision of 26 Nov 2026: collection never pauses listing; this replaces the earlier D+30 pause and the `liteCommissionMarketplacePauseDays` setting, which no longer exists; reversible by a code change only, never a flag). The Lite subscription itself never escalates to read-only — Kiorly keeps working. See [DUNNING.md](./DUNNING.md#kiorex-listing-and-unpaid-commission-sb-05-decided-26-nov-2026).

`GET /api/v1/billing/lite-fees?period=YYYY-MM` powers the **Kiorex fees this month** card (fees, carried forward, projected total, minimum invoice, pause notice) shown on Plan & billing instead of the subscription block for Lite.

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
- SB-05 `20261118235000_sb05_lite_commission_invoicing`: `Tenant.kiorlySettlementCarryPeriodKey`, `kiorlySettlementCarryIn`, `kiorexBillingPausedAt`
- `KiorlyInvoice.settlementSummaryJson` (explanation EN/AR for UI)

Confirmed charges → `BILLED` with `kiorlyInvoiceId` on settlement.

## Tests

- `cr06-settlement.node.test.ts` — nine §04 worked examples + rounding
- `cr06-settlement.integration.test.ts` — idempotent single invoice per period
- `sb05-lite-invoicing.node.test.ts` / `sb05-lite-invoicing.integration.test.ts` — Lite minimum invoice, carry shown + included next month, re-run idempotency, listing pause/resume
- `qa03-settlement-matrix.node.test.ts` — table-driven §04 + edge cases; **fast-check** (10k runs) for `payable ≥ 0`, `payable ≤ max(S,C)+addons`, and credit-wallet **Σ ledger = balance** (`settlement-invariants.ts`, `settlement-test-matrix.ts`)

## Statements

Owner-facing monthly statement (JSON + bilingual PDF) built from the settled invoice — see **[MONTHLY_STATEMENT.md](./MONTHLY_STATEMENT.md)** (CR-11). Invoice `subtotal` excludes display-only `TAX` lines; VAT is computed once on `subtotal − creditsApplied`.

## Follow-ups

- Carry-forward balance when a tenant switches from Lite to a paid plan mid-carry (today only Lite settlements read the carry)

- Prorated subscription for partial months / mid-period plan changes
- ADDON / USAGE_OVERAGE from metered entitlements
- Auto-issue drafts after settlement review window