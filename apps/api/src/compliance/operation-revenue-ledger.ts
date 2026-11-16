import { Prisma, RevenueStatus } from "@prisma/client";

/** Admin correction of legacy OPERATION contract row (blocked when fiscal receipts exist). */
export async function syncPostedOperationContractRevenue(
  tx: Prisma.TransactionClient,
  tenantId: string,
  operationId: string,
  data: Pick<
    Prisma.RevenueEntryUncheckedUpdateManyInput,
    "clinicId" | "description" | "grossAmount" | "netAmount" | "currency"
  >,
): Promise<void> {
  await tx.revenueEntry.updateMany({
    where: { tenantId, operationId, status: RevenueStatus.POSTED, category: "OPERATION" },
    data,
  });
}