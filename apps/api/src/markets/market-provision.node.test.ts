import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MarketProvisionService } from "./market-provision.service";

describe("MarketProvisionService (SC-01)", () => {
  const svc = new MarketProvisionService();

  it("Egypt market reuses shared frankfurt stack", () => {
    const r = svc.resolveProvision("eu-central-1", "frankfurt");
    assert.equal(r.mode, "shared");
    assert.equal(r.dataRegion, "eu-central-1");
  });

  it("cairo cell requires new deploy in me-south-1", () => {
    const r = svc.resolveProvision("me-south-1", "cairo");
    assert.equal(r.mode, "deploy_required");
    assert.match(r.message, /KIORLY_HOST_CELL=cairo/);
    assert.match(r.message, /me-south-1/);
  });
});