# QA staging — ETA pre-prod, WhatsApp sandbox, sales pilots (QA-06)

Rehearsal environment for Egypt fiscal drills and tiered sales demos before live clinics.

## Staging profile

Set on the **API** process:

| Variable | Purpose |
|----------|---------|
| `KIORLY_ENV=staging` | Enables pilot seed + ETA pre-prod defaults at boot |
| `SEED_PILOT_TENANTS=true` | Ensures Lite / Pro / Clinic pilot orgs on `prisma` seed |
| `ALLOW_DEMO_SEED=true` | Required on production-shaped stacks to seed `demo` passwords |
| `ALLOW_DEMO_RESET=true` | Allows `npm run demo:reset` on production-shaped hosts |

Template: [`apps/api/.env.staging.example`](../apps/api/.env.staging.example)

### ETA (pre-production)

When `KIORLY_ENV=staging` and `ETA_API_BASE_URL` is unset, the API sets:

- `ETA_API_BASE_URL` → `https://api.preprod.invoicing.eta.gov.eg`
- `ETA_TOKEN_URL` → `…/connect/token`

Load clinic credentials from Secrets Manager or env (`scripts/configure-apprunner-eta.sh`). Run billing drill per [ETA_RECEIPT_V12.md](./ETA_RECEIPT_V12.md).

### WhatsApp sandbox

| Variable | Purpose |
|----------|---------|
| `WHATSAPP_API_URL` | BSP / Meta test gateway |
| `WHATSAPP_API_TOKEN` | Bearer token |
| `WHATSAPP_SANDBOX_NUMBERS` | Comma-separated E.164 allowlist; other numbers are no-op (success without send) |

Pro and Clinic pilots seed with `whatsapp_reminders` enabled.

## Pilot tenants

Seeded when `KIORLY_ENV=staging` or `SEED_PILOT_TENANTS=true` (password **`demo`**):

| Tier | Organization | Login |
|------|--------------|-------|
| Lite | Sales pilot — Lite | `sales-lite@pilot.kiorly.com` |
| Pro | Sales pilot — Pro | `sales-pro@pilot.kiorly.com` |
| Clinic | Sales pilot — Clinic | `sales-clinic@pilot.kiorly.com` |

Each org: one Cairo clinic, group admin + physician + reception, three patients (`PILOT-001` … `003`), subscription on the matching plan.

Implementation: [`apps/api/prisma/pilot-tenants.seed.ts`](../apps/api/prisma/pilot-tenants.seed.ts)

## Sales demo reset (acceptance)

**One command** (from repo root):

```bash
npm run demo:reset -- --tier=pro
```

Reset all three pilots:

```bash
npm run demo:reset -- --all
```

Purges appointments, encounters, revenue, fiscal queue, support tickets, etc., then restores baseline patients and `demo` passwords. Safe on staging only (or non-production / `ALLOW_DEMO_RESET`).

## Tests

- `qa06-sales-demo.node.test.ts` — catalog + CLI registration
- `qa06-sales-demo.integration.test.ts` — reset clears appointments, keeps 3 patients

## Status

| Task | Status |
|------|--------|
| QA-06 Staging + pilots | Shipped |

## Follow-ups

- CDK: set `KIORLY_ENV` / `SEED_PILOT_TENANTS` on staging App Runner + DbSeed Lambda only
- Scheduled `demo:reset --all` before daily sales stand-ups (optional CI cron)
- Anonymized RDS snapshot restore runbook for long-lived staging DBs