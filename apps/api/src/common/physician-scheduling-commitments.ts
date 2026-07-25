import { BadRequestException } from "@nestjs/common";
import { AppointmentStatus, OperationStatus, UserRole } from "@prisma/client";

const BLOCKING_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.CHECKED_IN,
];

export const PHYSICIAN_HAS_ACTIVE_BOOKINGS_ERROR = "PHYSICIAN_HAS_ACTIVE_BOOKINGS";

type SchedulingCommitmentDb = {
  appointment: {
    count: (args: { where: { tenantId: string; clinicianId: string; status: { in: AppointmentStatus[] } } }) => Promise<number>;
  };
  operation: {
    count: (args: { where: { tenantId: string; clinicianId: string; status: OperationStatus } }) => Promise<number>;
  };
};

export async function countPhysicianSchedulingCommitments(
  db: SchedulingCommitmentDb,
  tenantId: string,
  userId: string,
): Promise<{ appointmentCount: number; operationCount: number }> {
  const [appointmentCount, operationCount] = await Promise.all([
    db.appointment.count({
      where: {
        tenantId,
        clinicianId: userId,
        status: { in: BLOCKING_APPOINTMENT_STATUSES },
      },
    }),
    db.operation.count({
      where: {
        tenantId,
        clinicianId: userId,
        status: OperationStatus.SCHEDULED,
      },
    }),
  ]);
  return { appointmentCount, operationCount };
}

/** Block HR lifecycle changes when a physician still has open appointment bookings or scheduled operations. */
export async function assertPhysicianHasNoActiveSchedulingCommitments(
  db: SchedulingCommitmentDb,
  tenantId: string,
  userId: string | null | undefined,
  linkedUserRole: UserRole | null | undefined,
): Promise<void> {
  if (!userId?.trim() || linkedUserRole !== UserRole.PHYSICIAN) return;

  const { appointmentCount, operationCount } = await countPhysicianSchedulingCommitments(db, tenantId, userId);
  if (appointmentCount === 0 && operationCount === 0) return;

  const messages: string[] = [
    "This physician cannot be deactivated or archived while they have active bookings assigned to them.",
  ];
  if (appointmentCount > 0) {
    messages.push(
      `${appointmentCount} appointment booking${appointmentCount === 1 ? "" : "s"} still scheduled, confirmed, or checked in — reassign or cancel them first.`,
    );
  }
  if (operationCount > 0) {
    messages.push(
      `${operationCount} scheduled operation${operationCount === 1 ? "" : "s"} still assigned to this physician — reassign or cancel them first.`,
    );
  }

  throw new BadRequestException({
    message: messages,
    error: PHYSICIAN_HAS_ACTIVE_BOOKINGS_ERROR,
  });
}
