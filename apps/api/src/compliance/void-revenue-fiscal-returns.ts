import { FiscalSubmissionStatus, Prisma, RevenueStatus } from "@prisma/client";
import { queueFiscalDocument } from "./fiscal-queue";

export type SubmissionVoidFiscalAction =
  | "none"
  | "cancel_pending"
  | "queue_return"
  | "return_already_rejected";

/** Classify how to unwind fiscal state when voiding posted revenue. */
export function submissionVoidFiscalAction(
  status: FiscalSubmissionStatus | undefined,
): SubmissionVoidFiscalAction {
  if (!status) return "none";
  if (status === FiscalSubmissionStatus.REJECTED) return "return_already_rejected";
  if (status === FiscalSubmissionStatus.PENDING) return "cancel_pending";
  if (
    status === FiscalSubmissionStatus.SUBMITTING ||
    status === FiscalSubmissionStatus.SUBMITTED ||
    status === FiscalSubmissionStatus.ACCEPTED
  ) {
    return "queue_return";
  }
  return "none";
}

async function cancelPendingFiscalDocument(tx: Prisma.TransactionClient, fiscalDocumentId: string): Promise<void> {
  const sub = await tx.fiscalSubmission.findFirst({ where: { fiscalDocumentId } });
  if (sub && sub.status !== FiscalSubmissionStatus.PENDING) {
    return;
  }
  await tx.fiscalDocument.delete({ where: { id: fiscalDocumentId } });
}

/** Remove revenue rows after fiscal void/cancel (e.g. encounter delete). */
export async function purgeRevenueEntries(
  tx: Prisma.TransactionClient,
  where: Prisma.RevenueEntryWhereInput,
): Promise<void> {
  await tx.revenueEntry.deleteMany({ where });
}

/** Void revenue rows and unwind or return linked ETA fiscal documents. */
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
    },
  });

  for (const row of rows) {
    const amount = Number(row.netAmount);
    if (amount <= 0) continue;

    const doc = row.fiscalDocument;
    const sub = doc?.submission;
    const action = doc
      ? sub
        ? submissionVoidFiscalAction(sub.status)
        : "cancel_pending"
      : "none";

    await tx.revenueEntry.update({
      where: { id: row.id },
      data: { status: RevenueStatus.VOID, grossAmount: 0, netAmount: 0 },
    });

    if (!doc) continue;

    if (action === "return_already_rejected" || action === "none") {
      continue;
    }

    if (action === "cancel_pending") {
      await cancelPendingFiscalDocument(tx, doc.id);
      continue;
    }

    const patientId = doc.patientId?.trim();
    if (!patientId) continue;

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