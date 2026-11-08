import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { IntegrationScope, IntegrationWebhookEvent, OperationStatus } from "@prisma/client";
import { activeSchedulingPhysicianWhere } from "../common/active-scheduling-physician";
import { AuditService } from "../audit/audit.service";
import { OperationsService } from "../operations/operations.service";
import { PrismaService } from "../prisma/prisma.service";
import type { IntegrationBookOperationDto } from "./dto/integration-book-operation.dto";
import type { IntegrationPrincipal } from "./integration.types";
import { IntegrationClientService } from "./integration-client.service";
import { IntegrationWebhookService } from "./integration-webhook.service";

@Injectable()
export class IntegrationsOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operations: OperationsService,
    private readonly clientService: IntegrationClientService,
    private readonly audit: AuditService,
    private readonly webhooks: IntegrationWebhookService,
  ) {}

  async listPhysicians(principal: IntegrationPrincipal, clinicId: string) {
    if (!principal.scopes.includes(IntegrationScope.OPERATIONS_READ)) {
      throw new ForbiddenException("OPERATIONS_READ scope required");
    }
    if (!this.clientService.clinicAllowed(principal, clinicId)) {
      throw new ForbiddenException("Clinic not permitted for this integration client");
    }
    const clinic = await this.prisma.clinic.findFirst({
      where: { id: clinicId, tenantId: principal.tenantId },
    });
    if (!clinic) throw new NotFoundException("Clinic not found");

    const rows = await this.prisma.user.findMany({
      where: {
        ...activeSchedulingPhysicianWhere(principal.tenantId),
        OR: [{ employee: { is: null } }, { employee: { is: { clinicId } } }],
      },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true },
      take: 200,
    });
    return { items: rows };
  }

  async listAvailability(
    principal: IntegrationPrincipal,
    clinicId: string,
    clinicianId: string,
    from: string,
    to: string,
  ) {
    if (!principal.scopes.includes(IntegrationScope.OPERATIONS_READ)) {
      throw new ForbiddenException("OPERATIONS_READ scope required");
    }
    if (!this.clientService.clinicAllowed(principal, clinicId)) {
      throw new ForbiddenException("Clinic not permitted for this integration client");
    }
    const start = new Date(from);
    const end = new Date(to);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw new BadRequestException("Invalid from/to range");
    }
    const maxSpan = 31 * 24 * 60 * 60 * 1000;
    if (end.getTime() - start.getTime() > maxSpan) {
      throw new BadRequestException("Availability range cannot exceed 31 days");
    }

    const rows = await this.prisma.operation.findMany({
      where: {
        tenantId: principal.tenantId,
        clinicId,
        clinicianId,
        operationDate: { gte: start, lte: end },
        status: { notIn: [OperationStatus.CANCELLED] },
      },
      orderBy: { operationDate: "asc" },
      select: {
        id: true,
        operationDate: true,
        status: true,
        totalCost: true,
      },
    });

    return {
      clinicId,
      clinicianId,
      from: start.toISOString(),
      to: end.toISOString(),
      busy: rows.map((r) => ({
        operationId: r.id,
        operationDate: r.operationDate.toISOString(),
        status: r.status,
        totalCost: Number(r.totalCost),
      })),
    };
  }

  private async resolvePatientId(tenantId: string, dto: IntegrationBookOperationDto): Promise<string> {
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

  async book(principal: IntegrationPrincipal, dto: IntegrationBookOperationDto) {
    if (!principal.scopes.includes(IntegrationScope.OPERATIONS_WRITE)) {
      throw new ForbiddenException("OPERATIONS_WRITE scope required");
    }
    if (!this.clientService.clinicAllowed(principal, dto.clinicId)) {
      throw new ForbiddenException("Clinic not permitted for this integration client");
    }
    const patientId = await this.resolvePatientId(principal.tenantId, dto);
    const created = await this.operations.createForIntegration(principal.tenantId, {
      clinicId: dto.clinicId,
      patientId,
      clinicianId: dto.clinicianId,
      operationDate: dto.operationDate,
      totalCost: dto.totalCost,
      downPayment: dto.downPayment,
      comments: dto.comments,
      noMedications: dto.noMedications,
      feeCurrency: dto.feeCurrency,
      integrationClientId: principal.id,
      externalReference: dto.externalReference?.trim() || undefined,
    });

    await this.audit.recordIntegration({
      tenantId: principal.tenantId,
      clinicId: dto.clinicId,
      integrationClientId: principal.id,
      integrationClientName: principal.name,
      action: "INTEGRATION_BOOK_OPERATION",
      resourceId: created.id,
      metadata: {
        externalReference: dto.externalReference ?? null,
        patientId,
        clinicianId: dto.clinicianId,
      },
    });

    this.webhooks.emit(principal.id, IntegrationWebhookEvent.OPERATION_BOOKED, {
      operationId: created.id,
      clinicId: created.clinicId,
      patientId: created.patientId,
      clinicianId: created.clinicianId,
      operationDate: created.operationDate,
      status: created.status,
      externalReference: dto.externalReference ?? null,
    });

    return created;
  }

  async getOne(principal: IntegrationPrincipal, operationId: string) {
    const row = await this.operations.getByIdForIntegration(principal.tenantId, operationId, principal.id);
    if (!this.clientService.clinicAllowed(principal, row.clinicId)) {
      throw new ForbiddenException("Clinic not permitted for this integration client");
    }
    return row;
  }

  async cancel(principal: IntegrationPrincipal, operationId: string) {
    if (!principal.scopes.includes(IntegrationScope.OPERATIONS_WRITE)) {
      throw new ForbiddenException("OPERATIONS_WRITE scope required");
    }
    const updated = await this.operations.cancelForIntegration(principal.tenantId, operationId, principal.id);
    await this.audit.recordIntegration({
      tenantId: principal.tenantId,
      clinicId: updated.clinicId,
      integrationClientId: principal.id,
      integrationClientName: principal.name,
      action: "INTEGRATION_CANCEL_OPERATION",
      resourceId: updated.id,
      metadata: {},
    });

    this.webhooks.emit(principal.id, IntegrationWebhookEvent.OPERATION_CANCELLED, {
      operationId: updated.id,
      clinicId: updated.clinicId,
      status: updated.status,
    });

    return updated;
  }
}
