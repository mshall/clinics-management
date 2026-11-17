import type { Prisma } from "@prisma/client";

type Db = { tenant: Prisma.TenantDelegate };

/** Anchor platform/market audits on the oldest tenant in that market (AuditLog.tenantId is required). */
export async function firstTenantIdInMarket(db: Db, marketId: string): Promise<string | null> {
  const row = await db.tenant.findFirst({
    where: { marketId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return row?.id ?? null;
}