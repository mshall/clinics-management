import { PlanKey, Prisma, type PrismaClient } from "@prisma/client";
import { planEntitlementRowsForSeed } from "../src/entitlements/plans-matrix";

const PLAN_META: Record<PlanKey, { nameEn: string; nameAr: string; sortOrder: number; isPublic: boolean }> = {
  LITE: { nameEn: "Lite", nameAr: "لايت", sortOrder: 10, isPublic: true },
  PRO: { nameEn: "Pro", nameAr: "برو", sortOrder: 20, isPublic: true },
  CLINIC: { nameEn: "Clinic", nameAr: "عيادة", sortOrder: 30, isPublic: true },
  ENTERPRISE: { nameEn: "Enterprise", nameAr: "مؤسسات", sortOrder: 40, isPublic: false },
};

const ENTITLEMENT_ROWS = planEntitlementRowsForSeed();

/** Upsert plan catalog entitlements from PL-04 matrix (idempotent). */
export async function ensurePlanEntitlements(prisma: PrismaClient): Promise<void> {
  for (const key of Object.values(PlanKey)) {
    const meta = PLAN_META[key];
    const plan = await prisma.plan.upsert({
      where: { key },
      create: {
        key,
        nameEn: meta.nameEn,
        nameAr: meta.nameAr,
        sortOrder: meta.sortOrder,
        isPublic: meta.isPublic,
      },
      update: {
        nameEn: meta.nameEn,
        nameAr: meta.nameAr,
        sortOrder: meta.sortOrder,
        isPublic: meta.isPublic,
      },
    });

    for (const ent of ENTITLEMENT_ROWS[key]) {
      await prisma.planEntitlement.upsert({
        where: { planId_key: { planId: plan.id, key: ent.key } },
        create: { planId: plan.id, key: ent.key, valueJson: ent.value as Prisma.InputJsonValue },
        update: { valueJson: ent.value as Prisma.InputJsonValue },
      });
    }
  }
}