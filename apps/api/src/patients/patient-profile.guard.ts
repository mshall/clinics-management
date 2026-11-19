import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

export const PATIENT_PROFILE_INCOMPLETE = "PATIENT_PROFILE_INCOMPLETE";

type PatientLookup = Pick<Prisma.TransactionClient, "patient">;

/** Check-in, encounter create, and appointment complete require a finished patient registration. */
export async function assertPatientProfileComplete(
  db: PatientLookup,
  tenantId: string,
  patientId: string,
): Promise<void> {
  const patient = await db.patient.findFirst({
    where: { id: patientId, tenantId, deletedAt: null },
    select: { profileComplete: true },
  });
  if (!patient) {
    throw new BadRequestException("Invalid patient");
  }
  if (!patient.profileComplete) {
    throw new BadRequestException({
      code: PATIENT_PROFILE_INCOMPLETE,
      message: "Complete the patient profile before this clinical action.",
      messageKey: "errors.patientProfileIncomplete",
    });
  }
}
