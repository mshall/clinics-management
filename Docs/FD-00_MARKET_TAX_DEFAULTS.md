# FD-00 — Market-derived tax & fees

| Item | Status |
|------|--------|
| Launch build Step 001 | **Done** (shipped on `main` before `kiorly/launch`; verified on integration branch) |

## Summary

- Tenant/clinic invoice VAT, visit fee, TRN, and `deploymentCell` come from `Market.taxConfig` at provision time (`tenantCreateDefaultsFromMarket`, `market-tax-pack.ts`).
- Named migration `20261117160000_fd00_market_tax_defaults` backfills EG tenants/clinics and writes `AuditLog` rows.
- LIVE markets must pass `market-pack-validation` (complete tax pack).
- Admin org settings + clinic license/tax panels expose market defaults with override toggles (`mapTenantTaxSettingsApi`, web admin).

## Tests

- `apps/api/src/markets/market-tax-pack.node.test.ts` (EG + second market, TRN validation)
- `apps/api/prisma/seed-tenant-fields.node.test.ts`
- Provisioning paths: `signup-provision.service.ts`, `platform-admin.service.ts`

## Needs human

See `Docs/KIORLY_NEEDS_HUMAN.md` (NH-001): confirm EG medical-service VAT vs SaaS VAT with tax adviser.