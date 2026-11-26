# Dunning & subscription access (SB-03)

| Item | Status |
|------|--------|
| SB-03 Dunning timeline + access policy (clinical records never blocked) | **Done** |

## Timeline (market pack)

Defaults in `market.featureDefaults.kiorlyBilling.dunning` (see `dunning-config.ts`):

| Milestone | Default |
|-----------|---------|
| Reminders | D−3, D0 |
| `PAST_DUE` | D+1 |
| `GRACE` (full access, banner) | D+1 … D+14 |
| `READ_ONLY` | from D+15 |
| `SUSPENDED` | from D+45 |
| ~~Lite Kiorex listing pause (SB-05)~~ **removed 26 Nov 2026**: an unpaid commission never pauses or hides the listing (collection never pauses listing) | never |

Anchor: oldest unpaid **ISSUED** `KiorlyInvoice.dueAt`. Dunning pauses while `Subscription.kiorlyDunningPausedUntil` (SB-02 manual review).

## SUB-01: dunning ends in Lite, not lockout

With `kiorlyBilling.subscription.lapseAction = DOWNGRADE_TO_LITE` (the default) the timeline above stops at `GRACE`: from `downgradeAfterDays` (15) after the due date the organisation moves to the free Lite plan (`SubscriptionRenewalService.downgradeToLite`, idempotent), keeps ACTIVE status, and every record stays readable for the Lite grace window. `READ_ONLY` and `SUSPENDED` only apply when the market sets `READ_ONLY_SUSPEND`. See [PLANS_AND_PRICING.md](./PLANS_AND_PRICING.md#sub-01-recurring-subscription-auto-renew-and-lite-downgrade-built-and-tested-locally-not-deployed).

## Access classes

`SubscriptionAccessGuard` + `subscription-access-policy.ts`:

| Action | READ_ONLY | SUSPENDED (owner) | SUSPENDED (staff) |
|--------|-----------|-------------------|-------------------|
| READ / EXPORT | ✅ | ✅ | ❌ login blocked |
| CLINICAL_WRITE / SCHEDULING / Kiorex book | ❌ | ❌ | — |
| BILLING | owner/finance | ✅ owner | — |

Pro entitlements (`mod_*`) are stripped in `EntitlementsService` for `READ_ONLY` / `SUSPENDED`.

## API

| Endpoint | Notes |
|----------|-------|
| `GET /api/v1/billing/access-state` | Banner key, allowed actions, marketplace pause |
| `SubscriptionAccessGuard` on appointments write, integration book, data export |

Daily job: `DunningScheduler` → `DunningService.runDaily()`.

Reactivation: `DunningService.reconcileAfterPayment()` on successful Kiorly payment (SB-02).

## Web

Escalating `DunningBanner` (en/ar) in app shell; owner **Pay Kiorly invoice** CTA → `/admin`.

## Tests

- `sb03-dunning.node.test.ts` — config-driven timeline + policy
- `sb03-dunning.integration.test.ts` — READ_ONLY escalation + payment reactivation
- `apps/web/e2e/sb03-read-only.spec.ts` — API probe when demo org is READ_ONLY

## Kiorex listing and unpaid commission (SB-05, decided 26 Nov 2026)

**Collection never pauses listing.** The earlier rule (an unpaid Lite/Kiorex commission invoice paused the listing at D+30 through `Tenant.kiorexBillingPausedAt`) conflicted with the commission collection principle (COM-1: collection never pauses listing, booking, plan or care). The founder delegated the choice to the recommendation on 26 Nov 2026 and the pause was removed:

- An unpaid commission is still reminded (D-3, D0), aged (`daysOverdue` in `GET /billing/access-state`), escalated (Lite subscription statuses never escalate; a non-Lite lapse follows the timeline above), disputable, and every timeline record is kept. It no longer touches the listing.
- `Tenant.kiorexBillingPausedAt` is **legacy**: nothing sets it; `DunningService` clears an old value once (audit `kiorex.listing.billing_resumed`, reason `commission_never_pauses_listing`) and re-evaluates the listings. Listing eligibility ignores it. The `liteCommissionMarketplacePauseDays` market-pack key no longer exists (a stale value is ignored); the Lite fees card carries no pause state.
- What still pauses a listing for billing reasons is the **subscription** state (`READ_ONLY` or `SUSPENDED`, a non-commission lapse, unchanged) plus the usual verification, profile and owner reasons. New Kiorex holds and bookings still require a `LIVE` listing.
- This is a code rule, not a feature flag (safety controls are never flags). Reversing it is a code change and a new founder decision.

Tests: `sb05-lite-invoicing.node.test.ts` (eligibility ignores the old flag; no pause window in the timeline or pack bridge) and `sb05-lite-invoicing.integration.test.ts` (D+31, D+60, D+120 unpaid commission keeps the listing; reminder record kept; legacy flag cleared once, idempotent).

## Follow-ups

- Email/SMS for D−3 / D0 reminders
- Kiorex public API copy when `marketplacePaused`
- Platform admin override / hardship waiver window