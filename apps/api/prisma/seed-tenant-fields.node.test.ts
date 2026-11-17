import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_SEED_DEPLOYMENT_CELL,
  shellTenantSeedRow,
} from "./seed-tenant-fields";

describe("seed tenant fields (SC-01 / FD-00)", () => {
  const names = { kiorly: "Kiorly Demo", drAhmed: "Dr Ahmed Group" };
  const eg = { id: "m1", hostCell: "frankfurt" };

  it("every shell row includes deploymentCell", () => {
    for (let i = 0; i < 15; i += 1) {
      const row = shellTenantSeedRow(i, names, eg);
      assert.ok(row.deploymentCell.length > 0);
    }
  });

  it("EG tenant row binds market and host cell", () => {
    const row = shellTenantSeedRow(1, names, eg);
    assert.equal(row.marketId, "m1");
    assert.equal(row.deploymentCell, "frankfurt");
    assert.equal(row.baseCurrency, "EGP");
  });

  it("non-EG shell rows use default cell", () => {
    const row = shellTenantSeedRow(0, names, eg);
    assert.equal(row.deploymentCell, DEFAULT_SEED_DEPLOYMENT_CELL);
    assert.equal(row.marketId, null);
  });
});