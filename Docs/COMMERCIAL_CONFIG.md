# Commercial configuration (PA-02)

| Item | Status |
|------|--------|
| PA-02 Per-market commercial config UI | **Done** |

## Purpose

Edit **section 03** commercial parameters per market without deploys: trial, Kiorex, Lite billing, dunning, referral rewards. Plan **prices** remain versioned on **Platform → Plans** (PL-01).

## Data

- `Market.commercialConfig` (JSON, Zod-validated) — migration `20261117309000_pa02_commercial_config`
- On save, config is **merged** into `Market.featureDefaults` so runtime readers (trial engine, dunning, settlement, Kiorex) pick up changes immediately — no API restart.

## API

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/v1/admin/platform/markets/:id/commercial-config` | Platform super admin |
| PUT | `/api/v1/admin/platform/markets/:id/commercial-config` | Save + audit + preview in response |
| POST | `/api/v1/admin/platform/markets/:id/commercial-config/preview` | Dry-run diff only |

Invalid payloads return HTTP 400 `{ code: "COMMERCIAL_CONFIG_INVALID", issues }`.

Audit: `market.commercial_config_updated` on `AuditLog` (platform actor, `resourceId` = market).

## Web

**Platform → Markets → Commercial** opens the form (en + ar help text). Preview lists changed keys before save.

## Tests

- `pa02-commercial-config.node.test.ts` — Zod rejection + bridge to `featureDefaults`
- `pa02-commercial-config.integration.test.ts` — persist, audit, effective dunning timeline

## Follow-ups

- Cohort editor UI (array) alongside trial section
- ~~Wire `referral` block into credit wallet grants~~ Done: `ReferralRewardService` grants both sides on the referred organisation's first paid invoice (REFERRAL reason, category REFERRAL, idempotency key `referral:<referralId>:<role>`, expiry from `referral.expiryMonths`); GRW-P2-W added the key and the end-to-end tests
- `autoConfirmHours` consumption in Kiorex charge lifecycle
- Diff viewer comparing `commercialConfig` vs synced `featureDefaults`

## `credit` block (GRW-P2-W, optional, ADR-048 Proposed)

| Key | Default | Meaning |
|---|---|---|
| `onboardingAmount` | 0 | one onboarding credit per organisation (reason ONBOARDING). 0 = nothing is granted. The amount is a founder decision (KX-12), NEEDS_HUMAN |
| `connectBonusAmount` | 0 | one credit per organisation on the first approval of its Kiorex connection (reason CONNECT_BONUS, unique key `connect:<orgId>`). 0 = nothing is granted |
| `promotionalExpiryMonths` | 12 | expiry of ONBOARDING, PROMOTIONAL and REFERRAL lots when the grant gives none (W-4) |
| `recoveryExpiryMonths` | 24 | expiry of returned or waived fees and goodwill when the grant gives none |
| `usageBundlesEnabled` | false | the usage bundle skeleton also needs this (and the flag `clinic.usage_bundles`) |

Stored in `featureDefaults.credit` by the existing bridge; absent block = the defaults above (no platform grants).
