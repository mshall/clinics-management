import { AppointmentStatus, type PrismaClient } from "@prisma/client";
import type { TrialPackConfig } from "./trial-config";

export async function countQualifyingTrialVisits(
  prisma: Pick<PrismaClient, "appointment">,
  tenantId: string,
  trialStartsAt: Date,
  config: TrialPackConfig,
): Promise<number> {
  const windowEnd = new Date(trialStartsAt.getTime() + config.activationWindowDays * 86_400_000);
  return prisma.appointment.count({
    where: {
      tenantId,
      status: { in: [AppointmentStatus.CHECKED_IN, AppointmentStatus.COMPLETED] },
      checkedInAt: { gte: trialStartsAt, lte: windowEnd },
      patient: { isSample: false },
    },
  });
}

export function trialActivationProgress(
  visitCount: number,
  config: TrialPackConfig,
): { current: number; required: number; qualified: boolean } {
  const required = config.minQualifyingVisits;
  return {
    current: visitCount,
    required,
    qualified: visitCount >= required,
  };
}