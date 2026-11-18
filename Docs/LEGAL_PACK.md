# GT-02 — Legal pack & versioned acceptance

| Item | Status |
|------|--------|
| GT-02 Terms, subscription, Kiorex fees, DPA, privacy, AUP, refund + acceptance | **Done** |

Counsel must still review text before production charging or marketplace listing. Pack version: bump `LEGAL_PACK_VERSION` in `legal-catalog.ts` when counsel publishes updates (current **2026-11-18** — SC-02 Arabic PDPL privacy notice).

Egypt **paid launch** also requires PDPC filings in hand — see [SC02_PDPC_EGYPT.md](./SC02_PDPC_EGYPT.md).

## Documents

| Id | Audience |
|----|----------|
| `terms_of_service` | Clinic operators |
| `subscription_terms` | Billing (trial, renewal, dunning) |
| `kiorex_marketplace_fees` | Marketplace new-patient fees & disputes |
| `dpa` | Clinic as controller |
| `patient_privacy_notice` | Patients (AR template) |
| `acceptable_use` | Platform use |
| `refund_policy` | SaaS refunds |

## API

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/v1/public/legal` | Catalog (id, version, titles) |
| `GET` | `/api/v1/public/legal/:doc` | Document body EN/AR |
| `GET` | `/api/v1/legal/status` | Pending acceptances for current pack |
| `POST` | `/api/v1/legal/accept` | Record `{ acceptances: [{ document, version }] }` |

## Enforcement

- **Signup:** required pack by plan (`LITE` base four; paid plans include subscription, refund, Kiorex fees).
- **Paid plan change:** `POST /billing/subscription/change-plan` with `confirm: true` blocked with `LEGAL_ACCEPTANCE_REQUIRED` until owner accepts current pack.

## Data

`LegalAcceptance` — `tenantId`, `userId`, `document`, `version`, `acceptedAt`, optional `ip`.

## UI

- Signup step — checkboxes + `/legal/:doc` viewer.
- In-app banner — `GET /legal/status` when pack version advances.

## Tests

- `gt02-legal.node.test.ts`
- `gt02-legal.integration.test.ts`

## Trial → paid

`activateSubscription` (e.g. trial end job) requires current legal pack on the tenant owner before **TRIALING → ACTIVE** on a paid plan.

## Follow-ups

- Counsel-reviewed PDF/HTML exports per market.
- Per-tenant custom DPA annexes.