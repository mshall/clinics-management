# SC-01 — Data residency decision (Egypt)

**Decision ID:** `SC-01-2026-11` (canonical registry: [`platform/data-cells.json`](../platform/data-cells.json))  
**Status:** **Done (engineering)** — Path **A** for production Egypt tenants (Frankfurt); Path **B** infra prepared, not activated until in-country hosting is required  
**Owner:** Platform / Legal / Security

---

## 0. Launch gate — government permission (mandatory)

**No production Egypt go-live** with live patient (PHI) data until Kiorly has obtained **government permission** for the residency and cross-border processing model in use:

- **Path A (Frankfurt):** PDPC **controller** and **processor** registration plus **cross-border transfer** approval (or equivalent government authorization to process Egyptian health data in the EU cell).
- **Path B (Cairo):** in-country hosting approvals as required by PDPC and applicable sector rules, if EG production is moved to `me-south-1`.

Engineering may continue on Frankfurt with synthetic/demo data and pilots, but **marketing “live” clinics**, contractual PHI processing, and regulator-facing claims must wait until Legal documents the permission **immediately before launch**. This gate is a standing project rule (see `.cursor/rules/data-residency-gate.mdc`).

---

## 1. Context

- Kiorly runs a **shared PostgreSQL** multi-tenant platform with **S3** uploads and **RDS automated backups** per deployment **cell**.
- Today’s **production** stack is in **Frankfurt (`eu-central-1`)**, cell id **`frankfurt`**.
- Egypt’s **PDPL** (Law 151/2020) treats health and personal data as sensitive; **cross-border transfer** to the EU requires PDPC licences unless data stays in Egypt or an adequacy / contractual mechanism applies.

---

## 2. Options considered

| | **Path A — Frankfurt + PDPC licences** | **Path B — In-region Egypt cell** |
|---|----------------------------------------|-----------------------------------|
| **Where data lives** | RDS + S3 + RDS backups in **`eu-central-1`** | RDS + S3 + backups in **`me-south-1`** (Cairo) |
| **Legal** | **Controller + processor** registration with PDPC; **cross-border transfer licence** before live PHI | PDPC registration; processing largely **in-country**; EU sub-processors only where contracted (e.g. OpenAI EU endpoint) |
| **Ops** | Single production cell today | Second CDK stack `kiorly-cell-cairo`, routing per market, tenant migration |
| **Cost / time** | Lower incremental cost; legal lead time for licences | Higher AWS footprint; faster regulatory narrative for in-country hosting |
| **Product** | EG market row: `hostCell=frankfurt`, `dataRegion=eu-central-1` | EG market row flips to `hostCell=cairo`, `dataRegion=me-south-1` after go-live gate |

---

## 3. Decision (effective 2026-11-17)

**Production Egypt tenants use Path A:**

1. All **EG** organizations remain on cell **`frankfurt`** / AWS **`eu-central-1`**. Patient data stays in Frankfurt while **PDPC controller/processor** registration and a **cross-border transfer licence** (or equivalent government approval to process Egyptian patient data in the EU cell) are pursued with Legal — not Cairo unless regulators require Path B.
2. **No live Egyptian PHI** in production without documented **PDPC controller/processor** status and **cross-border transfer licence** (customer + Kiorly processor obligations — see [markets/egypt.md](./markets/egypt.md)).
3. **Path B** is **engineered but not deployed**: CDK accepts `-c hostCell=cairo`; deploy via `KIORLY_HOST_CELL=cairo AWS_REGION=me-south-1 bash scripts/deploy-aws.sh`. Market `EG` must **not** point at `cairo` until the go-live gate in [runbooks/EG_TENANT_CELL_MIGRATION.md](./runbooks/EG_TENANT_CELL_MIGRATION.md) is completed.

**Rationale:** One proven Frankfurt stack is already live; PDPC licensing is parallelizable with pilot sales; in-region cell remains the documented escape hatch if regulators or enterprise buyers require in-country hosting.

---

## 4. Technical enforcement

| Layer | Mechanism |
|-------|-----------|
| **Registry** | `platform/data-cells.json` — cells, store regions, EG binding |
| **Market pack** | `assertMarketMatchesProductionBinding` on pack validation |
| **Tenant create** | `assertTenantDeploymentCellMatchesMarket` in platform admin |
| **Infra** | CDK tags `KiorlyHostCell`, `KiorlyDataRegion` on RDS and S3; outputs `HostCell`, `DataRegion` |
| **Tests** | API: `data-residency.node.test.ts`, `data-residency.integration.test.ts`. Infra CDK tagging tests run **outside** the default GitHub `ci:test` job (local / `infra` package when changing CDK). |

---

## 5. Sub-processors

Published list: [SUB_PROCESSORS_BY_MARKET.md](./SUB_PROCESSORS_BY_MARKET.md).

---

## 6. Follow-ups (out of scope for SC-01)

- Route login / DNS by market (`PLATFORM_CELL_APP_URLS`) when cairo cell is live.
- Quarterly RDS backup export to customer-owned bucket (retention > 35 days).
- PDPC licence evidence folder per tenant contract.
- Flip `marketProductionBinding.EG` to Path B in registry + migration runbook execution.