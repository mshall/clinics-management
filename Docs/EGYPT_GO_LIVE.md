# Egypt clinic go-live

**Data residency:** Obtain **government permission** for cross-border processing (Path A Frankfurt) or in-country hosting (Path B) **immediately before launch** — see [DATA_RESIDENCY_DECISION.md](./DATA_RESIDENCY_DECISION.md) § Launch gate. Do not treat engineering/pilot stacks as regulatorily cleared production.

Canonical checklist: **[markets/egypt.md](./markets/egypt.md)** (market pack **EG**).

**No tax-authority reporting.** Kiorly does not submit e-receipts or e-invoices to the Egyptian Tax Authority or anyone else; clinics and doctors file their own taxes: **[NO_TAX_AUTHORITY_REPORTING.md](./NO_TAX_AUTHORITY_REPORTING.md)** (the ETA receipt drill and MN-04 ETA production cutover docs are retired, see [FD-02_ETA_RETIRED.md](./FD-02_ETA_RETIRED.md)).

## Launch quality & compliance (engineering shipped)

| Task | Doc | Notes |
|------|-----|--------|
| QA-01 Golden-flow E2E | [QA_GOLDEN_FLOW.md](./QA_GOLDEN_FLOW.md) | Playwright EN/AR, Lite, Kiorex — CI on PR |
| QA-02 Money-path API tests | [QA_MONEY_PATH.md](./QA_MONEY_PATH.md) | ≥85% line coverage gate (`billing`, `billing-platform`, `credits`) |
| QA-05 Observability | [QA_OBSERVABILITY.md](./QA_OBSERVABILITY.md) | Operational alerts, runbooks, on-call webhooks |
| SC-02 PDPC / privacy | [SC02_PDPC_EGYPT.md](./SC02_PDPC_EGYPT.md) | ROPA, breach procedure, paid launch gate; **business filings** still with Legal |
| SC-03 Patient consent | [PATIENT_CONSENT.md](./PATIENT_CONSENT.md) | API + check-in capture |
| QA-06 Staging & pilots | [QA_STAGING.md](./QA_STAGING.md) | `KIORLY_ENV=staging`, `demo:reset` |