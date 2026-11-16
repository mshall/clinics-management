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
  if (status === FiscalSubmissionStatus.REJECTED || status === FiscalSubmissionStatus.CANCELLED) {
    return "return_already_rejected";
  }
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

type QueueReturnParams = {
  tenantId: string;
  clinicId: string;
  patientId: string;
  amount: number;
  currency: string;
  description: string;
  revenueEntryId: string;
  saleFiscalDocumentId: string;
};

async function queueReturnForVoidedRevenue(tx: Prisma.TransactionClient, p: QueueReturnParams): Promise<void> {
  await queueFiscalDocument(tx, {
    tenantId: p.tenantId,
    clinicId: p.clinicId,
    patientId: p.patientId,
    totalAmount: p.amount,
    currency: p.currency,
    description: p.description,
    returnForRevenueEntryId: p.revenueEntryId,
    returnForFiscalDocumentId: p.saleFiscalDocumentId,
  });
}

/** Lock sale submission and cancel if still PENDING; otherwise queue return (handles submit race). */
async function cancelPendingOrQueueReturn(
  tx: Prisma.TransactionClient,
  saleFiscalDocumentId: string,
  queueReturn: QueueReturnParams,
): Promise<void> {
  const lockedRows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "FiscalSubmission"
    WHERE "fiscalDocumentId" = ${saleFiscalDocumentId}
    FOR UPDATE
  `;
  if (!lockedRows.length) {
    await tx.fiscalDocument.delete({ where: { id: saleFiscalDocumentId } }).catch(() => undefined);
    return;
  }
  const sub = await tx.fiscalSubmission.findFirst({ where: { fiscalDocumentId: saleFiscalDocumentId } });
  if (!sub) return;

  if (sub.status === FiscalSubmissionStatus.PENDING) {
    await tx.fiscalSubmission.update({
      where: { id: sub.id },
      data: {
        status: FiscalSubmissionStatus.CANCELLED,
        errorMessage: "Cancelled before submit (revenue voided)",
        claimedUntil: null,
        claimedBy: null,
        nextRetryAt: null,
      },
    });
    return;
  }

  if (
    sub.status === FiscalSubmissionStatus.SUBMITTING ||
    sub.status === FiscalSubmissionStatus.SUBMITTED ||
    sub.status === FiscalSubmissionStatus.ACCEPTED
  ) {
    await queueReturnForVoidedRevenue(tx, queueReturn);
  }
}

/** Detach revenue from encounter after void; keeps rows for audit (never delete receipted revenue). */
export async function detachRevenueFromEncounter(
  tx: Prisma.TransactionClient,
  tenantId: string,
  encounterId: string,
): Promise<void> {
  await tx.revenueEntry.updateMany({
    where: { tenantId, encounterId },
    data: { encounterId: null },
  });
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
    const action = doc ? (sub ? submissionVoidFiscalAction(sub.status) : "cancel_pending") : "none";

    await tx.revenueEntry.update({
      where: { id: row.id },
      data: { status: RevenueStatus.VOID, grossAmount: 0, netAmount: 0 },
    });

    if (!doc) continue;

    if (action === "return_already_rejected" || action === "none") {
      continue;
    }

    const patientId = doc.patientId?.trim();
    if (!patientId) continue;

    const queueReturn: QueueReturnParams = {
      tenantId,
      clinicId: row.clinicId,
      patientId,
      amount,
      currency: row.currency,
      description: `${descriptionPrefix} · ${row.description ?? row.category}`,
      revenueEntryId: row.id,
      saleFiscalDocumentId: doc.id,
    };

    if (action === "cancel_pending") {
      await cancelPendingOrQueueReturn(tx, doc.id, queueReturn);
      continue;
    }

    await queueReturnForVoidedRevenue(tx, queueReturn);
  }
}

/** Queue a partial ETA return (or cancel pending sale) without voiding the revenue row. */
export async function queuePartialFiscalReturnForPostedRevenue(
  tx: Prisma.TransactionClient,
  tenantId: string,
  revenueEntryId: string,
  returnAmount: number,
  descriptionPrefix: string,
): Promise<void> {
  if (returnAmount <= 0) return;

  const row = await tx.revenueEntry.findFirst({
    where: { id: revenueEntryId, tenantId, status: RevenueStatus.POSTED },
    include: {
      fiscalDocument: { include: { submission: true } },
    },
  });
  if (!row?.fiscalDocument) return;

  const doc = row.fiscalDocument;
  const sub = doc.submission;
  const action = sub ? submissionVoidFiscalAction(sub.status) : "cancel_pending";
  if (action === "return_already_rejected" || action === "none") return;

  const patientId = doc.patientId?.trim();
  if (!patientId) return;

  const queueReturn: QueueReturnParams = {
    tenantId,
    clinicId: row.clinicId,
    patientId,
    amount: returnAmount,
    currency: row.currency,
    description: `${descriptionPrefix} · ${row.description ?? row.category}`,
    revenueEntryId: row.id,
    saleFiscalDocumentId: doc.id,
  };

  if (action === "cancel_pending") {
    await cancelPendingOrQueueReturn(tx, doc.id, queueReturn);
    return;
  }

  await queueReturnForVoidedRevenue(tx, queueReturn);
}