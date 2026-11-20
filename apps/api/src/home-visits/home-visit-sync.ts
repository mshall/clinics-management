import { AppointmentStatus, HomeVisitState, type Prisma } from "@prisma/client";

/**
 * Keeps HomeVisit in step when the APPOINTMENT changes status through the normal appointment flows (confirm, cancel, no-show).
 * Pure Prisma, no DI and no flags: AppointmentsService calls it inside its own transaction. Field events (on my way, arrived,
 * finished, unsafe abort) are owned by HomeVisitExecService, which drives the appointment instead.
 */
export async function syncHomeVisitWithAppointmentStatus(
  tx: Pick<Prisma.TransactionClient, "homeVisit">,
  tenantId: string,
  appointmentId: string,
  status: AppointmentStatus,
  now = new Date(),
): Promise<void> {
  const v = await tx.homeVisit.findFirst({ where: { tenantId, appointmentId }, select: { id: true, state: true, addressConfirmedAt: true } });
  if (!v) return;
  if (status === AppointmentStatus.CONFIRMED && v.state === HomeVisitState.REQUESTED && v.addressConfirmedAt) {
    await tx.homeVisit.update({ where: { id: v.id }, data: { state: HomeVisitState.CONFIRMED } });
  } else if (status === AppointmentStatus.COMPLETED && v.state === HomeVisitState.ARRIVED) {
    // The note was signed (encounter finalized) before "Finished" was pressed: the visit is over, stop the safety timer.
    await tx.homeVisit.update({ where: { id: v.id }, data: { state: HomeVisitState.FINISHED, finishedAt: now, endedAt: now } });
  } else if (status === AppointmentStatus.CANCELLED && (v.state === HomeVisitState.REQUESTED || v.state === HomeVisitState.CONFIRMED)) {
    await tx.homeVisit.update({ where: { id: v.id }, data: { state: HomeVisitState.CANCELLED, endedAt: now } });
  } else if (status === AppointmentStatus.NO_SHOW && (v.state === HomeVisitState.CONFIRMED || v.state === HomeVisitState.ON_MY_WAY)) {
    // BR61: a visit aborted as unsafe is never a no-show (the package rejects it too); everything else follows the appointment.
    await tx.homeVisit.update({ where: { id: v.id }, data: { state: HomeVisitState.NO_SHOW, endedAt: now } });
  }
}
