import { Injectable } from "@nestjs/common";
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

@Injectable()
export class MarketplaceApiService {
  constructor(
    private readonly integrations: IntegrationsAppointmentsService,
    private readonly access: MarketplaceAccessService,
    private readonly listings: MarketplaceListingService,
    private readonly prisma: PrismaService,
    private readonly slots: SlotService,
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
  ) {
    void client;
    return this.availability(client, clinicId, clinicianId, typeId, from, to);
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
