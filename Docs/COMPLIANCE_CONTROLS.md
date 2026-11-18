# Compliance control mapping

Kiorly is a multi-market clinic platform. Controls below apply globally; **market-specific law** is tracked per country pack (`Market`).

## Requirements matrix by market

| Market | Data protection | Fiscal / e-invoice | Health data / exchange | Payments & messaging | Notes |
|--------|-----------------|--------------------|-------------------------|----------------------|--------|
| **Egypt (EG)** | PDPL — consent API (SC-03), PDPC breach deadlines, ROPA template, paid launch gate (SC-02) — [SC02_PDPC_EGYPT.md](./SC02_PDPC_EGYPT.md) | **ETA** via `eta-egypt` fiscal provider | MoH licensing on clinic | InstaPay / Fawry in market JSON | SC-01 Path A: **Frankfurt** cell + **PDPC cross-border licence** ([DATA_RESIDENCY_DECISION.md](./DATA_RESIDENCY_DECISION.md)) |
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

- **Billing:** `BillingPayment`, `CashierShiftClose`, `RevenueEntry`, fiscal queue keyed by source payment/revenue/invoice id. Posted revenue uses `postRevenueWithFiscal` (check-in, visit fee, billing, operations); Admin Data Explorer cannot create or patch receiptable revenue — corrections use void/return receipts. CI (`fiscal-revenue-coverage.node.test.ts`) blocks stray `revenueEntry` create/update/delete outside approved modules. Manual B2B revenue may set `skipEtaEReceipt` + reason (audited; no e-receipt until e-invoice). Counterparty name and tax number are stored on `RevenueEntry`, not only in the audit log.
- **Change management:** Git + CI/CD + Prisma migrations.
- **Monitoring:** Health endpoints, integration failure UI (categories include **FISCAL** for ETA receipt queue/submit), optional spike audit.

## Backup and restore

1. **RDS:** Automated backups ( **35 days**, AWS maximum) and PITR in `eu-central-1` (CDK `DatabaseInstance`, Multi-AZ, deletion protection). **Medical-record retention** beyond 35 days uses quarterly snapshot export to S3 with lifecycle (see Egypt go-live backup section).
2. **S3 uploads:** Versioning recommended on upload bucket (ops).
3. **Restore drill (quarterly):** Restore RDS snapshot to staging; run `prisma migrate deploy` + smoke `health/ready`.
4. **RTO/RPO targets:** Define per contract (pilot default RPO 24h, RTO 8h).

## Incident response

1. **Detect:** Integration failures, audit `INTEGRATION_FAILURE_SPIKE`, operational alerts (see [QA_OBSERVABILITY.md](./QA_OBSERVABILITY.md)), AWS alarms.
2. **Triage:** Group admin + platform super admin; correlation id from API errors.
3. **Contain:** Disable clinic, rotate JWT/MFA, block integration token.
4. **Notify (Egypt):** PDPC within **72 hours** of becoming aware of a personal-data breach; data subjects within **3 days** where required by PDPL.
5. **Review:** Post-incident notes in governance module; update [markets/egypt.md](./markets/egypt.md).

## Egypt-specific

- ETA e-receipt queue on **payments** only (not tax invoice print); sale + return + **resubmit after rejection** (`referenceOldUUID`); auth failures keep submissions `SUBMITTING` and flag device credentials ([ETA_RECEIPT_V12](./ETA_RECEIPT_V12.md)).
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