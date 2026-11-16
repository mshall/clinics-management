import { IntegrationFailureCategory, type Prisma } from "@prisma/client";

/** Best-effort audit row — must not fail revenue/check-in transactions. */
export async function logFiscalQueueSkipped(
  tx: Prisma.TransactionClient,
  params: { tenantId: string; clinicId: string; reason: string; operation: string },
): Promise<void> {
  try {
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
  } catch {
    try {
      await tx.integrationFailureLog.create({
        data: {
          tenantId: params.tenantId,
          clinicId: params.clinicId,
          category: IntegrationFailureCategory.WEBHOOK,
          operation: params.operation,
          operationName: "ETA receipt not queued",
          statusCode: 0,
          errorMessage: params.reason.slice(0, 2000),
          trace: { skipped: true, reason: params.reason, fiscalCategoryFallback: true },
        },
      });
    } catch {
      // Observability only — never block check-in or billing.
    }
  }
}