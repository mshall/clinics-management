import { Gender, type PrismaClient } from "@prisma/client";
import { PILOT_DEMO_PATIENTS } from "./pilot-tenant-catalog";

export async function seedPilotDemoPatients(
  prisma: PrismaClient,
  tenantId: string,
  clinicId: string,
): Promise<void> {
  for (const p of PILOT_DEMO_PATIENTS) {
    await prisma.patient.upsert({
      where: { tenantId_mrn: { tenantId, mrn: p.mrn } },
      create: {
        tenantId,
        homeBranchId: clinicId,
        mrn: p.mrn,
        firstNameEn: p.firstNameEn,
        lastNameEn: p.lastNameEn,
        firstNameAr: p.firstNameEn,
        lastNameAr: p.lastNameEn,
        phone: p.phone,
        gender: Gender.F,
      },
      update: {
        homeBranchId: clinicId,
        firstNameEn: p.firstNameEn,
        lastNameEn: p.lastNameEn,
        phone: p.phone,
        deletedAt: null,
      },
    });
  }
}