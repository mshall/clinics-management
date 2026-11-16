import { IntegrationFailureCategory, type Prisma } from "@prisma/client";

export async function logFiscalQueueSkipped(
  tx: Prisma.TransactionClient,
  params: { tenantId: string; clinicId: string; reason: string; operation: string },
): Promise<void> {
  await tx.integrationFailureLog.create({
    data: {
      tenantId: params.tenantId,
      clinicId: params.clinicId,
      category: IntegrationFailureCategory.FISCAL,
      operation: params.operation,
      operationName: "ETA receipt not queued",
      statusCode: 0,
      errorMessage: params.reason.slice(0, 2000),
      trace: { skipped: true, reason: params.reason },
    },
  });
}