import { BadRequestException } from "@nestjs/common";
import { RevenueStatus, VisitCollectionMode, type Prisma } from "@prisma/client";
import { getEncounterVisitFeeReceivableSummary } from "../common/visit-fee-ledger";

type Db = Pick<Prisma.TransactionClient, "appointment" | "encounter" | "revenueEntry">;

const VISIT_CATEGORIES = ["VISIT", "VISIT_FEE"] as const;

export const APPOINTMENT_TRANSFER_FEE_BLOCKED_MSG =
  "This appointment uses a payment channel for the scheduled fee. Collect the full amount with a transaction ID and upload the transfer receipt before completing the visit.";

/** Blocks completion when a scheduled transfer fee is still receivable or never collected. */
export async function assertScheduledTransferFeeCollected(
  db: Db,
  tenantId: string,
  appointmentId: string,
): Promise<void> {
  const apt = await db.appointment.findFirst({
    where: { id: appointmentId, tenantId },
    select: { feeAmount: true, scheduledCollectionMode: true },
  });
  if (!apt || Number(apt.feeAmount) <= 0) return;
  if (apt.scheduledCollectionMode !== VisitCollectionMode.MONEY_TRANSFER) return;

  const encounters = await db.encounter.findMany({
    where: { tenantId, appointmentId },
    select: { id: true },
  });
  for (const enc of encounters) {
    const receivable = await getEncounterVisitFeeReceivableSummary(db, tenantId, enc.id);
    if (receivable && receivable.amount > 0.001) {
      throw new BadRequestException(APPOINTMENT_TRANSFER_FEE_BLOCKED_MSG);
    }
  }

  const posted = await db.revenueEntry.findFirst({
    where: {
      tenantId,
      OR: [{ appointmentId }, { encounterId: { in: encounters.map((e) => e.id) } }],
      status: RevenueStatus.POSTED,
      category: { in: [...VISIT_CATEGORIES] },
      collectionMode: VisitCollectionMode.MONEY_TRANSFER,
      transferReference: { not: null },
    },
    select: { id: true, grossAmount: true },
  });
  if (!posted) {
    throw new BadRequestException(APPOINTMENT_TRANSFER_FEE_BLOCKED_MSG);
  }
  const paid = Number(posted.grossAmount);
  if (Math.abs(paid - Number(apt.feeAmount)) > 0.02) {
    throw new BadRequestException(APPOINTMENT_TRANSFER_FEE_BLOCKED_MSG);
  }
}