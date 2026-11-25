# Plans & pricing (PL-01)

Commercial source of truth for SaaS plans, per-market versioned prices, and headline entitlements.

## Data model

| Model | Purpose |
|-------|---------|
| `Plan` | `LITE`, `PRO`, `CLINIC`, `ENTERPRISE` — EN/AR names, public flag, sort order |
| `PlanPrice` | Market currency, `MONTHLY`/`ANNUAL`, `PER_TENANT`/`PER_CLINICIAN`, `priceVersion`, `validFrom`/`validTo`, optional `cohortKey` |
| `PlanEntitlement` | Key + `valueJson` (booleans, numbers, objects) e.g. `max_clinicians`, `eta_receipts` |
| `TenantPlanSubscription` | Links tenant → frozen `planPriceId` for grandfathering |

## API

| Endpoint | Auth | Notes |
|----------|------|--------|
| `GET /api/v1/public/plans?market=EG` | None | Public catalog; `Cache-Control: public, max-age=300` |
| `GET/POST/PATCH /api/v1/admin/platform/plans` | Platform super admin | Plan metadata |
| `GET/POST /api/v1/admin/platform/plans/:id/prices` | Platform super admin | Price history + new version (closes prior active row). `preview: true` → impact only (SB-06) |
| `GET /api/v1/admin/platform/plans/price-migrations?status=` | Platform super admin | SB-06 who-moves-when report |

## Egypt seed (demo)

- **Pro** — 1,299 EGP/month per clinician; **999** EGP/month equivalent on annual (per-clinician annual row).
- **Clinic** — 3,499 EGP/month per organization, **5** clinicians included, **699** EGP per extra clinician.
- **Lite** / **Enterprise** — list prices for packaging; Enterprise hidden from public catalog (`isPublic: false`).

Seeded by `ensurePlanCatalog` in `apps/api/prisma/plan-catalog-seed.ts` (entitlements from `plans.seed.ts` / PL-04 matrix; incremental seed safe).

See **[PLANS_AND_ENTITLEMENTS.md](./PLANS_AND_ENTITLEMENTS.md)** for the module × plan matrix and controller map.

## Web

- Platform → **Plans & pricing** (`/platform/plans`) — `PlatformPlansTab`.

## Migration

`20261117210000_pl01_plan_catalog`

## PL-04 module map

- Canonical matrix: `apps/api/src/entitlements/plans-matrix.ts`
- `@RequiresEntitlement` on tenant API controllers per matrix
- Table-driven coverage: `pl04-controller-coverage.node.test.ts`
- Doc ↔ seed sync: `pl04-matrix-doc.node.test.ts`

## PL-03 entitlements

- `EntitlementsService.resolve(tenantId)` — plan catalog (+ trial plan when `TRIALING`) ⊕ `TenantEntitlementOverride`.
- Plan layer in `FeatureFlagsService` for `eta_receipts` / `ai_assistant`.
- `@RequiresEntitlement` + `EntitlementGuard`; limits via `assertWithinLimit` / `assertCanAddClinician`.
- `GET /auth/me` includes `plan` and `entitlements`; `PUT /admin/platform/tenants/:id/entitlement-overrides/:key`.
- Web: `useEntitlement`, `<Gate>` / `EntitlementGate`, `UpgradeHint` modal.

## PL-07 plan changes & proration

- Daily-prorated preview for upgrades, seat adds, and annual mid-cycle changes.
- Upgrades apply immediately; downgrades and seat removals default to period end.
- `User.billingSeatActive` — physicians over the seat cap become read-only (cannot book or sign); clinical data retained.
- APIs: `POST /billing/subscription/preview-change`, `change-plan`, `preview-seats`, `seats`.
- Migration `20261118200000_pl07_subscription_proration`.

## PL-02 subscriptions

- One `Subscription` per tenant (`SubscriptionStatus` lifecycle, `SubscriptionEvent` audit trail).
- APIs: `GET/POST /api/v1/billing/subscription`, `change-plan`, `cancel`.
- Daily `SubscriptionLifecycleScheduler` (trial notices, period roll, period-end cancel).
- Admin → Organization → **Plan & billing** (`AdminOrgBillingPanel`).
- See lifecycle detail in migration `20261117220000_pl02_subscription_lifecycle`.

## CR-01 trial engine

