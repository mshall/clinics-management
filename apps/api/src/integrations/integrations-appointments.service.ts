import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ClinicRecordStatus, IntegrationScope, IntegrationWebhookEvent, Prisma } from "@prisma/client";
import { activeSchedulingPhysicianWhere } from "../common/active-scheduling-physician";
import { AuditService } from "../audit/audit.service";
import { AppointmentsService } from "../appointments/appointments.service";
import { PrismaService } from "../prisma/prisma.service";
import type { IntegrationBookAppointmentDto } from "./dto/integration-book-appointment.dto";
import type { IntegrationPrincipal } from "./integration.types";
import { IntegrationClientService } from "./integration-client.service";
import { IntegrationWebhookService } from "./integration-webhook.service";
import { ConsentPolicyService } from "../compliance/consent-policy.service";
import { CONSENT_PURPOSE_MARKETPLACE } from "../compliance/consent-policy.constants";
import { defaultBookingSourceForIntegration } from "../appointments/booking-attribution";
import { SlotService } from "../scheduling/slot.service";
import { SLOT_CHANNEL } from "../scheduling/slot-channel";

@Injectable()
export class IntegrationsAppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appointments: AppointmentsService,
    private readonly slots: SlotService,
    private readonly clientService: IntegrationClientService,
    private readonly audit: AuditService,
    private readonly webhooks: IntegrationWebhookService,
    private readonly consent: ConsentPolicyService,
  ) {}

  async listClinics(principal: IntegrationPrincipal) {
    const where: Prisma.ClinicWhereInput = {
      tenantId: principal.tenantId,
      recordStatus: ClinicRecordStatus.ACTIVE,
      ...(principal.allowedClinicIds.length ? { id: { in: principal.allowedClinicIds } } : {}),
    };
    const rows = await this.prisma.clinic.findMany({
      where,
      orderBy: { nameEn: "asc" },
      select: {
        id: true,
        nameEn: true,
        nameAr: true,
        openingTime: true,
        closingTime: true,
        defaultCurrency: true,
      },
    });
    return { items: rows };
  }

  async listPhysicians(principal: IntegrationPrincipal, clinicId: string) {
    if (!this.clientService.clinicAllowed(principal, clinicId)) {
      throw new ForbiddenException("Clinic not permitted for this integration client");
    }
    const clinic = await this.prisma.clinic.findFirst({
      where: { id: clinicId, tenantId: principal.tenantId, recordStatus: ClinicRecordStatus.ACTIVE },
    });
    if (!clinic) throw new NotFoundException("Clinic not found");

    const rows = await this.prisma.user.findMany({
      where: {
        ...activeSchedulingPhysicianWhere(principal.tenantId),
        OR: [{ employee: { is: null } }, { employee: { is: { clinicId } } }],
      },
      orderBy: { displayName: "asc" },
      select: {
        id: true,
        displayName: true,
        employee: { select: { firstNameEn: true, lastNameEn: true, firstNameAr: true, lastNameAr: true } },
      },
      take: 200,
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        displayName: r.displayName,
        firstNameEn: r.employee?.firstNameEn ?? null,
        lastNameEn: r.employee?.lastNameEn ?? null,
      })),
    };
  }

  async listAvailability(
    principal: IntegrationPrincipal,
    clinicId: string,
    clinicianId: string,
    typeId: string,
    from: string,
    to: string,
    channel: "INTERNAL" | "MARKETPLACE" = "INTERNAL",
  ) {
    if (!principal.scopes.includes(IntegrationScope.APPOINTMENTS_READ)) {
      throw new ForbiddenException("APPOINTMENTS_READ scope required");
    }
    if (!this.clientService.clinicAllowed(principal, clinicId)) {
      throw new ForbiddenException("Clinic not permitted for this integration client");
    }
    if (!typeId?.trim()) throw new BadRequestException("typeId is required");
    return this.slots.getSlots({
      tenantId: principal.tenantId,
      clinicId,
      clinicianId,
      typeId: typeId.trim(),
      from: new Date(from),
      to: new Date(to),
      channel: channel === "MARKETPLACE" ? SLOT_CHANNEL.MARKETPLACE : SLOT_CHANNEL.INTERNAL,
    });
  }

  private async resolvePatientId(tenantId: string, dto: IntegrationBookAppointmentDto): Promise<string> {
    if (dto.patientId) {
      const p = await this.prisma.patient.findFirst({
        where: { id: dto.patientId.trim(), tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!p) throw new BadRequestException("Patient not found");
      return p.id;
    }
    const mrn = dto.patientMrn?.trim();
    if (!mrn) throw new BadRequestException("patientId or patientMrn is required");
    const p = await this.prisma.patient.findFirst({
      where: { tenantId, mrn, deletedAt: null },
      select: { id: true },
    });
    if (!p) throw new BadRequestException("Patient not found for MRN");
    return p.id;
  }

  async book(principal: IntegrationPrincipal, dto: IntegrationBookAppointmentDto) {
    if (!this.clientService.clinicAllowed(principal, dto.clinicId)) {
      throw new ForbiddenException("Clinic not permitted for this integration client");
    }
    const patientId = await this.resolvePatientId(principal.tenantId, dto);
    if (dto.marketplaceConsentGranted) {
      await this.consent.capture(principal.tenantId, patientId, CONSENT_PURPOSE_MARKETPLACE, {
        granted: true,
        source: "kiorex_booking",
      });
    }
    await this.consent.require(principal.tenantId, patientId, CONSENT_PURPOSE_MARKETPLACE);
    const bookingSource = defaultBookingSourceForIntegration({
      marketplaceConsentGranted: dto.marketplaceConsentGranted,
      kiorexChannel: dto.kiorexChannel,
    });
    const marketplacePlatform = principal.clientKey.startsWith("ic_plt_");
    const created = await this.appointments.createForIntegration(principal.tenantId, {
      clinicId: dto.clinicId,
      patientId,
      clinicianId: dto.clinicianId,
      startsAt: dto.startsAt,
      endsAt: dto.endsAt,
      confirmOverlap: dto.confirmOverlap,
      notes: dto.notes,
      integrationClientId: marketplacePlatform ? null : principal.id,
      externalReference: dto.externalReference?.trim() || undefined,
      bookingSource,
      attributionJson: dto.attribution ?? undefined,
    });

    await this.audit.recordIntegration({
      tenantId: principal.tenantId,
      clinicId: dto.clinicId,
      integrationClientId: principal.id,
      integrationClientName: principal.name,
      action: "INTEGRATION_BOOK_APPOINTMENT",
      resourceId: created.id,
      metadata: {
        externalReference: dto.externalReference ?? null,
        patientId,
        clinicianId: dto.clinicianId,
      },
    });

    this.webhooks.emit(principal.id, IntegrationWebhookEvent.APPOINTMENT_BOOKED, {
      appointmentId: created.id,
      clinicId: created.clinicId,
      patientId: created.patientId,
      clinicianId: created.clinicianId,
      startsAt: created.startsAt,
      endsAt: created.endsAt ?? null,
      status: created.status,
      externalReference: dto.externalReference ?? null,
    });

    return created;
  }

  async getOne(principal: IntegrationPrincipal, appointmentId: string) {
    const marketplacePlatform = principal.clientKey.startsWith("ic_plt_");
    const row = await this.appointments.getByIdForIntegration(
      principal.tenantId,
      appointmentId,
      marketplacePlatform ? null : principal.id,
    );
    if (!this.clientService.clinicAllowed(principal, row.clinicId)) {
      throw new ForbiddenException("Clinic not permitted for this integration client");
    }
    return row;
  }

  async cancel(principal: IntegrationPrincipal, appointmentId: string) {
    const marketplacePlatform = principal.clientKey.startsWith("ic_plt_");
    const updated = await this.appointments.cancelForIntegration(
      principal.tenantId,
      appointmentId,
      marketplacePlatform ? null : principal.id,
    );
    await this.audit.recordIntegration({
      tenantId: principal.tenantId,
      clinicId: updated.clinicId,
      integrationClientId: principal.id,
      integrationClientName: principal.name,
      action: "INTEGRATION_CANCEL_APPOINTMENT",
      resourceId: updated.id,
      metadata: { patientId: updated.patientId },
    });

    this.webhooks.emit(principal.id, IntegrationWebhookEvent.APPOINTMENT_CANCELLED, {
      appointmentId: updated.id,
      clinicId: updated.clinicId,
      status: updated.status,
    });

    return updated;
  }
}
