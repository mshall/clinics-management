import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertMarketMatchesProductionBinding,
  assertTenantDeploymentCellMatchesMarket,
  attestTenantResidency,
  loadDataCellsRegistry,
  marketProductionBinding,
} from "./data-cells";
import { describeMarketCellRouting } from "./tenant-cell-routing";

describe("SC-01 data residency registry", () => {
  it("Egypt production binding is Path A on frankfurt / eu-central-1", () => {
    const reg = loadDataCellsRegistry();
    assert.equal(reg.egyptProduction.path, "A");
    assert.equal(reg.egyptProduction.hostCell, "frankfurt");
    assert.equal(reg.egyptProduction.dataRegion, "eu-central-1");
    const binding = marketProductionBinding("EG");
    assert.ok(binding);
    assert.equal(binding!.hostCell, "frankfurt");
    assert.equal(binding!.dataRegion, "eu-central-1");
  });

  it("EG tenant attestation places DB, uploads, and backups in eu-central-1", () => {
    const att = attestTenantResidency(
      { deploymentCell: "frankfurt" },
      { code: "EG", hostCell: "frankfurt", dataRegion: "eu-central-1" },
    );
    assert.equal(att.path, "A");
    assert.equal(att.deploymentCell, "frankfurt");
    for (const store of Object.values(att.dataStores)) {
      assert.equal(
        store.region,
        "eu-central-1",
        `${store.service} must remain in eu-central-1 per decision memo`,
      );
    }
  });

  it("rejects EG market pack pointing at cairo cell while Path A is active", () => {
    assert.throws(
      () =>
        assertMarketMatchesProductionBinding({
          code: "EG",
          hostCell: "cairo",
          dataRegion: "me-south-1",
        }),
      /hostCell=frankfurt/,
    );
  });

  it("rejects EG tenant on non-frankfurt cell under Path A", () => {
    assert.throws(
      () =>
        assertTenantDeploymentCellMatchesMarket(
          { deploymentCell: "cairo" },
          { code: "EG", hostCell: "frankfurt", dataRegion: "eu-central-1" },
        ),
      /deployment cell frankfurt/,
    );
  });

  it("cairo cell is prepared for Path B with all stores in me-south-1", () => {
    const reg = loadDataCellsRegistry();
    const cairo = reg.cells.cairo;
    assert.ok(cairo);
    assert.equal(cairo.awsRegion, "me-south-1");
    for (const store of Object.values(cairo.dataStores)) {
      assert.equal(store.region, "me-south-1");
    }
  });

  it("market cell routing resolves stack id from registry", () => {
    const row = describeMarketCellRouting({ code: "EG", hostCell: "frankfurt", dataRegion: "eu-central-1" });
    assert.equal(row.stackId, "kiorly-clinics-management");
    assert.equal(row.awsRegion, "eu-central-1");
  });
});