- See **[TRIAL_ENGINE.md](./TRIAL_ENGINE.md)** — founding vs standard trial, activation visits, extend-trial, `GET /billing/trial`, web banner.

## CR-04 Kiorex fees

- See **[KIOREX_FEES.md](./KIOREX_FEES.md)** — commission rates, benchmark guardrail, `GET /public/kiorex-fees`, platform admin UI.

## CR-05 credit wallet

- See **[CREDIT_WALLET.md](./CREDIT_WALLET.md)** — ledger, FIFO expiry, `GET /billing/wallet`, platform grant API, org billing UI.

## SB-01 Kiorly invoices

- See **[KIORLY_INVOICES.md](./KIORLY_INVOICES.md)** — SaaS invoices vs patient `Invoice`, gapless numbering, `GET /billing/invoices`, org UI.

## SB-02 Kiorly payments

- See **[KIORLY_PAYMENTS.md](./KIORLY_PAYMENTS.md)** — Paymob/Fawry/InstaPay/bank, webhooks, auto-charge, pay modal.

## SB-03 dunning & access

- See **[DUNNING.md](./DUNNING.md)** — config-driven timeline, `SubscriptionAccessGuard`, banners, clinical read/export never blocked.

## PA-02 commercial config

- See **[COMMERCIAL_CONFIG.md](./COMMERCIAL_CONFIG.md)** — `Market.commercialConfig`, platform Markets UI, Zod validation, audit.

## CR-06 monthly settlement

- See **[MONTHLY_SETTLEMENT.md](./MONTHLY_SETTLEMENT.md)** — higher-of engine, preview/run APIs, Cairo scheduler.

## PL-08 plan & billing paywall

| Item | Status |
|------|--------|
| Global 402 `PLAN_UPGRADE_REQUIRED` → upgrade modal | **Done** — `apps/web/src/lib/http.ts`, `UpgradePaywallModal` |
| Admin Plan & billing hub (trial, Kiorex progress, usage, wallet, invoices) | **Done** — `AdminOrgBillingPanel` |
| Paywall telemetry | **Done** — `POST /api/v1/billing/paywall-events` → `AuditLog` (`paywall.view` / `paywall.conversion_intent`) |
| Non-owners | Pay controls hidden; modal copy directs to owner |

Tests: `pl08-paywall.node.test.ts`, `pl08-paywall.integration.test.ts`.

## SB-06 price indexation & grandfathering

| Item | Status |
|------|--------|
| SB-06 Currency, price indexation & grandfathering | **Done** |

Publishing a new `PlanPrice` version (same plan / market / interval / unit / cohort) creates one `PlanPriceMigration` per live subscription on an older version of that segment:

- **When:** first renewal (`currentPeriodEnd` + whole billing periods) on or after `max(now + notice, priceLockUntil, validFrom)`. Notice = `kiorlyBilling.priceChangeNoticeDays` in the market pack (default **30**).
- **Founding lock:** subscriptions with a future `priceLockUntil` are never scheduled — or applied — before the lock ends; the apply job re-checks the lock and reschedules if needed.
- **Notice job** (`PriceIndexationScheduler`, hourly): at `noticeDueAt` (30 + 2 days before the move) enqueues `billing.price_change_notice` (INTERNAL outbox) with EN + AR copy and audits `subscription.price_change_notice`.
- **Apply:** at `effectiveAt`, only after a full notice period, swaps `Subscription.planPriceId`, records `consentByContinuingAt`, writes `SubscriptionEvent price_migrated`, audit `subscription.price_migrated`, outbox `billing.price_change_applied`. Cancelled / cancelling / changed-plan subscriptions → migration `CANCELLED`. A newer version supersedes pending moves.
- **Preview:** `POST …/prices` with `preview: true` returns tenants affected, locked tenants, MRR before/after/delta (annual ÷ 12, seats included) and per-tenant move dates — nothing is written.

Web: Platform → Plans & pricing → **Preview impact** + **Scheduled price moves** report.

Migration `20261118236000_sb06_price_indexation` (`PlanPriceMigration`, `PriceMigrationStatus`).

Tests: `sb06-price-indexation.node.test.ts`, `sb06-price-indexation.integration.test.ts`, `apps/web/e2e/sb06-price-impact.spec.ts`.

