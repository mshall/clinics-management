# Egypt market go-live

Instance of [MARKET_GO_LIVE_TEMPLATE.md](../MARKET_GO_LIVE_TEMPLATE.md) for market code **EG** (`market-egypt`).

**Data residency (SC-01 Path A):** production workloads run in **Frankfurt** cell **`frankfurt`** (`eu-central-1`) — DB, uploads, and RDS automated backups. **Government permission** (PDPC controller/processor registration and **cross-border transfer** approval) must be obtained **right before production launch** — not assumed at pilot/engineering time. Decision memo: [DATA_RESIDENCY_DECISION.md](../DATA_RESIDENCY_DECISION.md) § Launch gate. Sub-processors: [SUB_PROCESSORS_BY_MARKET.md](../SUB_PROCESSORS_BY_MARKET.md).

## 1. ETA e-receipt onboarding

| Step | Owner | Notes |
|------|--------|--------|
| Tax registration (RIN) on organization TRN | Group admin | Admin → **Organization & settings** → Organization settings card; flows to all clinics |
| Custom transfer channels (InstaPay/Fawry alternatives) | Group admin | Admin → **Organization & settings** → **Payment channels** card |
| Per-clinic branch / POS code | Clinic admin | Clinic → Settings → Egypt ETA |
| Taxpayer activity code | Group admin | Market default `8690` (medical); clinic override if needed |
| GPC / ETA item codes per service | Group admin + finance | Org default; clinic overrides |
| E-signature token or seal | Platform ops | `ProviderCredential` → Secrets Manager; `scripts/configure-apprunner-eta.sh` for legacy env bridge |
| Production submit test | Finance | Queue from check-in/billing → submit via compliance API |

Fiscal provider key: **`eta-egypt`** (`FiscalDocument` + `FiscalSubmission`). Clinic/org ETA fields live in **`providerSettings["eta-egypt"]`** ([MULTI_MARKET.md](../MULTI_MARKET.md)). Technical reference: [ETA_RECEIPT_V12.md](../ETA_RECEIPT_V12.md).

Idempotency is keyed by **payment / revenue / invoice** source id (not amount or description). **Visit fee amount changes** void the posted revenue row, queue a **return** receipt, then queue a **new sale** on a new revenue row. **UUID / chain:** receipts are **not** random — `header.uuid` is a **SHA-256** over the ETA-serialized Receipt **v1.2** body (empty uuid field) including `previousUUID`. The chain is **per `FiscalDevice`** (serial + `receiptSequence` / `lastReceiptUuid`), computed **only at submit** in device queue order. Wire body includes buyer (type P), tax totals, payment method, item/unit types, `documentTypeVersion` **1.2**, and POS headers on token + submit.

Every **payment** path uses `postRevenueWithFiscal`: check-in, visit fee, billing, **operation payments** (down payment, installments, discharge balance). Manual revenue / Data Explorer cannot post receiptable amounts. **Tax invoices are printouts only.**

**Organization ETA integration** is **disabled by default**. Platform super admin enables it per organization under **Platform → Organizations**; then group admins configure opt-out and defaults under **Administration → Organization & settings**, and each clinic under **Clinics → Settings → ETA**.

**Tax filing:** Clinics and physicians are **solely responsible** for providing their taxes and fiscal receipts to the Egyptian Tax Authority. Kiorly’s optional ETA integration is a tooling aid only — it does not replace the clinic’s or doctor’s legal obligations.

### Receipt devices (virtual vs physical POS)

| Mode | When | Steps |
|------|------|--------|
| **Virtual (Kiorly POS)** | Clinic has no hardware POS | On clinic create, platform provisions **`FiscalDevice`** kind `VIRTUAL` with serial `KIORLY-EG-…`. Register that serial on the **ETA portal**, link to branch, then **Clinic → Settings → Receipt devices** → enter client ID/secret (stored in Secrets Manager only). |
| **Physical** | Clinic owns a registered POS | Add device with authority serial; same credentials flow. |
| **Skip** | Setup later | Device stays `CREDENTIALS_PENDING`; payments queue with `PENDING` submit until device is `ACTIVE`. |

