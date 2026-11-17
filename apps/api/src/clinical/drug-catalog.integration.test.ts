import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import type { PrismaService } from "../prisma/prisma.service";
import { DrugCatalogService } from "./drug-catalog.service";
import { resolveDrugIngredients } from "./drug-ingredient-resolver";

const prisma = new PrismaClient();
const catalog = new DrugCatalogService(prisma as unknown as PrismaService);

function percentile(samples: number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

describe("CL-01 Egyptian drug catalog (database)", () => {
  before(async () => {
    await prisma.$connect();
  });
  after(async () => {
    await prisma.$disconnect();
  });

  it("Augmentin resolves to amoxicillin and clavulanic acid", async () => {
    const market = await prisma.market.findFirst({ where: { code: "EG" } });
    assert.ok(market);
    const resolved = await resolveDrugIngredients(prisma, market!.id, "Augmentin", null);
    assert.equal(resolved.matchedCatalog, true);
    assert.ok(resolved.drugProductId);
    const names = resolved.ingredientNames.map((n) => n.toLowerCase());
    assert.ok(names.includes("amoxicillin"));
    assert.ok(names.includes("clavulanic acid"));
  });

  it("search p95 stays under 100 ms on full demo dataset", async () => {
    const market = await prisma.market.findFirst({ where: { code: "EG" } });
    assert.ok(market);
    const tenant = await prisma.tenant.findFirst({ where: { marketId: market!.id } });
    assert.ok(tenant, "seed an EG tenant with drug catalog");
    const searchUser = { userId: "cl01-perf-clinician", tenantId: tenant!.id } as JwtUser;
    const productCount = await prisma.drugProduct.count({ where: { marketId: market!.id, isActive: true } });
    assert.ok(productCount >= 100, `expected demo catalog size, got ${productCount}`);
    const samples: number[] = [];
    const queries = ["Aug", "Pan", "Pharma", "Bruf", "demo-ingredient", "أوج"];
    for (let round = 0; round < 8; round += 1) {
      for (const q of queries) {
        const start = performance.now();
        await catalog.searchProducts(tenant!.id, searchUser, q, 25);
        samples.push(performance.now() - start);
      }
    }
    const p95 = percentile(samples, 95);
    assert.ok(
      p95 < 100,
      `expected drug search p95 < 100ms (got ${p95.toFixed(1)}ms over ${samples.length} samples)`,
    );
  });
});