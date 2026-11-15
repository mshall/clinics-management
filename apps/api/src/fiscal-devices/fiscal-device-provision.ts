import {
  FiscalDeviceKind,
  FiscalDeviceStatus,
  type Prisma,
} from "@prisma/client";
import { fiscalProviderKeyForMarket, getFiscalProvider } from "../providers/fiscal/fiscal-provider.registry";
import { formatVirtualSerial } from "./generate-virtual-serial";

export async function countVirtualDevicesForClinic(
  tx: Prisma.TransactionClient,
  tenantId: string,
  clinicId: string,
  providerKey: string,
): Promise<number> {
  return tx.fiscalDevice.count({
    where: { tenantId, clinicId, providerKey, kind: FiscalDeviceKind.VIRTUAL },
  });
}

export async function nextVirtualSerial(
  tx: Prisma.TransactionClient,
  tenantId: string,
  clinicId: string,
  marketCode: string,
  providerKey: string,
): Promise<string> {
  const n = await countVirtualDevicesForClinic(tx, tenantId, clinicId, providerKey);
  return formatVirtualSerial(marketCode, clinicId, n + 1);
}

/** Create default VIRTUAL device when market fiscal provider requires device registration. */
export async function provisionDefaultVirtualFiscalDevice(
  tx: Prisma.TransactionClient,
  tenantId: string,
  clinicId: string,
) {
  const tenant = await tx.tenant.findUnique({
    where: { id: tenantId },
    include: { market: true },
  });
  if (!tenant?.market) return null;
  const providerKey = fiscalProviderKeyForMarket(tenant.market.taxConfig as Record<string, unknown>);
  const provider = getFiscalProvider(providerKey);
  if (!provider?.deviceRegistration?.required) return null;

  const existing = await tx.fiscalDevice.findFirst({
    where: { tenantId, clinicId, providerKey, isDefault: true },
  });
  if (existing) return existing;

  const serial = await nextVirtualSerial(tx, tenantId, clinicId, tenant.market.code, providerKey);
  return tx.fiscalDevice.create({
    data: {
      tenantId,
      clinicId,
      providerKey,
      kind: FiscalDeviceKind.VIRTUAL,
      serialNumber: serial,
      label: "Kiorly virtual POS",
      status: FiscalDeviceStatus.CREDENTIALS_PENDING,
      isDefault: true,
    },
  });
}

export function fiscalProviderRequiresDevices(taxConfig: Record<string, unknown> | null | undefined): boolean {
  const providerKey = fiscalProviderKeyForMarket(taxConfig);
  const provider = getFiscalProvider(providerKey);
  return Boolean(provider?.deviceRegistration?.required);
}