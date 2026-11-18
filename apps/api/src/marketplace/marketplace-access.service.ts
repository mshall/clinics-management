import { ForbiddenException, Injectable } from "@nestjs/common";
import { ListingStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class MarketplaceAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** KX-01: marketplace reads require a LIVE or PAUSED listing for the clinic (and clinician when provided). */
  async resolveTenantForMarketplaceClinic(clinicId: string, clinicianId?: string): Promise<string> {
    const row = await this.prisma.marketplaceListing.findFirst({
      where: {
        clinicId,
        status: { in: [ListingStatus.LIVE, ListingStatus.PAUSED] },
        ...(clinicianId ? { clinicianId } : {}),
      },
      select: { tenantId: true },
    });
    if (!row) {
      throw new ForbiddenException({
        code: "MARKETPLACE_LISTING_REQUIRED",
        message: "No LIVE or PAUSED marketplace listing for this clinic",
      });
    }
    return row.tenantId;
  }
}