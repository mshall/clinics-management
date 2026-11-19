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

### Tax authority

None. Kiorly never reports to a tax authority ([NO_TAX_AUTHORITY_REPORTING.md](./NO_TAX_AUTHORITY_REPORTING.md)); there are no ETA variables.

### Mock providers

Staging runs every messaging / email / PSP integration in mock mode until the pre-launch pass ([MOCK_PROVIDERS.md](./MOCK_PROVIDERS.md)).

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

## Platform demo reset API (GT-05)

`POST /api/v1/admin/platform/demo/reset` with `{ "tier": "lite" | "pro" | "clinic" | "all" }` (platform super admin). Same purge/restore as the CLI; integration test requires completion in under 60 seconds. See [`SALES_KIT.md`](./SALES_KIT.md).

## Status

| Task | Status |
|------|--------|
| QA-06 Staging + pilots | Shipped |
| GT-05 Sales kit (reset API, ROI, rep QR) | Shipped |

## Follow-ups

- CDK: set `KIORLY_ENV` / `SEED_PILOT_TENANTS` on staging App Runner + DbSeed Lambda only
- Scheduled `demo:reset --all` before daily sales stand-ups (optional CI cron)
- Anonymized RDS snapshot restore runbook for long-lived staging DBs