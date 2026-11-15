# Market go-live template

Use this checklist when platform ops launches a **new country pack** (`Market` row) and onboards the first tenants. Each market instance lives under `Docs/markets/<code>.md` (for example [egypt.md](./markets/egypt.md)).

## A. Platform admin — market pack

| Step | Notes |
|------|--------|
| Create draft market | **Platform → Market launch** — ISO code, currency, timezone, **host cell**, AWS data region |
| Configure JSON packs | `taxConfig` (incl. `taxRegistrationLabel*`, `licenseLabel*`, `taxAuthorityName*`, `fiscalProviderKey`), `providerConfig`, `paymentMethods`, `featureDefaults` — see [CLINIC_TAX_AND_LICENSING.md](./CLINIC_TAX_AND_LICENSING.md) |
| Enable fiscal / claims / health connectors | One connector per provider key; credentials via `ProviderCredential.secretRef` only |
| Go live | `POST /admin/platform/markets/:id/launch` — provisions shared AWS cell when region matches `PLATFORM_SHARED_DATA_REGIONS` (see [PLATFORM_MARKETS_AND_INSIGHTS.md](./PLATFORM_MARKETS_AND_INSIGHTS.md)) |
| Operability | Pause (days) or disable market — org onboarding uses `GET …/markets/operable` only |
| **Country feature flags** | Platform → Market launch → **Flags** — set `ai_assistant`, `eta_receipts`, payments, etc. for every tenant in that market (see [FEATURE_FLAGS.md](./FEATURE_FLAGS.md)) |
| **AiProvider** (optional) | `providerConfig.ai` — `baseUrl`, `model`, `secretRef`; independent of flag but required for LLM phrasing |
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