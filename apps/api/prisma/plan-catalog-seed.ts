import {
  BillingInterval,
  PlanKey,
  PriceUnit,
  Prisma,
  type PrismaClient,
} from "@prisma/client";

import { ensurePlanEntitlements } from "./plans.seed";

/** Ensures the global plan catalog and Egypt (EG) list prices exist. Idempotent. */
export async function ensurePlanCatalog(prisma: PrismaClient): Promise<void> {
  const eg = await prisma.market.findFirst({ where: { code: "EG" } });
  if (!eg) return;

  await ensurePlanEntitlements(prisma);

  const lite = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.LITE } });
  const pro = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.PRO } });
  const clinic = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.CLINIC } });
  const enterprise = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.ENTERPRISE } });

  const currency = eg.defaultCurrency || "EGP";
  const egPrices: Array<{
    planId: string;
    interval: BillingInterval;
    unit: PriceUnit;
    amount: string;
    includedClinicians?: number;
    extraClinicianAmount?: string | null;
  }> = [
    { planId: lite.id, interval: BillingInterval.MONTHLY, unit: PriceUnit.PER_TENANT, amount: "499" },
    { planId: lite.id, interval: BillingInterval.ANNUAL, unit: PriceUnit.PER_TENANT, amount: "4990" },
    { planId: pro.id, interval: BillingInterval.MONTHLY, unit: PriceUnit.PER_CLINICIAN, amount: "1299" },
    {
      planId: pro.id,
      interval: BillingInterval.ANNUAL,
      unit: PriceUnit.PER_CLINICIAN,
      amount: "999",
    },
    {
      planId: clinic.id,
      interval: BillingInterval.MONTHLY,
      unit: PriceUnit.PER_TENANT,
      amount: "3499",
      includedClinicians: 5,
      extraClinicianAmount: "699",
    },
    {
      planId: clinic.id,
      interval: BillingInterval.ANNUAL,
      unit: PriceUnit.PER_TENANT,
      amount: "3499",
      includedClinicians: 5,
      extraClinicianAmount: "699",
    },
    { planId: enterprise.id, interval: BillingInterval.MONTHLY, unit: PriceUnit.PER_TENANT, amount: "9999" },
    { planId: enterprise.id, interval: BillingInterval.ANNUAL, unit: PriceUnit.PER_TENANT, amount: "99990" },
  ];

  for (const row of egPrices) {
    const existing = await prisma.planPrice.findFirst({
      where: {
        planId: row.planId,
        marketId: eg.id,
        interval: row.interval,
        unit: row.unit,
        cohortKey: null,
        priceVersion: 1,
      },
    });
    if (existing) continue;

    await prisma.planPrice.create({
      data: {
        planId: row.planId,
        marketId: eg.id,
        currency,
        interval: row.interval,
        unit: row.unit,
        amount: new Prisma.Decimal(row.amount),
        includedClinicians: row.includedClinicians ?? 1,
        extraClinicianAmount:
          row.extraClinicianAmount != null ? new Prisma.Decimal(row.extraClinicianAmount) : null,
        priceVersion: 1,
      },
    });
  }
}