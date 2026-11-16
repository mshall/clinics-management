import { IntegrationFailureCategory, type Prisma } from "@prisma/client";

/** Best-effort audit row — must not abort the surrounding Postgres transaction. */
export async function logFiscalQueueSkipped(
  tx: Prisma.TransactionClient,
  params: { tenantId: string; clinicId: string; reason: string; operation: string },
): Promise<void> {
  const write = async (category: IntegrationFailureCategory) => {
    await tx.integrationFailureLog.create({
      data: {
        tenantId: params.tenantId,
        clinicId: params.clinicId,
        category,
        operation: params.operation,
        operationName: "ETA receipt not queued",
        statusCode: 0,
        errorMessage: params.reason.slice(0, 2000),
        trace: { skipped: true, reason: params.reason },
      },
    });
  };

  try {
    await tx.$executeRaw`SAVEPOINT kiorly_fiscal_skip_log`;
    try {
      await write(IntegrationFailureCategory.FISCAL);
    } catch {
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT kiorly_fiscal_skip_log`;
      await tx.$executeRaw`SAVEPOINT kiorly_fiscal_skip_log`;
      try {
        await write(IntegrationFailureCategory.WEBHOOK);
      } catch {
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT kiorly_fiscal_skip_log`;
      }
    }
    await tx.$executeRaw`RELEASE SAVEPOINT kiorly_fiscal_skip_log`;
  } catch {
    // Observability only — never block check-in or billing.
  }
}