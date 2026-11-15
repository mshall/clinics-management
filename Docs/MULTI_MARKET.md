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

`Market.paymentMethods` is the source of truth. Transfer channels are **string ids** (not a DB enum). Each method may define:

- `transferChannel` — id stored on revenue / appointments
- `referencePattern` — regex for reference validation
- `verifyUrlEnv` — env var for optional online verification

Staff UI loads channels from `GET /api/v1/markets/current`.

## Market pack requirements

`Market` rows must define `defaultCurrency`, `defaultTimezone`, `defaultPhoneRegion`, `weekendDays`, `enabledLanguages`, `dataRegion`, and `hostCell` explicitly (no DB-level Egypt defaults). `resolveMarketForTenant` rejects organizations without a complete market pack.

## ETA wire format

Draft payload is built in `EtaEgyptFiscalProvider` at queue time (**no random uuid**). `FiscalSubmitService` assigns **`previousUUID`** from `FiscalPosChain` per **`ProviderCredential.deviceId`**, computes **`uuid`** with `eta-egypt-serialize.ts`, then submits Receipt **v1.2** via `buildEtaWireReceiptDocument`. Validate against the [ETA SDK](https://sdk.invoicing.eta.gov.eg/) before production ([markets/egypt.md](./markets/egypt.md)).

## Currency

Billing and clinic flows resolve currency from **clinic → tenant → market pack** (`resolveClinicCurrency`, `resolveMarketForTenant`). There is **no hidden EGP fallback** in billing, front desk, platform org create, or unknown country codes.

## AI redaction

Assistant prompts use **market-specific** redaction patterns (`providerConfig.ai.redaction` or built-in defaults per market code), including **person names**. Egypt uses the EU OpenAI API host in the market pack (`https://eu.api.openai.com/v1`).

## Privileged MFA (AWS production only)

`PrivilegedMfaGuard` enforces TOTP for admin/finance roles when **`NODE_ENV=production`** and **`KIORLY_DEPLOY_TARGET=aws`**. **`PRIVILEGED_MFA_ENFORCE=false` is ignored on AWS production** (enforcement stays on; startup writes `PRIVILEGED_MFA_DISABLE_IGNORED` to the audit log). Local dev is unaffected unless `PRIVILEGED_MFA_ENFORCE=true`.