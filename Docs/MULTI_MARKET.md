# Multi-market platform

## Provider settings (JSON)

Per-organization and per-clinic connector settings live in **`Tenant.providerSettings`** and **`Clinic.providerSettings`**, keyed by fiscal provider id (e.g. `eta-egypt`). The provider’s `settingsSchema` in code describes editable fields; no new Prisma columns per country.

Egypt ETA keys (under `eta-egypt`):

| Scope | JSON fields |
|-------|-------------|
| Tenant | `defaultTaxpayerActivityCode`, `defaultItemCode`, `esignatureLabel` |
| Clinic | `branchCode`, `taxpayerActivityCode`, `defaultItemCode`, `receiptsEnabled`, `includeLogoOnReceipt` |

Legacy `eta*` columns were migrated into JSON and removed.

## Payment methods

`Market.paymentMethods` is the source of truth for **built-in** transfer types. Organizations may add **`TenantPaymentChannel`** rows under **Administration → Organization & settings** (dedicated **Payment channels** card, **group admin only** — below **Organization settings**, same tab): **name**, **account number** and/or **mobile number** (at least one required), **referencePattern** (regex for transfer refs), and **fiscalPaymentCode** (`C` / `V` / `O` on ETA receipts). Each row gets a stable `channelKey` used on revenue and check-in.

Transfer channels are **string ids** (not a DB enum). Market methods may define:

- `transferChannel` — id stored on revenue / appointments
- `referencePattern` — regex for reference validation
- `verifyUrlEnv` — env var for optional online verification

Custom org channels use generic reference validation (min length) when no pattern is set.

Staff UI loads merged channels from `GET /api/v1/markets/current` (`paymentMethods`, `organizationPaymentChannels`, `transferChannels`). Group admins manage channels via `GET/POST/DELETE /api/v1/admin/payment-channels`.

## Market pack requirements

`Market` rows must define `defaultCurrency`, `defaultTimezone`, `defaultPhoneRegion`, `weekendDays`, `enabledLanguages`, `dataRegion`, and `hostCell` explicitly (no DB-level Egypt defaults). `resolveMarketForTenant` rejects organizations without a complete market pack.

**Data residency (SC-01):** canonical cell registry is [`platform/data-cells.json`](../platform/data-cells.json). Egypt production uses Path A (`frankfurt`, `eu-central-1`); packs and tenants are validated against the registry. See [DATA_RESIDENCY_DECISION.md](./DATA_RESIDENCY_DECISION.md).

## Fiscal devices (provider-agnostic)

`FiscalDevice` models **virtual** (Kiorly-hosted POS) or **physical** receipt issuers. Markets whose fiscal provider sets `deviceRegistration.required` auto-provision a virtual device on clinic create. Submission chains **`lastReceiptUuid`** per device (future markets e.g. ZATCA EGS can reuse the same model). API: `/api/v1/clinics/:clinicId/fiscal-devices`, `/api/v1/fiscal-devices/:id/credentials` (secrets never returned).

## ETA wire format

Draft payload is built in `EtaEgyptFiscalProvider` at queue time (**no random uuid**). `FiscalSubmitService` locks the target **`FiscalDevice`**, assigns **`previousUUID`** / `receiptNumber`, computes **`uuid`** via `computeDocumentUuid`, then submits Receipt **v1.2**. Validate against the [ETA SDK](https://sdk.invoicing.eta.gov.eg/) before production ([markets/egypt.md](./markets/egypt.md)).

## Currency

Billing and clinic flows resolve currency from **clinic → tenant → market pack** (`resolveClinicCurrency`, `resolveMarketForTenant`). There is **no hidden EGP fallback** in billing, front desk, platform org create, or unknown country codes.

## AI redaction

Assistant prompts use **market-specific** redaction patterns (`providerConfig.ai.redaction` or built-in defaults per market code), including **person names**. Egypt uses the EU OpenAI API host in the market pack (`https://eu.api.openai.com/v1`).

## Privileged MFA (AWS production only)

`PrivilegedMfaGuard` enforces TOTP for admin/finance roles when **`NODE_ENV=production`** and **`KIORLY_DEPLOY_TARGET=aws`**. **`PRIVILEGED_MFA_ENFORCE=false` is ignored on AWS production** (enforcement stays on; startup writes `PRIVILEGED_MFA_DISABLE_IGNORED` to the audit log). Local dev is unaffected unless `PRIVILEGED_MFA_ENFORCE=true`.