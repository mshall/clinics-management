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

type PendingSaleAdjustOutcome = "pending_cancelled" | "return_queued" | "noop";

/** Lock submission, cancel pending sale (keep fiscal doc), or queue partial/full return (handles submit race). */
async function cancelPendingSaleForRequeue(
  tx: Prisma.TransactionClient,
  saleFiscalDocumentId: string,
  queueReturn: QueueReturnParams,
): Promise<PendingSaleAdjustOutcome> {
  const lockedRows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "FiscalSubmission"
    WHERE "fiscalDocumentId" = ${saleFiscalDocumentId}
    FOR UPDATE
  `;
  if (!lockedRows.length) return "noop";

  const sub = await tx.fiscalSubmission.findFirst({ where: { fiscalDocumentId: saleFiscalDocumentId } });
  if (!sub) return "noop";

  if (sub.status === FiscalSubmissionStatus.PENDING) {
    await tx.fiscalSubmission.update({
      where: { id: sub.id },
      data: {
        status: FiscalSubmissionStatus.CANCELLED,
        errorMessage: "Cancelled before submit (sale amount adjusted)",
        claimedUntil: null,
        claimedBy: null,
        nextRetryAt: null,
      },
    });
    await tx.fiscalDocument.update({
      where: { id: saleFiscalDocumentId },
      data: { revenueEntryId: null },
    });
    return "pending_cancelled";
  }

  if (
    sub.status === FiscalSubmissionStatus.SUBMITTING ||
    sub.status === FiscalSubmissionStatus.SUBMITTED ||
    sub.status === FiscalSubmissionStatus.ACCEPTED
  ) {
    await queueReturnForVoidedRevenue(tx, queueReturn);
    return "return_queued";
  }

  return "noop";
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
    where: { tenantId, status: { in: [RevenueStatus.POSTED, RevenueStatus.RECEIVABLE] }, ...where },
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

    if (row.status === RevenueStatus.RECEIVABLE) {
      await tx.revenueEntry.update({
        where: { id: row.id },
        data: { status: RevenueStatus.VOID, grossAmount: 0, netAmount: 0 },
      });
      continue;
    }

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

export type RequeueFiscalSaleParams = {
  tenantId: string;
  clinicId: string;
  patientId: string;
  description: string;
  currency: string;
  vatPercent?: number;
  clinicTaxRin?: string | null;
  collectionMode?: import("@prisma/client").VisitCollectionMode | null;
  transferChannel?: string | null;
  transferReference?: string | null;
};

/** Lower a collected revenue amount and fix fiscal state (pending sale re-queued; submitted sale gets partial return). */
export async function reducePostedRevenueNetWithFiscal(
  tx: Prisma.TransactionClient,
  tenantId: string,
  revenueEntryId: string,
  newNetAmount: number,
  requeue: RequeueFiscalSaleParams,
  descriptionPrefix: string,
): Promise<void> {
  if (newNetAmount < 0) return;

  const row = await tx.revenueEntry.findFirst({
    where: { id: revenueEntryId, tenantId, status: RevenueStatus.POSTED },
    include: { fiscalDocument: { include: { submission: true } } },
  });
  if (!row) return;

  const oldAmount = Number(row.netAmount);
  if (oldAmount <= 0 || Math.abs(oldAmount - newNetAmount) <= 0.001) return;

  await tx.revenueEntry.update({
    where: { id: row.id },
    data: {
      grossAmount: new Prisma.Decimal(String(newNetAmount)),
      netAmount: new Prisma.Decimal(String(newNetAmount)),
    },
  });

  const doc = row.fiscalDocument;
  if (!doc) return;

  const patientId = doc.patientId?.trim() ?? requeue.patientId;
  if (!patientId) return;

  const returnAmount = oldAmount - newNetAmount;
  if (returnAmount <= 0) return;

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

  const outcome = await cancelPendingSaleForRequeue(tx, doc.id, queueReturn);
  if (outcome === "return_queued" || outcome === "noop") return;

  if (newNetAmount > 0) {
    await queueFiscalDocument(tx, {
      tenantId,
      clinicId: row.clinicId,
      patientId,
      revenueEntryId: row.id,
      totalAmount: newNetAmount,
      currency: row.currency,
      description: requeue.description,
      vatPercent: requeue.vatPercent,
      clinicTaxRin: requeue.clinicTaxRin,
      collectionMode: requeue.collectionMode,
      transferChannel: requeue.transferChannel,
      transferReference: requeue.transferReference,
    });
  }
}
