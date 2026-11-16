import { FiscalSubmissionStatus, Prisma, RevenueStatus } from "@prisma/client";
import { queueFiscalDocument } from "./fiscal-queue";

/** Void revenue rows and queue ETA return receipts where a sale was submitted. */
export async function voidPostedRevenuesWithFiscalReturns(
  tx: Prisma.TransactionClient,
  tenantId: string,
  where: Prisma.RevenueEntryWhereInput,
  descriptionPrefix: string,
): Promise<void> {
  const rows = await tx.revenueEntry.findMany({
    where: { tenantId, status: RevenueStatus.POSTED, ...where },
    include: {
      fiscalDocument: {
        include: {
          submission: true,
        },
      },
      operation: { select: { patientId: true, clinicId: true } },
      encounter: { select: { patientId: true, clinicId: true } },
    },
  });

  for (const row of rows) {
    const amount = Number(row.netAmount);
    if (amount <= 0) continue;

    await tx.revenueEntry.update({
      where: { id: row.id },
      data: { status: RevenueStatus.VOID, grossAmount: 0, netAmount: 0 },
    });

    const sub = row.fiscalDocument?.submission;
    const fiscalSubmitted =
      sub &&
      (sub.status === FiscalSubmissionStatus.SUBMITTED || sub.status === FiscalSubmissionStatus.ACCEPTED);

    const patientId =
      row.operation?.patientId ?? row.encounter?.patientId ?? null;
    if (!patientId || !fiscalSubmitted) continue;

    await queueFiscalDocument(tx, {
      tenantId,
      clinicId: row.clinicId,
      patientId,
      totalAmount: amount,
      currency: row.currency,
      description: `${descriptionPrefix} · ${row.description ?? row.category}`,
      returnForRevenueEntryId: row.id,
    });
  }
}