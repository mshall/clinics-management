# Egypt clinic go-live

**Data residency:** Obtain **government permission** for cross-border processing (Path A Frankfurt) or in-country hosting (Path B) **immediately before launch** — see [DATA_RESIDENCY_DECISION.md](./DATA_RESIDENCY_DECISION.md) § Launch gate. Do not treat engineering/pilot stacks as regulatorily cleared production.

Canonical checklist: **[markets/egypt.md](./markets/egypt.md)** (market pack **EG**).

ETA receipt **pre-production billing drill** (sale → return → corrected resend, credentials, status check): **[ETA_RECEIPT_V12.md](./ETA_RECEIPT_V12.md)** § Billing go-live checklist.

**MN-04 production cutover** (pilot health dashboard, 95% gate, runbooks): **[MN04_ETA_PRODUCTION.md](./MN04_ETA_PRODUCTION.md)**.

## Launch quality & compliance (engineering shipped)

| Task | Doc | Notes |
|------|-----|--------|
| QA-01 Golden-flow E2E | [QA_GOLDEN_FLOW.md](./QA_GOLDEN_FLOW.md) | Playwright EN/AR, Lite, Kiorex — CI on PR |
| QA-02 Money-path API tests | [QA_MONEY_PATH.md](./QA_MONEY_PATH.md) | ≥85% line coverage gate (`billing`, `billing-platform`, `credits`) |
| QA-05 Observability | [QA_OBSERVABILITY.md](./QA_OBSERVABILITY.md) | Operational alerts, runbooks, on-call webhooks |
| SC-02 PDPC / privacy | [SC02_PDPC_EGYPT.md](./SC02_PDPC_EGYPT.md) | ROPA, breach procedure, paid launch gate; **business filings** still with Legal |
| SC-03 Patient consent | [PATIENT_CONSENT.md](./PATIENT_CONSENT.md) | API + check-in capture |
| QA-06 Staging & pilots | [QA_STAGING.md](./QA_STAGING.md) | `KIORLY_ENV=staging`, `demo:reset` |