# Trial engine (CR-01)

| Item | Status |
|------|--------|
| CR-01 Founding trial, activation, lifecycle, APIs, web banner | **Done** |

## Purpose

Configurable SaaS trial per market and cohort: long **founding** trial when the clinic meets an activation rule (qualifying check-ins), otherwise a shorter **standard** trial. Notifies owners before shortening and before trial end; converts to paid on trial end when a payment method exists; otherwise grace then **Lite** (data retained, Pro entitlements dropped).

## Config

Resolved from `Market.featureDefaults.trial` ⊕ `Subscription.cohortKey` ⊕ `Subscription.trialConfigOverride` (platform).

Defaults (`trial-config.ts`):

| Key | Default |
|-----|---------|
| `foundingDays` | 180 |
| `standardDays` | 90 |
| `activationWindowDays` | 30 |
| `minQualifyingVisits` | 20 (status `CHECKED_IN` or `COMPLETED` with `checkedInAt` in window) |
| `shortenWarningDay` | 21 |
| `endNoticeDays` | 14, 7, 3, 0 |
| `postTrialGraceDays` | 7 |
| `commissionPolicy` | `waived` (stub for CR-06) |

## Data model

Migration `20261117301000_cr01_trial_engine`:

- `Subscription.trialQualifiedAt` — activation rule met
- `Subscription.trialShortenWarnedAt` — day-21 owner warning sent
- `Subscription.trialConfigOverride` — platform JSON overrides
- `Subscription.postTrialGraceUntil` — grace after trial end without payment

All transitions write `SubscriptionEvent` (+ `AuditLog`).

## API

| Endpoint | Auth | Notes |
|----------|------|--------|
| `GET /api/v1/billing/trial` | Tenant user | `{ endsAt, daysLeft, activated, activationProgress, status, commissionPolicy }` |
| `POST /api/v1/admin/platform/tenants/:id/extend-trial` | Platform super admin | `{ days, reason, trialConfigOverride? }` |

## Scheduler

`SubscriptionLifecycleScheduler` → `TrialEngineService.runDaily` (shorten, notices, trial end, grace, Lite downgrade). Qualifying visits also re-evaluate on front-desk **check-in**.

## Web

- In-app banner: `TrialBanner` in `AppShell` (en + ar `trial.banner.*`).
- Signup copy updated for founding trial (not 14-day).

## Tests

- `cr01-trial.node.test.ts` — 180/90 from config, activation thresholds.
- `cr01-trial.integration.test.ts` — shorten + Lite downgrade preserves patients/appointments.

## Follow-ups

- Commission policy during trial wired in **CR-06** settlement (`MONTHLY_SETTLEMENT.md`).
- Dedicated outbox worker templates for `billing.trial_notification` (email/WhatsApp).
- First Kiorly invoice on `activateSubscription` when payment method present.
- Platform UI to edit `trialConfigOverride` without raw JSON.
- Seed Egypt market `featureDefaults.trial` in market provision for non-default markets.