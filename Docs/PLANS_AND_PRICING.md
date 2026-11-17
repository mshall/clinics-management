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
| `GET/POST /api/v1/admin/platform/plans/:id/prices` | Platform super admin | Price history + new version (closes prior active row) |

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

## Follow-ups

- Wire `FeatureFlagsService` / `@RequiresEntitlement` to `PlanEntitlement` and tenant subscription.
- Signup + Kiorly billing invoices (`KiorlyInvoice`) charging against subscribed `planPrice`.
- Public marketing site consuming `GET /public/plans`.
- See **[AUDIT_BILLING.md](./AUDIT_BILLING.md)** — SC-07 billing audit catalog, `GET /admin/platform/audit`, platform org Audit tab.