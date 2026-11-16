import { BadRequestException } from "@nestjs/common";
import { EncounterStatus, type Prisma } from "@prisma/client";

type EncounterLookup = Pick<Prisma.TransactionClient, "encounter">;

/** Appointments cannot be completed while a linked encounter is still draft or amended. */
export async function assertNoOpenEncounterForAppointmentComplete(
  db: EncounterLookup,
  tenantId: string,
  appointmentId: string,
): Promise<void> {
  const open = await db.encounter.findFirst({
    where: {
      tenantId,
      appointmentId,
      status: { in: [EncounterStatus.DRAFT, EncounterStatus.AMENDED] },
    },
    select: { id: true },
  });
  if (open) {
    throw new BadRequestException(
      "Finalize the linked encounter before completing this appointment.",
    );
  }
}