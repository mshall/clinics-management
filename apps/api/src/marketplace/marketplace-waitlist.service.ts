import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AppointmentWaitlistStatus, WaitlistOfferStatus } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { CONSENT_PURPOSE_MARKETPLACE } from "../compliance/consent-policy.constants";
import { ConsentPolicyService } from "../compliance/consent-policy.service";
import { KIOREX_WAITLIST_SOURCE, WaitlistAutofillService } from "../messaging/waitlist-autofill.service";
import { PrismaService } from "../prisma/prisma.service";
import { MarketplaceAccessService } from "./marketplace-access.service";
import { MarketplacePatientIntakeService, type MarketplacePatientInput } from "./marketplace-patient-intake.service";
import type { PlatformIntegrationPrincipal } from "./platform-integration-client.service";

export type MarketplaceWaitlistJoinBody = {
  /** Kiorex waitlist reference (idempotency key). */
  externalRef: string;
  clinicId: string;
  clinicianId?: string;
  typeId?: string;
  preferredFrom?: string;
  preferredTo?: string;
  patient: MarketplacePatientInput;
  notes?: string;
  marketplaceConsentGranted?: boolean;
};

type EntryRow = {
  id: string;
  externalRef: string | null;
  status: AppointmentWaitlistStatus;
  clinicId: string;
  clinicianId: string | null;
  appointmentTypeId: string | null;
  preferredFrom: Date | null;
  preferredTo: Date | null;
  offeredSlotAt: Date | null;
  createdAt: Date;
};

