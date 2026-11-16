import { AppointmentQueueStage, AppointmentStatus, EncounterStatus, type Prisma } from "@prisma/client";

export function isRevertingAppointmentCheckIn(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return (
    from === AppointmentStatus.CHECKED_IN &&
    (to === AppointmentStatus.SCHEDULED || to === AppointmentStatus.CONFIRMED)
  );
}

export function buildRevertCheckInPatch(targetStatus: AppointmentStatus) {
  return {
    status: targetStatus,
    checkedInAt: null,
    queueTicketNumber: null,
    queueStage: null as AppointmentQueueStage | null,
    roomLabel: null,
    roomAssignedAt: null,
    calledAt: null,
    checkInPaymentAmount: null,
    checkInCollectionMode: null,
    checkInTransferChannel: null,
    checkInTransferReference: null,
  };
}

/** Remove auto-created draft visit so the next check-in can issue a new ticket and encounter. */
export async function deleteDraftEncountersOnCheckInRevert(
  tx: Prisma.TransactionClient,
  tenantId: string,
  appointmentId: string,
): Promise<void> {
  await tx.encounter.deleteMany({
    where: {
      tenantId,
      appointmentId,
      status: EncounterStatus.DRAFT,
    },
  });
}