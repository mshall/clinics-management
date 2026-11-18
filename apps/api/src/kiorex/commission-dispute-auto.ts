import { CommissionChargeStatus, Prisma } from "@prisma/client";
import type { NewPatientService } from "../patients/new-patient.service";

const DUPLICATE_WINDOW_DAYS = 7;

export async function shouldAutoApproveExistingPatient(
  newPatients: NewPatientService,
  tenantId: string,
  patientId: string,
  attendedAt: Date,
): Promise<boolean> {
  return newPatients.hadPriorAttendedVisit(tenantId, patientId, attendedAt);
}

export async function findDuplicateCharge(
  tx: Prisma.TransactionClient,
  tenantId: string,
  patientId: string,
  chargeId: string,
  attendedAt: Date,
): Promise<{ id: string } | null> {
  const windowStart = new Date(attendedAt);
  windowStart.setUTCDate(windowStart.getUTCDate() - DUPLICATE_WINDOW_DAYS);
  return tx.kiorexCommissionCharge.findFirst({
    where: {
      tenantId,
      patientId,
      id: { not: chargeId },
      attendedAt: { gte: windowStart, lte: attendedAt },
      status: {
        notIn: [CommissionChargeStatus.REVERSED, CommissionChargeStatus.WAIVED],
      },
    },
    select: { id: true },
  });
}