**Callback URL (general notifications):** `POST /api/v1/integrations/fiscal/eta-egypt/notifications/{tenantId}` (register the org id in the path on the ETA portal — **not** in the JSON body). Header `Authorization: ApiKey <pre-shared key>` (`ETA_NOTIFICATION_API_KEY` in AWS, compared with `timingSafeEqual`). Ping: `POST …/notifications/ping`.

**Privacy:** Patient names may be sent on e-receipts as buyer details (required above EGP 150,000 at payment time). Disclose in your patient privacy notice.

**Kiorly ETA opt-out:** Group admin can disable **Kiorly-issued** e-receipts (org not obliged or uses another ETA-registered system); audited; banner on revenue/front desk — Admin → Organization → Egypt ETA.

**Automatic submit:** `FiscalSubmissionWorker` drains pending receipts per device (FIFO, stored wire document, failure classification). Set `FISCAL_SUBMIT_WORKER=false` to disable.

**Troubleshooting:** Banner “finish receipt device setup” when no default `ACTIVE` device; permanent ETA validation errors mark the submission `REJECTED` so later receipts on the same device can proceed; production uses Secrets Manager refs (not `local:`/`env:`). Fiscal submit/queue issues appear under **Governance → Failing operations** with category **FISCAL** (not webhooks).

**Pre-production billing drill:** [ETA_RECEIPT_V12.md](../ETA_RECEIPT_V12.md) § Billing go-live checklist (sale → return → resend, credentials expiry, status poll).

## 2. Data protection (Egypt PDPL)

| Topic | Requirement |
|-------|-------------|
| PDPC licences | **Controller** and **processor** licences from PDPC before processing Egyptian personal data |
| Clinic TRN & licence | `licenseNumber` + `taxRegistrationNumber` per branch (MoH / ETA) — [CLINIC_TAX_AND_LICENSING.md](../CLINIC_TAX_AND_LICENSING.md) |
| Data protection officer | **Formally appointed** DPO (contract + register with PDPC); HR org chart name alone is insufficient |
| Consent | `POST /compliance/patients/:id/data-protection-consent` |
| Breach notification | **72 hours** to PDPC; **3 days** to affected data subjects (see [COMPLIANCE_CONTROLS.md](../COMPLIANCE_CONTROLS.md)) |
| Sub-processors | [SUB_PROCESSORS_BY_MARKET.md](../SUB_PROCESSORS_BY_MARKET.md) — AWS Frankfurt, optional OpenAI EU endpoint, ETA, WhatsApp BSP |
| Data flows | RDS + S3 **Frankfurt**; assistant gated by `ai_assistant` flags — [FEATURE_FLAGS.md](../FEATURE_FLAGS.md) |

## 3. Backup, restore, incident

See [COMPLIANCE_CONTROLS.md](../COMPLIANCE_CONTROLS.md#backup-and-restore) and [#incident-response](../COMPLIANCE_CONTROLS.md#incident-response).

## 4. Legal pack (per clinic)

Platform pack shipped (GT-02): terms, subscription, Kiorex fees, DPA, patient privacy notice (AR), AUP, refund — see [LEGAL_PACK.md](../LEGAL_PACK.md). **Counsel review still required** before charging or Kiorex listing.

## 5. Support & pilot

| Item | Default |
|------|---------|
| Support hours | Sun–Thu 09:00–18:00 Africa/Cairo |
| P1 response | 4 hours |
| Pilot length | 30 days first branch |
| Pilot success | ETA/fiscal submit ≥ 95%; zero unresolved P1; MFA on group admin — see [MN04_ETA_PRODUCTION.md](../MN04_ETA_PRODUCTION.md) |

## 6. Payment methods (market data)

Cash, InstaPay, Fawry, card — configured on `Market.paymentMethods` for EG.

## 7. Admin configuration summary

**Organization:** TRN, VAT %, ETA defaults, WhatsApp reminders.

**Clinic:** Contact, currency, invoice logo, ETA branch.

**User:** Profile → MFA (required for admin/finance roles).

See [CLINIC_PLATFORM_CAPABILITIES.md](../CLINIC_PLATFORM_CAPABILITIES.md) and [FRONT_DESK.md](../FRONT_DESK.md).

## Multi-market debt (tracked)

See [MULTI_MARKET_BACKLOG.md](../MULTI_MARKET_BACKLOG.md) for ETA column migration, payment-method enums, and schema defaults.