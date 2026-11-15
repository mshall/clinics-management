# Egypt market go-live

Instance of [MARKET_GO_LIVE_TEMPLATE.md](../MARKET_GO_LIVE_TEMPLATE.md) for market code **EG** (`market-egypt`). Data residency: **Frankfurt (`eu-central-1`)** until Egyptian government consent for in-country hosting.

## 1. ETA e-receipt onboarding

| Step | Owner | Notes |
|------|--------|--------|
| Tax registration (RIN) on organization TRN | Group admin | Admin → Organization → TRN; flows to all clinics |
| Per-clinic branch / POS code | Clinic admin | Clinic → Settings → Egypt ETA |
| Taxpayer activity code | Group admin | Market default `8690` (medical); clinic override if needed |
| GPC / ETA item codes per service | Group admin + finance | Org default; clinic overrides |
| E-signature token or seal | Platform ops | `ProviderCredential` → Secrets Manager; `scripts/configure-apprunner-eta.sh` for legacy env bridge |
| Production submit test | Finance | Queue from check-in/billing → submit via compliance API |

Fiscal provider key: **`eta-egypt`** (`FiscalDocument` + `FiscalSubmission`).

Every posted payment path queues fiscal: check-in, visit fee, billing payment, tax invoice.

## 2. Data protection (Egypt PDPL)

| Topic | Requirement |
|-------|-------------|
| Licensing | `licenseNumber` per branch |
| DPO | Named in HR org chart |
| Consent | `POST /compliance/patients/:id/data-protection-consent` |
| Breach handling | [COMPLIANCE_CONTROLS.md](../COMPLIANCE_CONTROLS.md) |
| Data flows | RDS + S3 **Frankfurt**; optional OpenAI assistant |

## 3. Backup, restore, incident

See [COMPLIANCE_CONTROLS.md](../COMPLIANCE_CONTROLS.md#backup-and-restore) and [#incident-response](../COMPLIANCE_CONTROLS.md#incident-response).

## 4. Legal pack (per clinic)

Arabic privacy notice, terms, DPA — legal review required.

## 5. Support & pilot

| Item | Default |
|------|---------|
| Support hours | Sun–Thu 09:00–18:00 Africa/Cairo |
| P1 response | 4 hours |
| Pilot length | 30 days first branch |
| Pilot success | ETA/fiscal submit ≥ 95%; zero unresolved P1; MFA on group admin |

## 6. Payment methods (market data)

Cash, InstaPay, Fawry, card — configured on `Market.paymentMethods` for EG.

## 7. Admin configuration summary

**Organization:** TRN, VAT %, ETA defaults, WhatsApp reminders.

**Clinic:** Contact, currency, invoice logo, ETA branch.

**User:** Profile → MFA.

See [CLINIC_PLATFORM_CAPABILITIES.md](../CLINIC_PLATFORM_CAPABILITIES.md) and [FRONT_DESK.md](../FRONT_DESK.md).