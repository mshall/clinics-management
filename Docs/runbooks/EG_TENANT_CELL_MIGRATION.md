# Runbook — Migrate Egypt pilot tenants (Frankfurt → Cairo cell)

**When to use:** Legal and product have approved **Path B** ([DATA_RESIDENCY_DECISION.md](../DATA_RESIDENCY_DECISION.md)). Market `EG` will move from `frankfurt` / `eu-central-1` to `cairo` / `me-south-1`.

**Not for routine deploys.** Production today remains Path A.

---

## 0. Preconditions

- [ ] Cairo cell deployed: `KIORLY_HOST_CELL=cairo AWS_REGION=me-south-1 bash scripts/deploy-aws.sh`
- [ ] CloudFront **AppUrl** for cairo recorded; `PLATFORM_CELL_APP_URLS='{"EG":"<cairo-app-url>"}'` on routing tier (future login directory)
- [ ] PDPC filings updated for in-country processing
- [ ] Pilot tenant list agreed (names + cutover window)
- [ ] Maintenance window + rollback owner

---

## 1. Freeze pilot tenant

1. Set tenant **read-only** (platform flag or maintenance banner) — *feature TBD; until then manual comms*.
2. Drain fiscal submit worker and outbound message queue for that `tenantId`.
3. Confirm no in-flight uploads (`UPLOAD` rows in `SUBMITTING`).

---

## 2. Export from Frankfurt cell

From **source** API (Frankfurt):

```bash
# Example: tenant-scoped logical export (implement ops script or use governance data export when available)
# Must include: patients, encounters, revenue, fiscal, documents metadata, audit sample.
```

Export **S3 object keys** for the tenant from Frankfurt `ApiUploadsBucket` (prefix by tenant if applicable).

---

## 3. Import to Cairo cell

1. Restore or seed empty tenant row in **cairo RDS** with **same tenant id** (or accept new id + mapping table — prefer stable id for ETA chain continuity).
2. Run `prisma migrate deploy` on cairo stack.
3. Copy S3 objects into cairo `ApiUploadsBucket`; verify checksums.
4. Re-point `Tenant.deploymentCell` = `cairo` and `Market` EG `hostCell` / `dataRegion` only **after** all pilot tenants migrated (or use per-tenant override if multi-cell routing shipped).

---

## 4. Application cutover

1. Update `platform/data-cells.json` → `egyptProduction.path` = `B`, `marketProductionBinding.EG` → cairo / me-south-1.
2. Run CI (`data-residency.*` tests must pass).
3. Pilot users sign in via cairo **AppUrl**; smoke: login, patient list, upload, ETA test receipt in **preprod** ETA credentials.

---

## 5. Decommission / retain Frankfurt copy

- Keep Frankfurt snapshot **encrypted** for **90 days** (contractual retention), then delete tenant rows and S3 objects per erasure policy.
- Audit log entry: `TENANT_CELL_MIGRATION` with source/target cell.

---

## 6. Rollback

If cairo cutover fails:

1. Re-enable Frankfurt tenant data (snapshot restore if needed).
2. Revert market binding in registry to Path A.
3. Communicate PDPC if personal data was duplicated across regions during failed attempt.

---

## Related

- [AWS_Cloud_Deployment_Guide.md](../AWS_Cloud_Deployment_Guide.md) — multi-cell deploy
- [markets/egypt.md](../markets/egypt.md) — PDPL checklist