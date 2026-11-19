# Tenant data export & offboarding (SC-05)

## API

- `POST /api/v1/exports/tenant` — owner full export (CSV bundle of patients, encounters, invoices); returns expiring `downloadToken`
- `POST /api/v1/exports/patient` `{ patientId }` — data-subject export
- `GET /api/v1/exports/:id` — job status
- `GET /api/v1/exports/download?token=` — download artifact
- `GET/POST /api/v1/exports/offboarding` — start cancellation → retention (30 d) → deletion schedule; `PUT …/legal-hold`

## SUSPENDED

`SubscriptionAccessAction.EXPORT` remains allowed for the owner while `SUSPENDED` (SB-03). Acceptance test covers this.

## UI

Settings → Data & privacy (exports + offboarding).

## Tests

`sc05-tenant-export.node.test.ts`, `sc05-tenant-export.integration.test.ts`.
