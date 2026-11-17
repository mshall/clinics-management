# Clinic license and tax authority numbers

Each **branch** stores regulatory identifiers on the `Clinic` row. Labels and authority names come from the tenant’s **market** (`Market.taxConfig`), so Egypt shows ETA / RIN wording while other countries can override via JSON without a code deploy.

## Where to edit (UI)

| Field | Path |
|-------|------|
| **Facility license** | **Clinics & branches** → clinic → **Settings** → **License & tax authority** |
| **Tax authority registration number** | Same panel (e.g. Egypt **RIN / TRN** for ETA) |
| **VAT %** on patient invoices | Same panel |
| Logo / invoice layout only | **Admin → Clinics & tenants** → clinic → **Invoicing** (or clinic settings elsewhere) |

**Group admin** can still set organization-wide defaults (TRN + VAT) under **Admin → Organization & settings**; those values are applied to all clinics when saved (`syncClinicInvoiceTaxFromTenant`).

## APIs

| Action | Endpoint |
|--------|----------|
| Read labels + values | `GET /api/v1/clinics/:id` → `licenseNumber`, `taxRegistrationNumber`, `marketTaxLabels` |
| Update license + tax number | `PATCH /api/v1/clinics/:id` with `licenseNumber`, `taxRegistrationNumber` |
| Update VAT only (legacy) | `PATCH /api/v1/clinics/:id/invoice-settings` |

## Market pack (`taxConfig`)

Optional keys (merged with country defaults — see `apps/api/src/common/market-tax-labels.ts`):

| Key | Purpose |
|-----|---------|
| `taxAuthorityNameEn` / `taxAuthorityNameAr` | Hint text in settings |
| `taxRegistrationLabelEn` / `taxRegistrationLabelAr` | Label on forms and printed invoices |
| `licenseLabelEn` / `licenseLabelAr` | Facility license label |
| `invoiceVatPercent` | VAT on **medical service** invoices (EG pack: often `0` — confirm with tax adviser) |
| `saasVatPercent` | VAT on Kiorly SaaS invoices (EG pack: `14`) |
| `defaultVisitFee` | Default encounter visit fee when provisioning tenants |
| `trnFormat` / `trnRequired` | TRN validation on org/clinic save; blocks ETA enablement when invalid |
| `defaultVatPercent` | Legacy alias for `invoiceVatPercent` |
| `fiscalProviderKey` | Fiscal connector (e.g. `eta-egypt`) |

**FD-00:** Tenant/clinic columns no longer ship UAE-style DB defaults (`5%` VAT, `150` visit fee, `N/A` TRN). New orgs get values from `market-tax-pack` at provision time; existing EG rows were backfilled in migration `20261117160000_fd00_market_tax_defaults` with `AuditLog` rows.

Egypt live pack includes ETA labels (migration `20261116220000_market_tax_registration_labels`).

## Downstream use

- **Patient invoices** — snapshot `clinicLicenseNumber` and `clinicTaxRegistrationNumber` at issue time; preview uses `marketTaxLabels` for line captions.
- **Fiscal / ETA** — `issuerRin` from clinic `taxRegistrationNumber` (see `providers/fiscal/eta-egypt.fiscal-provider.ts`).
- **Front desk / billing** — passes `clinicTaxRin` when queueing fiscal documents.

## Related

- [EGYPT_GO_LIVE.md](./EGYPT_GO_LIVE.md) · [markets/egypt.md](./markets/egypt.md) · [FEATURE_FLAGS.md](./FEATURE_FLAGS.md)