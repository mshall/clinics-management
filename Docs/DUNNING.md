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
| Lite Kiorex listing pause (unpaid commission) | D+30 |

Anchor: oldest unpaid **ISSUED** `KiorlyInvoice.dueAt`. Dunning pauses while `Subscription.kiorlyDunningPausedUntil` (SB-02 manual review).

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

## Follow-ups

- Email/SMS for D−3 / D0 reminders
- Kiorex public API copy when `marketplacePaused`
- Auto-restore `marketplaceBookable` flags after payment (today: pause-only)
- Platform admin override / hardship waiver window