import { FiscalDeviceStatus, type Prisma } from "@prisma/client";

/** Default ACTIVE device, else default flag, else first CREDENTIALS_PENDING virtual. */
export async function resolveFiscalDeviceForQueue(
  tx: Prisma.TransactionClient,
  tenantId: string,
  clinicId: string,
  providerKey: string,
) {
  const active = await tx.fiscalDevice.findFirst({
    where: {
      tenantId,
      clinicId,
      providerKey,
      status: FiscalDeviceStatus.ACTIVE,
      isDefault: true,
    },
    include: { credential: true },
  });
  if (active) return active;

  const pendingDefault = await tx.fiscalDevice.findFirst({
    where: {
      tenantId,
      clinicId,
      providerKey,
      isDefault: true,
      status: { in: [FiscalDeviceStatus.CREDENTIALS_PENDING, FiscalDeviceStatus.PENDING_REGISTRATION] },
    },
    include: { credential: true },
  });
  if (pendingDefault) return pendingDefault;

  return tx.fiscalDevice.findFirst({
    where: { tenantId, clinicId, providerKey, isDefault: true },
    include: { credential: true },
  });
}

export async function clinicHasActiveDefaultFiscalDevice(
  prisma: { fiscalDevice: Prisma.TransactionClient["fiscalDevice"] },
  tenantId: string,
  clinicId: string,
  providerKey: string,
): Promise<boolean> {
  const row = await prisma.fiscalDevice.findFirst({
    where: {
      tenantId,
      clinicId,
      providerKey,
      isDefault: true,
      status: FiscalDeviceStatus.ACTIVE,
      credentialId: { not: null },
    },
    select: { id: true },
  });
  return Boolean(row);
}