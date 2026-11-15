import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  fiscalProviderRequiresDevices,
  provisionDefaultVirtualFiscalDevice,
} from "./fiscal-device-provision";

/**
 * Nest façade for clinic onboarding — other contexts inject this instead of importing provision helpers.
 */
@Injectable()
export class FiscalDeviceProvisioningService {
  requiresDevices(taxConfig: Record<string, unknown> | null | undefined): boolean {
    return fiscalProviderRequiresDevices(taxConfig);
  }

  provisionDefaultVirtual(
    tx: Prisma.TransactionClient,
    tenantId: string,
    clinicId: string,
  ) {
    return provisionDefaultVirtualFiscalDevice(tx, tenantId, clinicId);
  }
}