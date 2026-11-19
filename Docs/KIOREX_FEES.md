# Kiorex commission rates (CR-04)

| Item | Status |
|------|--------|
| CR-04 Kiorex fee config, benchmark guardrail, public fees API | **Done** |
| CR-03 Kiorex commission charge capture & lifecycle | **Done** — see [KIOREX_COMMISSION_CHARGES.md](./KIOREX_COMMISSION_CHARGES.md) |
| CR-08 Commission disputes & adjustments | **Done** — see [KIOREX_COMMISSION_CHARGES.md](./KIOREX_COMMISSION_CHARGES.md) |
| CR-07 “Kiorly is free” progress meter & owner nudges | **Done** — `GET /billing/kiorex-progress`, Admin billing + Kiorex charges ring |

## Purpose

Configurable Kiorex booking commission per **market** and optional **clinical specialty**, with competitor benchmark fields and a **warning** (not a block) when the configured fee drifts above a target fraction of the lowest competitor fee (default **50%**).

## Data model

Migration `20261117303000_cr04_kiorex_commission_rates`:

- `FeeType`: `FLAT` | `PERCENT`
- `KiorexCommissionRate` — amount/percent, min/max, benchmark flat/percent, source, `validFrom` / `validTo`
- Market pack: `Market.featureDefaults.kiorex.benchmarkTargetRatio` (default `0.5`), optional `liteMonthlyCap`

## Resolution

`resolveKiorexCommissionRate`: active rows only → **specialty** row → **market default** (`specialty` null).  
`applyPercentCommission`: percent of visit fee with min/max clamps.

## API

| Endpoint | Auth | Notes |
|----------|------|--------|
| `GET/POST/PATCH/DELETE /api/v1/admin/platform/kiorex-rates` | Platform super admin | CRUD + `aboveBenchmarkTarget` on list |
| `PATCH /api/v1/admin/platform/kiorex-rates/market/:marketId/settings` | Platform super admin | Target ratio, Lite monthly cap |
| `GET /api/v1/public/kiorex-fees?market=EG` | None | Public pricing card data (`Cache-Control` 5m) |

## Web

- Platform → **Kiorex fees** (`/platform/kiorex-rates`) — table with red **Above 50% target** chip when applicable (en + ar).

## Tests

- `cr04-kiorex-commission.node.test.ts` — specialty vs default, expired ignored, PERCENT min/max.

## Follow-ups

- **CR-06** — bill `CONFIRMED` charges on periodic Kiorly invoices (`BILLED`).
- Edit/delete rate rows in UI; validity window picker.
- Seed default EG Kiorex rates in market go-live template.
- Competitor benchmark refresh job + audit trail.