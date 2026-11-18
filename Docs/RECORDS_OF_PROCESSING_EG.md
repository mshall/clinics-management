# Records of processing — Egypt (Kiorly processor, clinic controller)

| Item | Status |
|------|--------|
| SC-02 ROPA template | **Done** (clinic completes per tenant) |

Published **2026-11-18** for SC-02. Each Egyptian clinic remains **controller** for patient PHI; Kiorly is **processor** for platform SaaS.

## 1. Controller (clinic)

| Activity | Data categories | Data subjects | Purpose | Legal basis | Retention |
|----------|-----------------|---------------|---------|-------------|-----------|
| Patient registration | Identity, contact, MRN | Patients | Care delivery | PDPL / care contract | Clinical policy |
| Appointments & visits | Scheduling, clinical notes | Patients | Operations | Legitimate interest / care | Clinical policy |
| Billing & receipts | Payment, fiscal buyer name | Patients | Finance / ETA | Legal obligation (tax) | Finance policy |
| Messaging | Phone, reminder content | Patients | Appointments | Consent (WhatsApp) | Messaging logs |

**Recipients:** Kiorly (processor), ETA (receipt buyer fields when required), WhatsApp BSP, Kiorex (marketplace bookings only).

**Cross-border:** Frankfurt (`eu-central-1`) per Path A — PDPC cross-border filing required before live PHI.

**DPO (clinic):** Name and contact on clinic privacy notice; register with PDPC.

## 2. Processor (Kiorly)

| Activity | Data | Purpose | Sub-processors |
|----------|------|---------|----------------|
| Hosting & backups | Tenant DB, uploads | SaaS | AWS eu-central-1 |
| Authentication | Staff credentials | Security | — |
| Optional AI assistant | Redacted prompts | Clinical assist | OpenAI EU endpoint (if enabled) |
| Fiscal integration | Receipt payloads | ETA compliance | ETA API |

See [SUB_PROCESSORS_BY_MARKET.md](./SUB_PROCESSORS_BY_MARKET.md).

## 3. Clinic action

Copy sections 1–2 into your compliance file; add branch-specific flows (labs, insurers). Display [patient privacy notice](./LEGAL_PACK.md) at registration.

## 4. Updates

Bump `platform/pdpc-egypt-filings.json` `recordsOfProcessing.publishedAt` when material changes ship.