/** Kiorex <-> Kiorly waitlist: join / leave / read, plus accept / decline of the offers Kiorly emits (WAITLIST_OFFER). */
@Injectable()
export class MarketplaceWaitlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MarketplaceAccessService,
    private readonly patients: MarketplacePatientIntakeService,
    private readonly consent: ConsentPolicyService,
    private readonly audit: AuditService,
    private readonly autofill: WaitlistAutofillService,
  ) {}

  async join(client: PlatformIntegrationPrincipal, body: MarketplaceWaitlistJoinBody) {
    const ref = body?.externalRef?.trim();
    if (!ref) throw new BadRequestException("externalRef is required");
    if (!body.clinicId) throw new BadRequestException("clinicId is required");
    const existing = await this.prisma.appointmentWaitlistEntry.findUnique({ where: { externalRef: ref } });
    if (existing) {
      if (existing.platformIntegrationClientId && existing.platformIntegrationClientId !== client.id) {
        throw new NotFoundException("Waitlist entry not found");
      }
      return this.serialize(existing);
    }

    const tenantId = await this.access.resolveTenantForMarketplaceClinic(body.clinicId, body.clinicianId);
    if (body.clinicianId) {
      await this.access.assertListingBookable(body.clinicId, body.clinicianId);
    } else {
      const live = await this.prisma.marketplaceListing.findFirst({
        where: { clinicId: body.clinicId, status: "LIVE" },
        select: { id: true },
      });
      if (!live) throw new BadRequestException("This clinic is not accepting Kiorex bookings right now");
    }
    if (body.typeId) {
      const type = await this.prisma.appointmentType.findFirst({
        where: { id: body.typeId, tenantId, isActive: true, marketplaceBookable: true, OR: [{ clinicId: body.clinicId }, { clinicId: null }] },
        select: { id: true },
      });
      if (!type) throw new BadRequestException("Invalid marketplace appointment type");
    }
    const from = body.preferredFrom ? new Date(body.preferredFrom) : null;
    const to = body.preferredTo ? new Date(body.preferredTo) : null;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime())) || (from && to && to <= from)) {
      throw new BadRequestException("Invalid preferredFrom/preferredTo");
    }

    const patientId = await this.patients.resolveOrCreate(tenantId, body.clinicId, body.patient);
    if (body.marketplaceConsentGranted !== false) {
      await this.consent.capture(tenantId, patientId, CONSENT_PURPOSE_MARKETPLACE, { granted: true, source: "kiorex_waitlist" });
    }
    await this.consent.require(tenantId, patientId, CONSENT_PURPOSE_MARKETPLACE);

    const row = await this.prisma.appointmentWaitlistEntry.create({
      data: {
        tenantId,
        clinicId: body.clinicId,
        patientId,
        clinicianId: body.clinicianId ?? null,
        appointmentTypeId: body.typeId ?? null,
        preferredFrom: from,
        preferredTo: to,
        notes: body.notes?.trim() || null,
        source: KIOREX_WAITLIST_SOURCE,
        externalRef: ref,
        platformIntegrationClientId: client.id,
      },
    });
    await this.audit.recordEvent({
      tenantId,
      actorId: null,
      clinicId: body.clinicId,
      action: "marketplace.waitlist.joined",
      resource: "AppointmentWaitlistEntry",
      resourceId: row.id,
      metadata: { externalRef: ref, platformClientId: client.id },
    });
    return this.serialize(row);
  }

  async get(client: PlatformIntegrationPrincipal, externalRef: string) {
    return this.serialize(await this.own(client, externalRef));
  }

  /** Idempotent: leaving twice (or after booking) is a no-op returning the current state. Pending offers are withdrawn. */
  async leave(client: PlatformIntegrationPrincipal, externalRef: string) {
    const entry = await this.own(client, externalRef);
    if (entry.status === AppointmentWaitlistStatus.CANCELLED || entry.status === AppointmentWaitlistStatus.BOOKED) {
      return this.serialize(entry);
    }
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.waitlistSlotOffer.updateMany({
        where: { waitlistEntryId: entry.id, status: WaitlistOfferStatus.PENDING },
        data: { status: WaitlistOfferStatus.WITHDRAWN, activeSlotId: null, respondedAt: now, skipReason: "PATIENT_LEFT" },
      });
      return tx.appointmentWaitlistEntry.update({
        where: { id: entry.id },
        data: { status: AppointmentWaitlistStatus.CANCELLED, offeredSlotAt: null },
      });
    });
    await this.audit.recordEvent({
      tenantId: entry.tenantId,
      actorId: null,
      clinicId: entry.clinicId,
      action: "marketplace.waitlist.left",
      resource: "AppointmentWaitlistEntry",
      resourceId: entry.id,
      metadata: { externalRef: entry.externalRef, platformClientId: client.id },
    });
    return this.serialize(updated);
  }

  async acceptOffer(client: PlatformIntegrationPrincipal, offerId: string) {
    await this.assertOfferOwned(client, offerId);
    const res = await this.autofill.respondToOffer(offerId, "waitlist_accept", new Date(), { kiorexClientId: client.id });
    return { offerId, outcome: res.outcome ?? "UNAVAILABLE", appointmentId: res.appointmentId ?? null };
  }

  async declineOffer(client: PlatformIntegrationPrincipal, offerId: string) {
    await this.assertOfferOwned(client, offerId);
    const res = await this.autofill.respondToOffer(offerId, "waitlist_decline", new Date(), { kiorexClientId: client.id });
    return { offerId, outcome: res.outcome ?? "UNAVAILABLE", appointmentId: null };
  }

  private async assertOfferOwned(client: PlatformIntegrationPrincipal, offerId: string) {
    const offer = await this.prisma.waitlistSlotOffer.findUnique({
      where: { id: offerId },
      select: { waitlistEntry: { select: { source: true, platformIntegrationClientId: true } } },
    });
    const e = offer?.waitlistEntry;
    if (!e || e.source !== KIOREX_WAITLIST_SOURCE || (e.platformIntegrationClientId && e.platformIntegrationClientId !== client.id)) {
      throw new NotFoundException("Waitlist offer not found");
    }
  }

  private async own(client: PlatformIntegrationPrincipal, externalRef: string) {
    const row = await this.prisma.appointmentWaitlistEntry.findUnique({ where: { externalRef: externalRef.trim() } });
    if (!row || (row.platformIntegrationClientId && row.platformIntegrationClientId !== client.id)) {
      throw new NotFoundException("Waitlist entry not found");
    }
    return row;
  }

  private serialize(r: EntryRow) {
    return {
      externalRef: r.externalRef,
      status: r.status,
      clinicId: r.clinicId,
      clinicianId: r.clinicianId,
      typeId: r.appointmentTypeId,
      preferredFrom: r.preferredFrom?.toISOString() ?? null,
      preferredTo: r.preferredTo?.toISOString() ?? null,
      offeredSlotAt: r.offeredSlotAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
