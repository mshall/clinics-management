import { BadRequestException } from "@nestjs/common";
import { Prisma, RevenueStatus } from "@prisma/client";

export async function assertRevenueEntryFiscalMutable(
  tx: Prisma.TransactionClient,
  tenantId: string,
  revenueEntryId: string,
): Promise<void> {
  const entry = await tx.revenueEntry.findFirst({
    where: { id: revenueEntryId, tenantId },
    include: { fiscalDocument: { include: { submission: true } } },
  });
  if (!entry) return;
  if (entry.status !== RevenueStatus.POSTED) return;
  if (Number(entry.netAmount) <= 0) return;
  if (entry.fiscalDocument) {
    throw new BadRequestException(
      "This revenue row has an ETA fiscal document; void it and issue a return receipt instead of editing.",
    );
  }
}

export async function assertOperationRevenuesFiscalMutable(
  tx: Prisma.TransactionClient,
  tenantId: string,
  operationId: string,
): Promise<void> {
  const rows = await tx.revenueEntry.findMany({
    where: { tenantId, operationId, status: RevenueStatus.POSTED },
    include: { fiscalDocument: true },
  });
  for (const row of rows) {
    if (row.fiscalDocument && Number(row.netAmount) > 0) {
      throw new BadRequestException(
        "Operation has posted revenue with fiscal receipts; use payments/void+return instead of editing totals directly.",
      );
    }
  }
}