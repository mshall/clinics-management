# Compliance control mapping

Kiorly is designed for Egyptian clinics with healthcare and tax obligations. This document maps platform controls to common frameworks — **not** a certification statement. External audit required for formal ISO 27001, SOC 2, HIPAA, FedRAMP, or FISMA attestation.

## Framework overview

| Framework | Scope in Kiorly | Status |
|-----------|-----------------|--------|
| **ISO 27001** | ISMS-style controls: access, crypto, logging, suppliers | Control mapping below; certify via external ISMS |
| **FISMA Moderate** | US federal-style control families (NIST 800-53 moderate baseline) | Partial technical controls |
| **FedRAMP** | Cloud SaaS authorization | Not authorized; architecture uses AWS commercial |
| **HIPAA** | PHI safeguards for US patients / BAA scenarios | Technical safeguards implemented; BAA with AWS available |
| **SOC 1** | Financial reporting around billing | Cash close + revenue audit trail foundations |
| **SOC 2** | Security / availability / confidentiality | JWT, MFA, encryption, audit logs |

## ISO 27001 (selected controls)

| Control | Implementation |
|---------|----------------|
| A.9 Access control | RBAC, clinic scopes, JWT, optional TOTP MFA, bcrypt passwords |
| A.10 Cryptography | TLS in transit; RDS/S3 encryption at rest (AWS) |
| A.12 Operations | `db:ensure`, migrations, health checks, integration failure retention |
| A.14 Supplier | ETA, WhatsApp BSP, OpenAI — secrets in Secrets Manager |
| A.16 Incident | Audit log, governance integration failures, spike alerts |

## HIPAA-aligned technical safeguards

| Safeguard | Implementation |
|-----------|----------------|
| Access control | Unique user IDs, role-based nav, MFA |
| Audit controls | `AuditLog` on sensitive actions |
| Integrity | Prisma transactions for money; idempotent ETA keys |
| Transmission security | HTTPS only in production |
| Minimum necessary | Clinic-scoped data for admins; physician network scope |

**Note:** Business Associate Agreements with hosting and AI vendors are the clinic’s and Kiorly’s legal responsibility.

## SOC 1 / SOC 2 themes

- **Billing:** `BillingPayment`, `CashierShiftClose`, `RevenueEntry`, ETA queue for traceability.
- **Change management:** Git + CI/CD + Prisma migrations.
- **Monitoring:** Health endpoints, integration failure UI, optional spike audit.

## Backup and restore

1. **RDS:** Automated backups and PITR in `eu-central-1` (CDK `DatabaseInstance`).
2. **S3 uploads:** Versioning recommended on upload bucket (ops).
3. **Restore drill (quarterly):** Restore RDS snapshot to staging; run `prisma migrate deploy` + smoke `health/ready`.
4. **RTO/RPO targets:** Define per contract (pilot default RPO 24h, RTO 8h).

## Incident response

1. **Detect:** Integration failures, audit `INTEGRATION_FAILURE_SPIKE`, AWS alarms.
2. **Triage:** Group admin + platform super admin; correlation id from API errors.
3. **Contain:** Disable clinic, rotate JWT/MFA, block integration token.
4. **Notify:** Patients/clinic per Egypt Personal Data Protection Law when PHI breach confirmed.
5. **Review:** Post-incident notes in governance module; update [EGYPT_GO_LIVE.md](./EGYPT_GO_LIVE.md).

## Egypt-specific

- ETA e-receipt queue and signed submit ([capabilities matrix](./CLINIC_PLATFORM_CAPABILITIES.md)).
- Data protection consent API.
- Arabic UI copy (`ar.json`); Egyptian Arabic in product docs (not Gulf dialect).

## Evidence for auditors

| Evidence | Source |
|----------|--------|
| Access reviews | Admin → users / RBAC |
| MFA enrollment | User profile + `User.mfaEnabled` |
| Payment trace | Revenue + ETA submission rows |
| Message delivery | `OutboundMessage` status |
| Config changes | Audit log + tenant settings PATCH |

Maintain this document with each compliance-related release.