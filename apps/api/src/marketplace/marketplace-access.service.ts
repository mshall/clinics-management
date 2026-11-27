import { ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
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

  /** New holds/bookings need a LIVE listing — PAUSED (owner or billing) stays readable but not bookable. */
  async assertListingBookable(clinicId: string, clinicianId: string): Promise<void> {
    const row = await this.prisma.marketplaceListing.findFirst({
      where: { clinicId, clinicianId, status: ListingStatus.LIVE },
      select: { id: true },
    });
    if (!row) {
      throw new ForbiddenException({
        code: "MARKETPLACE_LISTING_PAUSED",
        message: "This clinician is not accepting Kiorex bookings right now",
      });
    }
  }

  /**
   * Founder decision A (27 Nov 2026): an organisation belongs to its country market for life and a Kiorex booking may only associate a patient
   * with a provider of the SAME market. Kiorex sends the market it resolved for the provider; a different one is refused (409 CROSS_MARKET_BOOKING).
   * Absent (older Kiorex) = no check, so existing callers keep working.
   */
  async assertSameMarket(tenantId: string, requestedMarket: unknown): Promise<void> {
    if (requestedMarket === undefined || requestedMarket === null || requestedMarket === "") return;
    const wanted = typeof requestedMarket === "string" ? requestedMarket.trim().toUpperCase() : "";
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { market: { select: { code: true } } } });
    const actual = tenant?.market?.code?.trim().toUpperCase() ?? "";
    if (!/^[A-Z]{2}$/.test(wanted) || (/^[A-Z]{2}$/.test(actual) && wanted !== actual)) {
      throw new ConflictException({
        code: "CROSS_MARKET_BOOKING",
        message: "This provider belongs to another country market; a booking cannot cross markets",
      });
    }
  }
}
