import { BadRequestException, Injectable, Optional } from "@nestjs/common";
import { IntegrationScope } from "@prisma/client";
import { IntegrationsAppointmentsService } from "../integrations/integrations-appointments.service";
import type { IntegrationPrincipal } from "../integrations/integration.types";
import type { IntegrationBookAppointmentDto } from "../integrations/dto/integration-book-appointment.dto";
import type { PlatformIntegrationPrincipal } from "./platform-integration-client.service";
import { MarketplaceAccessService } from "./marketplace-access.service";
import { MarketplaceListingService } from "./marketplace-listing.service";
import { PrismaService } from "../prisma/prisma.service";
import { ListingStatus } from "@prisma/client";
import { SlotService } from "../scheduling/slot.service";
import { SLOT_CHANNEL } from "../scheduling/slot-channel";
import { HomeVisitService } from "../home-visits/home-visit.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { filterTelehealthSlots, telehealthOfferedBy } from "../telehealth/telehealth-availability";

@Injectable()
export class MarketplaceApiService {
  constructor(
    private readonly integrations: IntegrationsAppointmentsService,
    private readonly access: MarketplaceAccessService,
    private readonly listings: MarketplaceListingService,
    private readonly prisma: PrismaService,
    private readonly slots: SlotService,
    @Optional() private readonly homeVisits?: HomeVisitService,
    @Optional() private readonly flags?: FeatureFlagsService,
    @Optional() private readonly entitlements?: EntitlementsService,
  ) {}

  verify(client: PlatformIntegrationPrincipal) {
    return {
      ok: true,
      clientKey: client.clientKey,
      name: client.name,
      scopes: client.scopes,
    };
  }

  async listClinics() {
    return this.listings.listMarketplaceClinics();
  }

  async listPhysicians(client: PlatformIntegrationPrincipal, clinicId: string) {
    const tenantId = await this.access.resolveTenantForMarketplaceClinic(clinicId);
    const listed = await this.prisma.marketplaceListing.findMany({
      where: {
        clinicId,
        tenantId,
        status: { in: [ListingStatus.LIVE, ListingStatus.PAUSED] },
      },
      select: { clinicianId: true },
    });
    const allowedIds = new Set(listed.map((r) => r.clinicianId));
    const principal = this.principalFor(tenantId, clinicId, client);
    const result = await this.integrations.listPhysicians(principal, clinicId);
    return {
      items: result.items.filter((p) => allowedIds.has(p.id)),
    };
  }

  async availability(
    client: PlatformIntegrationPrincipal,
    clinicId: string,
    clinicianId: string,
    typeId: string,
    from: string,
    to: string,
  ) {
    const tenantId = await this.access.resolveTenantForMarketplaceClinic(clinicId, clinicianId);
    return this.slots.getSlots({
      tenantId,
      clinicId,
      clinicianId,
      typeId,
      from: new Date(from),
      to: new Date(to),
      channel: SLOT_CHANNEL.MARKETPLACE,
    });
  }

  async listSlots(
    client: PlatformIntegrationPrincipal,
    clinicId: string,
    clinicianId: string,
    typeId: string,
    from: string,
    to: string,
    extra: { serviceLocation?: string; district?: string; lat?: string; lng?: string } = {},
  ) {
    const base = await this.availability(client, clinicId, clinicianId, typeId, from, to);
    const requested = extra.serviceLocation?.trim().toUpperCase();
    if (requested && requested !== "HOME" && requested !== "IN_CLINIC" && requested !== "VIDEO") throw new BadRequestException("serviceLocation must be IN_CLINIC, HOME or VIDEO");
    const type = await this.prisma.appointmentType.findFirst({ where: { id: typeId, clinicId }, select: { serviceLocation: true, tenantId: true } });
    const typeIsHome = type?.serviceLocation === "HOME";
    // ADR-039: VIDEO slots exist only while telehealth.video + entitlement are on and the doctor offers it; telehealth-only windows narrow them.
    if (type?.serviceLocation === "VIDEO") {
      if (requested && requested !== "VIDEO") throw new BadRequestException("This visit type is a telehealth visit type");
      const offered = await telehealthOfferedBy({ prisma: this.prisma as never, flags: this.flags, entitlements: this.entitlements }, type.tenantId, clinicianId);
      const slots = offered ? await filterTelehealthSlots(this.prisma as never, type.tenantId, clinicId, clinicianId, base.slots) : [];
      return { ...base, serviceLocation: "VIDEO" as const, slots: slots.map((s) => ({ ...s, serviceLocation: "VIDEO" as const, district: null })) };
    }
    if (requested === "VIDEO") throw new BadRequestException("This visit type is not a telehealth visit type");
    // KX-09 §03: HOME slots need a district; coverage is checked (422 OUT_OF_COVERAGE) and each slot carries serviceLocation + district.
    if (requested === "HOME" || typeIsHome) {
      if (requested && requested !== "HOME") throw new BadRequestException("This visit type is a home visit type");
      if (!typeIsHome) throw new BadRequestException("This visit type is not a home visit type");
      if (!extra.district?.trim()) throw new BadRequestException({ code: "DISTRICT_REQUIRED", message: "district is required for HOME slots" });
      if (!this.homeVisits) throw new BadRequestException("Home visits are not available");
      const slots = await this.homeVisits.filterHomeSlots({ tenantId: type!.tenantId, clinicId, clinicianId, district: extra.district, slots: base.slots });
      return { ...base, serviceLocation: "HOME" as const, district: extra.district.trim().toLowerCase(), slots };
    }
    return { ...base, slots: base.slots.map((s) => ({ ...s, serviceLocation: "IN_CLINIC" as const, district: null })) };
  }

  async book(client: PlatformIntegrationPrincipal, clinicId: string, body: IntegrationBookAppointmentDto) {
    const tenantId = await this.access.resolveTenantForMarketplaceClinic(clinicId, body.clinicianId);
    if (body.clinicianId) await this.access.assertListingBookable(clinicId, body.clinicianId);
    const principal = this.principalFor(tenantId, clinicId, client);
    return this.integrations.book(principal, {
      ...body,
      clinicId,
      marketplaceConsentGranted: true,
      kiorexChannel: "marketplace",
    });
  }

  async getAppointment(client: PlatformIntegrationPrincipal, clinicId: string, appointmentId: string) {
    const tenantId = await this.access.resolveTenantForMarketplaceClinic(clinicId);
    const principal = this.principalFor(tenantId, clinicId, client);
    return this.integrations.getOne(principal, appointmentId);
  }

  async cancelAppointment(client: PlatformIntegrationPrincipal, clinicId: string, appointmentId: string) {
    const tenantId = await this.access.resolveTenantForMarketplaceClinic(clinicId);
    const principal = this.principalFor(tenantId, clinicId, client);
    return this.integrations.cancel(principal, appointmentId);
  }

  private principalFor(
    tenantId: string,
    clinicId: string,
    client: PlatformIntegrationPrincipal,
  ): IntegrationPrincipal {
    return {
      id: client.id,
      clientKey: client.clientKey,
      tenantId,
      name: client.name,
      scopes: [IntegrationScope.APPOINTMENTS_READ, IntegrationScope.APPOINTMENTS_WRITE],
      allowedClinicIds: [clinicId],
    };
  }
}
