import { Prisma, RevenueStatus } from "@prisma/client";

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

/** Void posted/receivable revenue rows (FD-02: no fiscal unwind). */
export async function voidPostedRevenues(
  tx: Prisma.TransactionClient,
  tenantId: string,
  where: Prisma.RevenueEntryWhereInput,
): Promise<void> {
  const rows = await tx.revenueEntry.findMany({
    where: { tenantId, status: { in: [RevenueStatus.POSTED, RevenueStatus.RECEIVABLE] }, ...where },
  });

  for (const row of rows) {
    const amount = Number(row.netAmount);
    if (amount <= 0 && row.status !== RevenueStatus.RECEIVABLE) continue;

    await tx.revenueEntry.update({
      where: { id: row.id },
      data: { status: RevenueStatus.VOID, grossAmount: 0, netAmount: 0 },
    });
  }
}

/** @deprecated alias — description prefix ignored (FD-02). */
export async function voidPostedRevenuesWithFiscalReturns(
  tx: Prisma.TransactionClient,
  tenantId: string,
  where: Prisma.RevenueEntryWhereInput,
  _descriptionPrefix?: string,
): Promise<void> {
  return voidPostedRevenues(tx, tenantId, where);
}

export type AdjustRevenueNetParams = {
  description?: string;
};

/** Lower a collected revenue amount (FD-02: revenue ledger only). */
export async function reducePostedRevenueNet(
  tx: Prisma.TransactionClient,
  tenantId: string,
  revenueEntryId: string,
  newNetAmount: number,
  _requeue?: unknown,
  _descriptionPrefix?: string,
): Promise<void> {
  if (newNetAmount < 0) return;

  const row = await tx.revenueEntry.findFirst({
    where: { id: revenueEntryId, tenantId, status: RevenueStatus.POSTED },
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
}

/** @deprecated alias — requeue payload ignored (FD-02). */
export async function reducePostedRevenueNetWithFiscal(
  tx: Prisma.TransactionClient,
  tenantId: string,
  revenueEntryId: string,
  newNetAmount: number,
  _requeue?: unknown,
  _descriptionPrefix?: string,
): Promise<void> {
  return reducePostedRevenueNet(tx, tenantId, revenueEntryId, newNetAmount);
}