## SUB-01 recurring subscription, auto-renew and Lite downgrade (built and tested locally; not deployed)

**Rule (founder):** a paid subscription renews automatically by default; switching renewal off, or a lapse that dunning cannot fix, moves the organisation to the **free Lite plan, never to lockout**. Data is never deleted.

| Topic | How it works | Where |
|---|---|---|
| Default | `Subscription.autoRenew` defaults to ON; after the trial the activation keeps it ON; the market default is `kiorlyBilling.subscription.autoRenewDefault` | `subscription-policy.ts`, migration `20270201100000_sub01_auto_renew_lite_downgrade` |
| Renewal charge | The renewal money path is the existing one: the monthly settlement issues the invoice, `KiorlyPaymentService.scheduleAutoChargeOnIssue` charges the saved card token through the `PaymentGateway` interface (`chargeToken`), retries D+1, D+3, D+7, dunning after. Nothing new talks to a PSP, so the concurrent payments lane can swap the adapter layer without touching this. | `billing-platform/*`, unchanged contract |
| Period end | `SubscriptionRenewalService.runDaily` (called by the daily lifecycle): auto-renew ON rolls the period (optimistic lock, so concurrent runs roll once); OFF or a scheduled cancel moves to Lite. A scheduled cancel no longer ends in CANCELLED. | `subscription-renewal.service.ts`, `subscription-lifecycle.service.ts` |
| Reminders | `renewal_reminder` (auto-renew on), `renewal_off_reminder`, `payment_method_missing`, `payment_failed`, `downgrade_warning`, `downgraded_to_lite`, `auto_renew_on/off`, `reactivated` through the INTERNAL outbox topic `billing.subscription_notice` (email + WhatsApp row, MODE=mock by default). One reminder per offset per period, the tightest due offset only; deferred out of the owner quiet hours (policy `reminderQuietHours`). They are account-holder transactional notices, not marketing. | `email-templates.ts`, `email-outbox.service.ts` |
| Dunning end | `lapseAction = DOWNGRADE_TO_LITE` (default): grace until day `downgradeAfterDays` (15) after the oldest unpaid invoice due date, then Lite. The legacy READ_ONLY then SUSPENDED path stays available as `READ_ONLY_SUSPEND`. A warning goes out the day before. The unpaid invoice stays payable; paying it does not undo Lite (the owner upgrades). | `dunning.service.ts`, `DUNNING.md` |
| Cancel auto-renew | Owner or org admin only, with a confirmation that carries the downgrade impact (`AUTO_RENEW_CONFIRMATION_REQUIRED` until `confirmDowngrade: true`). The plan stays until the period end. The month in which the paid term ends is still billed (`downgradeReason = auto_renew_off` is "paid through" in the settlement); a dunning or forced downgrade is not billed forward. | `setAutoRenew`, `settlement.service.ts` |
| Reactivate / upgrade from Lite | `POST /billing/subscription/reactivate` (defaults to the plan held before Lite; same legal acceptance and PDPC launch gates as `change-plan`). Paid to paid uses the existing `change-plan` preview + confirm. | `reactivate` |
| Proration | Upgrade/downgrade timing defaults come from `kiorlyBilling.subscription.proration` (engineering defaults IMMEDIATE and PERIOD_END). The daily-prorated amounts are the PL-07 ones. `creditUnusedOnDowngrade` is stored but NOT applied (no credit is granted until LG-SUB-3 is decided). | `subscription.service.ts` |
| Tax | Display line from the market pack `kiorlyBilling.taxRatePercent` (NEEDS_HUMAN); never submitted to any authority (ADR-011). | `plan-comparison.service.ts` |

### Lite (free) definition
Lite is a normal catalog plan: `PlanEntitlement` rows (seeded from `plans-matrix.ts`, editable on Platform, Plans and pricing) hold the limits (`max_clinicians`, `max_branches`, `max_assistant_seats`) and the modules. On downgrade: seats above the Lite cap become read-only (`billingSeatActive`, PL-07), nothing is removed; modules Lite does not include stay **readable** for `liteReadOnlyGraceDays` (default 30; `EntitlementsService.resolve().liteGrace`, GET and HEAD only on gated controllers, `/auth/me` returns `planGrace`), writes answer 402 `PLAN_UPGRADE_REQUIRED`. After the grace the modules need an upgrade; the data is still stored and returns on upgrade. The downgrade impact (lost features, shrinking limits against current usage) is returned **before** confirming by `GET /billing/subscription/downgrade-impact`, `POST auto-renew` and `GET /billing/plans/compare`.

