# Egypt market go-live

Instance of [MARKET_GO_LIVE_TEMPLATE.md](../MARKET_GO_LIVE_TEMPLATE.md) for market code **EG** (`market-egypt`).

**Data residency:** production workloads run in **Frankfurt (`eu-central-1`)**. Cross-border transfer from Egypt requires a **PDPC controller/processor licence** and a **cross-border transfer licence** from Egypt’s Personal Data Protection Centre (PDPC) — not “government consent for in-country hosting”.

## 1. ETA e-receipt onboarding

| Step | Owner | Notes |
|------|--------|--------|
| Tax registration (RIN) on organization TRN | Group admin | Admin → Organization → TRN; flows to all clinics |
| Per-clinic branch / POS code | Clinic admin | Clinic → Settings → Egypt ETA |
| Taxpayer activity code | Group admin | Market default `8690` (medical); clinic override if needed |
| GPC / ETA item codes per service | Group admin + finance | Org default; clinic overrides |
| E-signature token or seal | Platform ops | `ProviderCredential` → Secrets Manager; `scripts/configure-apprunner-eta.sh` for legacy env bridge |
| Production submit test | Finance | Queue from check-in/billing → submit via compliance API |

Fiscal provider key: **`eta-egypt`** (`FiscalDocument` + `FiscalSubmission`). Clinic/org ETA fields live in **`providerSettings["eta-egypt"]`** ([MULTI_MARKET.md](../MULTI_MARKET.md)). Technical reference: [ETA_RECEIPT_V12.md](../ETA_RECEIPT_V12.md).

Idempotency is keyed by **payment / revenue / invoice** source id (not amount or description). **Visit fee amount changes** void the posted revenue row, queue a **return** receipt, then queue a **new sale** on a new revenue row. **UUID / chain:** receipts are **not** random — `header.uuid` is a **SHA-256** over the ETA-serialized Receipt **v1.2** body (empty uuid field) including `previousUUID`. The chain is **per `FiscalDevice`** (serial + `receiptSequence` / `lastReceiptUuid`), computed **only at submit** in device queue order. Wire body includes buyer (type P), tax totals, payment method, item/unit types, `documentTypeVersion` **1.2**, and POS headers on token + submit.

Every **payment** path uses `postRevenueWithFiscal`: check-in, visit fee, billing, **operation payments** (down payment, installments, discharge balance). Manual revenue / Data Explorer cannot post receiptable amounts. **Tax invoices are printouts only.**

**Organization ETA integration** is a separate card under Administration → Organization & settings (off by default for new Egypt tenants). When enabled, configure each clinic under **Clinics → Settings → ETA**.

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

**Troubleshooting:** Banner “finish receipt device setup” when no default `ACTIVE` device; permanent ETA validation errors mark the submission `REJECTED` so later receipts on the same device can proceed; production uses Secrets Manager refs (not `local:`/`env:`).

## 2. Data protection (Egypt PDPL)

| Topic | Requirement |
|-------|-------------|
| PDPC licences | **Controller** and **processor** licences from PDPC before processing Egyptian personal data |
| Clinic TRN & licence | `licenseNumber` + `taxRegistrationNumber` per branch (MoH / ETA) — [CLINIC_TAX_AND_LICENSING.md](../CLINIC_TAX_AND_LICENSING.md) |
| Data protection officer | **Formally appointed** DPO (contract + register with PDPC); HR org chart name alone is insufficient |
| Consent | `POST /compliance/patients/:id/data-protection-consent` |
| Breach notification | **72 hours** to PDPC; **3 days** to affected data subjects (see [COMPLIANCE_CONTROLS.md](../COMPLIANCE_CONTROLS.md)) |
| Sub-processors | AWS (Frankfurt), optional **OpenAI** (EU API endpoint via market `providerConfig`; identifiers redacted in assistant prompts) |
| Data flows | RDS + S3 **Frankfurt**; assistant gated by `ai_assistant` flags — [FEATURE_FLAGS.md](../FEATURE_FLAGS.md) |

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

**User:** Profile → MFA (required for admin/finance roles).

See [CLINIC_PLATFORM_CAPABILITIES.md](../CLINIC_PLATFORM_CAPABILITIES.md) and [FRONT_DESK.md](../FRONT_DESK.md).

## Multi-market debt (tracked)

See [MULTI_MARKET_BACKLOG.md](../MULTI_MARKET_BACKLOG.md) for ETA column migration, payment-method enums, and schema defaults.