import type { PrismaClient } from "@prisma/client";
import { PILOT_TENANT_SPECS, PILOT_TIERS, type PilotTier } from "./pilot-tenant-catalog";
import { assertSalesDemoResetAllowed } from "./staging-profile";

export async function purgeSalesDemoTransactionalData(
  prisma: PrismaClient,
  tenantId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.fiscalSubmission.deleteMany({ where: { tenantId } });
    await tx.fiscalDocument.deleteMany({ where: { tenantId } });
    await tx.revenueEntry.deleteMany({ where: { tenantId } });
    await tx.expense.deleteMany({ where: { tenantId } });
    await tx.invoice.deleteMany({ where: { tenantId } });
    await tx.operationInstallment.deleteMany({ where: { tenantId } });
    await tx.operationMedication.deleteMany({ where: { tenantId } });
    await tx.operationDocument.deleteMany({ where: { tenantId } });
    await tx.operation.deleteMany({ where: { tenantId } });
    await tx.encounterMedication.deleteMany({ where: { tenantId } });
    await tx.encounterDocument.deleteMany({ where: { tenantId } });
    await tx.encounter.deleteMany({ where: { tenantId } });
    await tx.appointment.deleteMany({ where: { tenantId } });
    await tx.outboundMessage.deleteMany({ where: { tenantId } });
    await tx.supportTicket.deleteMany({ where: { tenantId } });
    await tx.patientDocument.deleteMany({ where: { tenantId } });
    await tx.patientAllergy.deleteMany({ where: { tenantId } });
    await tx.patient.deleteMany({ where: { tenantId } });
    await tx.auditLog.deleteMany({ where: { tenantId } });
  });
}

export async function resetSalesDemoTenant(
  prisma: PrismaClient,
  tier: PilotTier,
  passwordHash: string,
): Promise<{ tenantId: string; tier: PilotTier }> {
  assertSalesDemoResetAllowed();
  const spec = PILOT_TENANT_SPECS[tier];
  const tenant = await prisma.tenant.findFirst({
    where: { name: spec.nameEn },
    select: { id: true },
  });
  if (!tenant) {
    const { ensurePilotTenant } = await import("../../prisma/pilot-tenants.seed");
    await ensurePilotTenant(prisma, passwordHash, tier);
    const created = await prisma.tenant.findFirstOrThrow({ where: { name: spec.nameEn } });
    return { tenantId: created.id, tier };
  }
  await purgeSalesDemoTransactionalData(prisma, tenant.id);
  const { ensurePilotTenant } = await import("../../prisma/pilot-tenants.seed");
  await ensurePilotTenant(prisma, passwordHash, tier, { replacePatients: true });
  return { tenantId: tenant.id, tier };
}

export async function resetAllSalesDemoTenants(
  prisma: PrismaClient,
  passwordHash: string,
): Promise<Array<{ tenantId: string; tier: PilotTier }>> {
  const out: Array<{ tenantId: string; tier: PilotTier }> = [];
  for (const tier of PILOT_TIERS) {
    out.push(await resetSalesDemoTenant(prisma, tier, passwordHash));
  }
  return out;
}

export type SalesDemoResetSummary = {
  tenantId: string;
  tier: PilotTier;
  patients: number;
  appointments: number;
};

export async function summarizePilotTenant(prisma: PrismaClient, tenantId: string): Promise<SalesDemoResetSummary> {
  const name = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  const tier =
    (PILOT_TIERS.find((t) => PILOT_TENANT_SPECS[t].nameEn === name?.name) as PilotTier | undefined) ?? "lite";
  const [patients, appointments] = await Promise.all([
    prisma.patient.count({ where: { tenantId, deletedAt: null } }),
    prisma.appointment.count({ where: { tenantId } }),
  ]);
  return { tenantId, tier, patients, appointments };
}