### Configuration (market pack, maker-checker)
`kiorlyBilling.subscription` in `Market.featureDefaults` (mirrored in `commercialConfig.subscription`): `autoRenewDefault`, `orgMayDisableAutoRenew`, `renewalReminderDaysBefore`, `lapseAction`, `downgradeAfterDays`, `liteReadOnlyGraceDays`, `proration.{upgradeTiming,downgradeTiming,creditUnusedOnDowngrade}`, `reminderQuietHours`. The block is **only** changed through `PUT /admin/platform/subscriptions/policy/:marketId/proposals` (maker) and `POST .../proposals/:id/decision` (a different platform admin, checker); the plain commercial-config PUT refuses to edit it (`SUBSCRIPTION_POLICY_REQUIRES_APPROVAL`). Per organisation: the owner or an org admin switches auto-renew; a platform super admin can force ON or OFF (reason mandatory, audit `subscription.auto_renew_forced`) or move an organisation to Lite (`subscription.platform_force_downgrade`).

### API
| Endpoint | Who | Notes |
|---|---|---|
| `GET /billing/subscription/renewal` | owner, group admin, finance | state for the UI and the staff app card |
| `GET /billing/plans/compare` | same | every plan of the edition, entitlements, prices (or `priceNeedsHuman`), downgrade impact |
| `GET /billing/subscription/downgrade-impact?plan=` | same | |
| `POST /billing/subscription/auto-renew` `{enabled, confirmDowngrade?}` | owner, group admin, clinic admin | `AUTO_RENEW_FORCED`, `AUTO_RENEW_CANNOT_DISABLE`, `AUTO_RENEW_CONFIRMATION_REQUIRED` |
| `POST /billing/subscription/reactivate` | owner, group admin, clinic admin | |
| `GET /admin/platform/subscriptions`, `/metrics` | platform super admin | list, MRR per currency, churn-lite, downgrades by reason, reactivations |
| `POST /admin/platform/subscriptions/:tenantId/force-auto-renew`, `/force-downgrade` | platform super admin | reason mandatory |

### Web
Admin, Plan and billing links to **/plan** (Upgrade plan): current plan, usage against limits, renewal date, auto-renew switch with confirmation, comparison table, payment method, invoice history (English and Arabic RTL, light and dark, 320 and 1440 px, axe clean). Platform, **Subscriptions** (`/platform/subscriptions`): list, MRR, churn-lite, forced actions, policy proposals. The Kiorly staff app shows a read-only plan card with a "manage on the web" link: plans are not sold inside the iOS or Android apps (store policy, LG-SUB-4).

### Tests
`sub01-policy.node.test.ts`, `sub01-renewal.integration.test.ts` (default ON, renew, 8-way concurrent runs, cancel to Lite, Lite enforcement, dunning to Lite, reactivate, roles and tenant isolation, force, reminders and quiet hours, comparison, paid-through billing, maker-checker), web `plan-billing.node.test.ts`, Playwright `e2e/sub01-plan-billing.spec.ts` (`playwright.sub01.config.ts`).

## Follow-ups

- Sender for INTERNAL `billing.price_change_notice` (WhatsApp/email) — pairs with MS-04 owner digests; needs approved templates (NH-004).
- Wire `FeatureFlagsService` / `@RequiresEntitlement` to `PlanEntitlement` and tenant subscription.
- Signup + Kiorly billing invoices (`KiorlyInvoice`) charging against subscribed `planPrice`.
- Public marketing site consuming `GET /public/plans`.
- See **[AUDIT_BILLING.md](./AUDIT_BILLING.md)** — SC-07 billing audit catalog, `GET /admin/platform/audit`, platform org Audit tab.
## Marketing site (GT-01)

Public `/marketing` and `/pricing` (same page). Plans from `GET /public/plans`, Kiorex fees from `GET /public/kiorex-fees`, founding seats from `GET /public/cohorts/FOUNDING_EG/remaining`. Calculator: ceil(monthly plan / fee). Display amounts are the API amount strings unchanged.
