import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import {
  parsePilotTierArg,
  type PilotTier,
} from "../src/staging/pilot-tenant-catalog";
import {
  resetAllSalesDemoTenants,
  resetSalesDemoTenant,
  summarizePilotTenant,
} from "../src/staging/sales-demo-reset";

async function main() {
  const argv = process.argv.slice(2);
  let tierArg: string | undefined;
  for (const arg of argv) {
    if (arg.startsWith("--tier=")) tierArg = arg.slice("--tier=".length);
    else if (arg === "--all") tierArg = "all";
  }
  tierArg ??= process.env.SALES_DEMO_TIER?.trim();

  const parsed = parsePilotTierArg(tierArg);
  if (parsed === null) {
    console.error("Usage: npm run demo:reset -- [--tier=lite|pro|clinic|--all]");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const passwordHash = bcrypt.hashSync("demo", 10);
  try {
    if (parsed === "all") {
      const results = await resetAllSalesDemoTenants(prisma, passwordHash);
      for (const r of results) {
        const summary = await summarizePilotTenant(prisma, r.tenantId);
        console.log(`Reset ${r.tier}:`, summary);
      }
      return;
    }
    const { tenantId, tier } = await resetSalesDemoTenant(prisma, parsed as PilotTier, passwordHash);
    const summary = await summarizePilotTenant(prisma, tenantId);
    console.log(`Reset sales demo (${tier}):`, summary);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});