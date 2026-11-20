import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { attestTenantResidency, marketProductionBinding } from "./data-cells";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();

describe("SC-01 EG tenants in database", () => {
  before(async () => {
    await prisma.$connect();
  });
  after(async () => {
    await prisma.$disconnect();
  });

  it("every tenant in market EG uses frankfurt cell and eu-central-1 stores", async () => {
    const binding = marketProductionBinding("EG");
    assert.ok(binding);
    const market = await prisma.market.findFirst({ where: { code: "EG" } });
    assert.ok(market, "seed must include market-egypt");
    assert.equal(market!.hostCell, binding!.hostCell);
    assert.equal(market!.dataRegion, binding!.dataRegion);

    const tenants = await prisma.tenant.findMany({
      where: { marketId: market!.id },
      select: { id: true, name: true, deploymentCell: true, market: true },
    });
    assert.ok(tenants.length >= 1, "expected at least one EG demo tenant");
    for (const t of tenants) {
      const att = attestTenantResidency({ deploymentCell: t.deploymentCell }, market!);
      assert.equal(att.deploymentCell, binding!.hostCell, `tenant ${t.name}`);
      for (const [key, store] of Object.entries(att.dataStores)) {
        assert.equal(
          store.region,
          binding!.dataRegion,
          `tenant ${t.name} store ${key} must be in ${binding!.dataRegion}`,
        );
      }
    }
  });
});