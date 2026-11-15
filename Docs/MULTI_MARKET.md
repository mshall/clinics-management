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

Internal payload is built in `EtaEgyptFiscalProvider`. Submit uses **`buildEtaWireReceiptDocument`** (`header.uuid`, `header.previousUUID`, `documentType: "r"`) per Egypt e-Receipt chain rules. Validate against the current ETA API documentation before production go-live ([markets/egypt.md](./markets/egypt.md)).

## Privileged MFA (AWS production only)

`PrivilegedMfaGuard` enforces TOTP for admin/finance roles when **`NODE_ENV=production`** and **`KIORLY_DEPLOY_TARGET=aws`** (set on App Runner). Local dev is unaffected unless `PRIVILEGED_MFA_ENFORCE=true`.