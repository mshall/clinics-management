import type { PrismaClient } from "@prisma/client";

/**
 * Tenant storage byte gauge (Phase 2 precursor).
 * Adjust by delta after upload (+), reduce (−), delete (−), or orig/ keep (+).
 * Never logs paths or file contents.
 */
export async function adjustTenantStorageBytes(
  prisma: PrismaClient,
  tenantId: string,
  deltaBytes: number,
): Promise<void> {
  if (!deltaBytes || !Number.isFinite(deltaBytes)) return;
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { storageBytesUsed: { increment: BigInt(Math.trunc(deltaBytes)) } },
  });
}
