# Compliance control mapping

Kiorly is a multi-market clinic platform. Controls below apply globally; **market-specific law** is tracked per country pack (`Market`).

## Requirements matrix by market

| Market | Data protection | Fiscal / e-invoice | Health data / exchange | Payments & messaging | Notes |
|--------|-----------------|--------------------|-------------------------|----------------------|--------|
| **Egypt (EG)** | PDPL — consent API, PDPC breach deadlines | **ETA** via `eta-egypt` fiscal provider | MoH licensing on clinic | InstaPay / Fawry in market JSON | Frankfurt hosting + **PDPC cross-border licence** |
| **KSA** | PDPL | **ZATCA** (connector TBD) | **NPHIES** (TBD) | Mada / local rails (TBD) | Planned GCC cell |
| **UAE** | ICT health law, DHA/DOH | **FTA** (TBD) | **NABIDH** / **Malaffi** (TBD) | Card + local (TBD) | Planned ME cell |
| **EU / EMEA** | **GDPR** | Country fiscal providers | National HIE where required | SEPA / local | Frankfurt cell default |

Go-live checklists: [MARKET_GO_LIVE_TEMPLATE.md](./MARKET_GO_LIVE_TEMPLATE.md). Egypt instance: [markets/egypt.md](./markets/egypt.md).

This document maps platform controls to common frameworks — **not** a certification statement. External audit required for formal ISO 27001 or SOC 2 attestation.

## Framework overview (Egypt focus)

| Framework | Scope in Kiorly | Status |
|-----------|-----------------|--------|
| **ISO 27001** | ISMS-style controls: access, crypto, logging, suppliers | Control mapping below; certify via external ISMS |
| **SOC 1** | Financial reporting around billing | Cash close + revenue audit trail foundations |
| **SOC 2** | Security / availability / confidentiality | JWT, MFA, encryption, audit logs |
| **Egypt PDPL** | Consent, DPO, breach notification, cross-border transfer | See [markets/egypt.md](./markets/egypt.md) |

## ISO 27001 (selected controls)

| Control | Implementation |
|---------|----------------|
| A.9 Access control | RBAC, clinic scopes, JWT, TOTP MFA (privileged roles on **AWS production** only), bcrypt passwords |
| A.10 Cryptography | TLS in transit; RDS/S3 encryption at rest (AWS) |
| A.12 Operations | `db:ensure`, migrations, health checks, integration failure retention |
| A.14 Supplier | ETA, WhatsApp BSP, **OpenAI** (sub-processor) — secrets in Secrets Manager |
| A.16 Incident | Audit log, governance integration failures, spike alerts |

## SOC 1 / SOC 2 themes

- **Billing:** `BillingPayment`, `CashierShiftClose`, `RevenueEntry`, fiscal queue keyed by source payment/revenue/invoice id.
- **Change management:** Git + CI/CD + Prisma migrations.
- **Monitoring:** Health endpoints, integration failure UI, optional spike audit.

## Backup and restore

1. **RDS:** Automated backups and PITR in `eu-central-1` (CDK `DatabaseInstance`, Multi-AZ, deletion protection).
2. **S3 uploads:** Versioning recommended on upload bucket (ops).
3. **Restore drill (quarterly):** Restore RDS snapshot to staging; run `prisma migrate deploy` + smoke `health/ready`.
4. **RTO/RPO targets:** Define per contract (pilot default RPO 24h, RTO 8h).

## Incident response

1. **Detect:** Integration failures, audit `INTEGRATION_FAILURE_SPIKE`, AWS alarms.
2. **Triage:** Group admin + platform super admin; correlation id from API errors.
3. **Contain:** Disable clinic, rotate JWT/MFA, block integration token.
4. **Notify (Egypt):** PDPC within **72 hours** of becoming aware of a personal-data breach; data subjects within **3 days** where required by PDPL.
5. **Review:** Post-incident notes in governance module; update [markets/egypt.md](./markets/egypt.md).

## Egypt-specific

- ETA e-receipt queue (sale + return) and submit via per-clinic credentials when configured ([capabilities matrix](./CLINIC_PLATFORM_CAPABILITIES.md)).
- Data protection consent API.
- Arabic UI copy (`ar.json`); Egyptian Arabic in product docs (not Gulf dialect).

## Evidence for auditors

| Evidence | Source |
|----------|--------|
| Access reviews | Admin → users / RBAC |
| MFA enrollment | User profile + `User.mfaEnabled`; privileged roles blocked until enrolled |
| Payment trace | Revenue + fiscal submission rows |
| Message delivery | `OutboundMessage` status |
| Config changes | Audit log + tenant settings PATCH |

Maintain this document with each compliance-related release.