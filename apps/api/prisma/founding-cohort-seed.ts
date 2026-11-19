import type { PrismaClient } from "@prisma/client";

export const FOUNDING_EG_COHORT_KEY = "FOUNDING_EG";

/** PL-09 — Egypt founding cohort (500 seats, 24-month price lock). */
export async function ensureFoundingCohort(prisma: PrismaClient): Promise<void> {
  const market = await prisma.market.findUnique({ where: { code: "EG" }, select: { id: true } });
  if (!market) return;
  const opensAt = new Date("2026-01-01T00:00:00.000Z");
  await prisma.cohort.upsert({
    where: { key: FOUNDING_EG_COHORT_KEY },
    create: {
      key: FOUNDING_EG_COHORT_KEY,
      marketId: market.id,
      cap: 500,
      assignedCount: 0,
      opensAt,
      closesAt: null,
      trialDays: null,
      priceLockMonths: 24,
    },
    update: {
      marketId: market.id,
      cap: 500,
      opensAt,
      priceLockMonths: 24,
    },
  });
}