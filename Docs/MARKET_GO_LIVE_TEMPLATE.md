# Market go-live template

Use this checklist when platform ops launches a **new country pack** (`Market` row) and onboards the first tenants. Each market instance lives under `Docs/markets/<code>.md` (for example [egypt.md](./markets/egypt.md)).

## A. Platform admin — market pack

| Step | Notes |
|------|--------|
| Create draft market | **Platform → Market launch** — ISO code, currency, timezone, **host cell**, AWS data region |
| Configure JSON packs | `taxConfig`, `providerConfig`, `paymentMethods`, `featureDefaults` (DB or future admin UI) |
| Enable fiscal / claims / health connectors | One connector per provider key; credentials via `ProviderCredential.secretRef` only |
| Go live | `POST /admin/platform/markets/:id/launch` — tenants may only bind to `LIVE` markets |
| Deployment cell | Egypt: **Frankfurt (`frankfurt`, `eu-central-1`)** until in-country consent |

## B. Legal & compliance (per market)

| Topic | Deliverable |
|-------|-------------|
| Data protection law | Matrix row in [COMPLIANCE_CONTROLS.md](./COMPLIANCE_CONTROLS.md) |
| Fiscal receipts | Fiscal provider connector + pilot submit |
| Marketing consent | `legalConfig` texts per language (versioned) |
| Record retention | `legalConfig.retention` aligned with local law |

## C. First tenant onboarding

| Step | Notes |
|------|--------|
| Create organization | **Platform → Organizations** — pick **market**; `deploymentCell` inherits from market |
| Group admin MFA | Profile → TOTP before production |
| Clinic licenses & TRN | Per local market ID / tax fields |
| Provider credentials | Secrets Manager refs per clinic/device — never env vars in production |

## D. Pilot success (customize per market doc)

- Fiscal submit success rate threshold
- MFA on privileged roles
- P1 response SLA
- Optional messaging delivery rate

## E. Evidence

- Market row + launch timestamp
- Fiscal `FiscalSubmission` samples
- Audit log for settings changes