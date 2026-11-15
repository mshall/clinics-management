# Egypt clinic go-live

> **Canonical doc:** [markets/egypt.md](./markets/egypt.md) (market pack **EG**). This file is kept for existing links.

Single checklist for launching a clinic on Kiorly in Egypt: tax, data, operations, and pilot success.

## 1. ETA e-receipt onboarding

| Step | Owner | Notes |
|------|--------|--------|
| Tax registration (RIN) on organization TRN | Group admin | Admin → Organization → TRN; flows to all clinics |
| Per-clinic branch / POS code | Clinic admin | Clinic → Settings → Egypt ETA |
| Taxpayer activity code | Group admin | Default `8690` (medical); override per clinic if needed |
| GPC / ETA item codes per service | Group admin + finance | Default item code on org; clinic overrides for specialties |
| E-signature token or seal | Platform ops | AWS Secrets Manager `kiorly-clinics-management/eta-credentials` via `scripts/configure-apprunner-eta.sh` |
| Production submit test | Finance | Queue row from check-in or billing → `POST /compliance/egypt/eta-queue/:id/submit` |

Env vars (App Runner): `ETA_API_BASE_URL`, `ETA_CLIENT_ID`, `ETA_CLIENT_SECRET`, `ETA_SIGNING_KEY`, optional `ETA_DEFAULT_ISSUER_RIN`.

Every posted payment path queues ETA: **check-in** (cash / InstaPay / Fawry), **encounter visit fee**, **billing payment**, **tax invoice**.

## 2. Data protection (Egypt)

| Topic | Requirement |
|-------|-------------|
| Licensing & TRN | **Clinics** → branch → **Settings** → **License & tax authority** (`licenseNumber`, `taxRegistrationNumber`) — labels from Egypt market `taxConfig` (ETA). See [CLINIC_TAX_AND_LICENSING.md](./CLINIC_TAX_AND_LICENSING.md). |
| Data protection officer | Named contact in clinic org chart (HR module) |
| Consent | `POST /compliance/patients/:id/data-protection-consent` at intake |
| Breach handling | See [COMPLIANCE_CONTROLS.md](./COMPLIANCE_CONTROLS.md) incident section |
| Data flows | Patient PHI in **RDS (Frankfurt eu-central-1)**; assistant optional **OpenAI** (see [ASSISTANT_OPENAI_SETUP.md](./ASSISTANT_OPENAI_SETUP.md)); uploads in **S3** same region |
| AI assistant | Enable at platform + **EG market Flags** + per-org if needed — [FEATURE_FLAGS.md](./FEATURE_FLAGS.md) |

## 3. Backup, restore, incident

| Runbook | Location |
|---------|----------|
| RDS backup / PITR | AWS RDS automated backups (CDK stack) |
| Restore drill | [COMPLIANCE_CONTROLS.md](./COMPLIANCE_CONTROLS.md#backup-and-restore) |
| Incident response | [COMPLIANCE_CONTROLS.md](./COMPLIANCE_CONTROLS.md#incident-response) |

## 4. Legal pack (per clinic)

Arabic templates to sign before go-live (legal review required):

- Privacy notice (patient-facing)
- Terms of service (clinic use of Kiorly)
- Data processing agreement (Kiorly ↔ clinic)

Store executed PDFs in clinic document vault (operations upload) or offline legal files.

## 5. Support & pilot

| Item | Default |
|------|---------|
| Support hours | Sun–Thu 09:00–18:00 Africa/Cairo (business SLA TBD per contract) |
| P1 response | 4 hours (production down) |
| Pilot length | 30 days first branch |
| Pilot success | ETA submit success rate ≥ 95%; zero unresolved P1; MFA on group admin; WhatsApp reminder delivery ≥ 90% when enabled |

## 6. Admin configuration summary

**Organization (group admin):** Admin → Organization — TRN, VAT %, ETA activity/item defaults, e-signature label, WhatsApp reminders (hours before appointment).

**Clinic:** Settings — contact, currency, invoice logo (shown on ETA preview when permitted), ETA branch code.

**User:** Profile → MFA with recovery codes.

See also [CLINIC_PLATFORM_CAPABILITIES.md](./CLINIC_PLATFORM_CAPABILITIES.md) and [FRONT_DESK.md](./FRONT_DESK.md).