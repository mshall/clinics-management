# MN-04 ETA production cutover (pilot clinics)

| Task | Status |
|------|--------|
| MN-04 ETA production cutover for pilot clinics | **Done** |
| Depends on | FD-00 (market tax pack) |

## Pre-production drill

Before pointing a pilot clinic at **production** ETA credentials, run the checklist in [ETA_RECEIPT_V12.md](./ETA_RECEIPT_V12.md) § Billing go-live checklist:

1. Sale → return → corrected resend (preprod).
2. Expired device credentials path (`CREDENTIALS_EXPIRED`).
3. Submission status poll (`providerValidationStatus`).
4. CI: `mn04-eta-preprod-drill.node.test.ts` pins the required test files.

## Production credentials

Per clinic: **Clinics → Settings → Receipt devices** — save live client ID/secret (Secrets Manager in AWS; `local:` only for dev). The panel shows **pre-production vs production** API environment from `ETA_API_BASE_URL`.

## Pilot week 1 metric

- Group admin / owner starts the clock: `POST /api/v1/admin/eta-pilot/start` (or UI **Start production pilot week 1**).
- Success rate = `VALID` automatic submissions ÷ all submitted automatic receipts (excludes `:resubmit:` idempotency keys).
- Target: **≥ 95%** ([markets/egypt.md](./markets/egypt.md)).

## Dashboard & alerts

| Method | Path | Role |
|--------|------|------|
| GET | `/api/v1/admin/eta-health` | Owner, group/clinic admin, finance |
| POST | `/api/v1/admin/eta-pilot/start` | Owner, group admin, finance |

- Daily series, per-clinic breakdown, top rejection classes.
- Scheduler (disable: `ETA_HEALTH_SCHEDULER=false`) writes audit `ETA_SUCCESS_BELOW_THRESHOLD` when prior day &lt; 95% (≥ 5 submissions, 20h cooldown).

## UI

**Administration → Organization & settings → ETA production health** (EG market, `eta_receipts` entitlement).

## Runbooks

Top rejection classes (EN in product UI `compliance.etaRunbook.*`; full steps):

- [runbooks/ETA_REJECTION_RUNBOOK.md](./runbooks/ETA_REJECTION_RUNBOOK.md)

## Tests

- `mn04-eta-pilot-success.node.test.ts` — 95% gate, manual resubmit exclusion.
- `mn04-eta-preprod-drill.node.test.ts` — drill test file registry.
- `eta-rejection-runbook.node.test.ts` — runbook key mapping.

## Follow-ups

- Platform-wide ETA health across all EG tenants (super-admin console).
- Email/WhatsApp alert channel for `ETA_SUCCESS_BELOW_THRESHOLD` (audit-only today).
- Auto-start pilot clock on first production credential save per clinic.