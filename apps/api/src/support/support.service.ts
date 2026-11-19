import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, SupportProductModule, SupportTicketStatus } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { resolveAuditLogCreatedAtFilter } from "../common/audit-log-query-bounds";
import { paginate, parsePageParams } from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";
import { mapResourceToSupportModule, resolveHints } from "./support-resolution-hints";
import type { CreateSupportTicketDto } from "./dto/create-support-ticket.dto";
import type { PatchSupportTicketDto } from "./dto/patch-support-ticket.dto";
import type { CreateSupportTicketEventDto } from "./dto/create-support-ticket-event.dto";
import {
  computeFirstResponseDueAt,
  DEFAULT_SUPPORT_SLA,
  measureFirstResponseSla,
  SUPPORT_MACROS,
  supportMacroById,
} from "./support-sla";

function serializeTicket(row: Awaited<ReturnType<SupportService["findTicket"]>>) {
  if (!row) return null;
  const sla = measureFirstResponseSla({
    createdAt: row.createdAt,
    priority: row.priority,
    firstRespondedAt: row.firstRespondedAt,
  });
  return {
    id: row.id,
    ticketNo: row.ticketNo,
    title: row.title,
    description: row.description,
    module: row.module,
    priority: row.priority,
    status: row.status,
    channel: row.channel,
    sourcePhone: row.sourcePhone,
    clinicId: row.clinicId,
    patientId: row.patientId,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    linkedAuditLogId: row.linkedAuditLogId,
    resolutionNotes: row.resolutionNotes,
    reporterUserId: row.reporterUserId,
    assigneeUserId: row.assigneeUserId,
    reporterDisplayName: row.reporter?.displayName ?? null,
    reporterEmail: row.reporter?.email ?? null,
    assigneeDisplayName: row.assignee?.displayName ?? null,
    assigneeEmail: row.assignee?.email ?? null,
    clinicNameEn: row.clinic?.nameEn ?? null,
    patientMrn: row.patient?.mrn ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    firstRespondedAt: row.firstRespondedAt?.toISOString() ?? null,
    firstResponseDueAt: (row.firstResponseDueAt ?? sla.dueAt).toISOString(),
    escalatedToEngineeringAt: row.escalatedToEngineeringAt?.toISOString() ?? null,
    engineeringEscalationNote: row.engineeringEscalationNote,
    sla: {
      targetHours: sla.targetHours,
      breached: sla.breached,
      responseMinutes: sla.responseMinutes,
      dueAt: sla.dueAt.toISOString(),
    },
    events: row.events?.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      message: e.message,
      metadata: e.metadata === null ? null : (e.metadata as Record<string, unknown>),
      actorDisplayName: e.actor?.displayName ?? null,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  private async nextTicketNo(tx: Prisma.TransactionClient, tenantId: string): Promise<string> {
    const count = await tx.supportTicket.count({ where: { tenantId } });
    const seq = count + 1;
    const year = new Date().getUTCFullYear();
    return `TKT-${year}-${String(seq).padStart(5, "0")}`;
  }

  async listTickets(
    tenantId: string,
    query: {
      page?: string;
      pageSize?: string;
      status?: string;
      module?: string;
      q?: string;
      assigneeUserId?: string;
    },
  ) {
    const { page, pageSize, skip } = parsePageParams(query.page, query.pageSize);
    const q = query.q?.trim() ?? "";
    const where: Prisma.SupportTicketWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status as SupportTicketStatus } : {}),
      ...(query.module ? { module: query.module as Prisma.EnumSupportProductModuleFilter["equals"] } : {}),
      ...(query.assigneeUserId ? { assigneeUserId: query.assigneeUserId } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { ticketNo: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.supportTicket.count({ where }),
      this.prisma.supportTicket.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take: pageSize,
        include: {
          reporter: { select: { displayName: true, email: true } },
          assignee: { select: { displayName: true, email: true } },
          clinic: { select: { nameEn: true } },
          patient: { select: { mrn: true } },
        },
      }),
    ]);
    const items = rows.map((r) => serializeTicket({ ...r, events: [] }));
    return paginate(items.filter(Boolean), total, page, pageSize);
  }

  async findTicket(tenantId: string, id: string) {
    return this.prisma.supportTicket.findFirst({
      where: { id, tenantId },
      include: {
        reporter: { select: { displayName: true, email: true } },
        assignee: { select: { displayName: true, email: true } },
        clinic: { select: { nameEn: true } },
        patient: { select: { mrn: true } },
        events: {
          orderBy: { createdAt: "asc" },
          include: { actor: { select: { displayName: true } } },
        },
      },
    });
  }

  async getTicket(tenantId: string, id: string) {
    const row = await this.findTicket(tenantId, id);
    if (!row) throw new NotFoundException("Support ticket not found");
    return serializeTicket(row);
  }

  listMacros() {
    return SUPPORT_MACROS.map((m) => ({ ...m }));
  }

  async createTicket(tenantId: string, actor: JwtUser, dto: CreateSupportTicketDto) {
    const priority = dto.priority ?? "MEDIUM";
    const now = new Date();
    const dueAt = computeFirstResponseDueAt(now, priority, DEFAULT_SUPPORT_SLA);
    const created = await this.prisma.$transaction(async (tx) => {
      const ticketNo = await this.nextTicketNo(tx, tenantId);
      const ticket = await tx.supportTicket.create({
        data: {
          tenantId,
          ticketNo,
          title: dto.title.trim(),
          description: dto.description.trim(),
          module: dto.module,
          priority,
          channel: "IN_APP",
          clinicId: dto.clinicId ?? null,
          patientId: dto.patientId ?? null,
          assigneeUserId: dto.assigneeUserId ?? actor.userId,
          reporterUserId: actor.userId,
          resourceType: dto.resourceType ?? null,
          resourceId: dto.resourceId ?? null,
          linkedAuditLogId: dto.linkedAuditLogId ?? null,
          firstResponseDueAt: dueAt,
        },
      });
      await tx.supportTicketEvent.create({
        data: {
          ticketId: ticket.id,
          actorUserId: actor.userId,
          eventType: "CREATED",
          message: "Ticket opened",
        },
      });
      return ticket;
    });
    return this.getTicket(tenantId, created.id);
  }

  /**
   * GT-04 — inbound WhatsApp to the Kiorly support line opens a ticket on the matched tenant.
   * Phone is matched to an employee/user; otherwise SUPPORT_FALLBACK_TENANT_ID is used.
   */
  async createFromWhatsAppInbound(input: {
    providerMessageId: string;
    fromPhone: string;
    text: string;
  }): Promise<{ created: boolean; ticketId?: string; tenantId?: string }> {
    const seen = await this.prisma.whatsAppInboundEvent.findUnique({
      where: { providerMessageId: input.providerMessageId },
    });
    if (seen) {
      const meta = seen.payloadJson as { ticketId?: string } | null;
      return { created: false, ticketId: meta?.ticketId, tenantId: seen.tenantId };
    }

    const digits = input.fromPhone.replace(/\D/g, "");
    const tail = digits.slice(-10);
    let tenantId =
      process.env.SUPPORT_FALLBACK_TENANT_ID?.trim() ||
      (await this.prisma.tenant.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }))?.id;
    let reporterUserId: string | null = null;
    if (tail) {
      const employee = await this.prisma.employee.findFirst({
        where: { phone: { endsWith: tail }, userId: { not: null } },
        select: { userId: true, tenantId: true },
      });
      if (employee?.tenantId) {
        tenantId = employee.tenantId;
        reporterUserId = employee.userId;
      }
    }
    if (!tenantId) return { created: false };

    const priority = "URGENT";
    const now = new Date();
    const dueAt = computeFirstResponseDueAt(now, priority, DEFAULT_SUPPORT_SLA);
    const title = `WhatsApp: ${input.text.trim().slice(0, 80) || "Support request"}`;
    const created = await this.prisma.$transaction(async (tx) => {
      const ticketNo = await this.nextTicketNo(tx, tenantId!);
      const ticket = await tx.supportTicket.create({
        data: {
          tenantId: tenantId!,
          ticketNo,
          title,
          description: input.text.trim().slice(0, 8000) || "(empty WhatsApp message)",
          module: "OTHER",
          priority,
          channel: "WHATSAPP",
          sourcePhone: input.fromPhone,
          reporterUserId,
          firstResponseDueAt: dueAt,
        },
      });
      await tx.supportTicketEvent.create({
        data: {
          ticketId: ticket.id,
          actorUserId: reporterUserId,
          eventType: "WHATSAPP_INBOUND",
          message: "Opened from WhatsApp support line",
          metadata: {
            providerMessageId: input.providerMessageId,
            fromPhone: input.fromPhone,
          } as Prisma.InputJsonValue,
        },
      });
      await tx.whatsAppInboundEvent.create({
        data: {
          tenantId: tenantId!,
          providerMessageId: input.providerMessageId,
          action: "support_ticket",
          payloadJson: {
            ticketId: ticket.id,
            fromPhone: input.fromPhone,
            text: input.text.slice(0, 500),
          } as Prisma.InputJsonValue,
        },
      });
      return ticket;
    });
    return { created: true, ticketId: created.id, tenantId };
  }

  async patchTicket(tenantId: string, actor: JwtUser, id: string, dto: PatchSupportTicketDto) {
    const existing = await this.prisma.supportTicket.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException("Support ticket not found");

    const data: Prisma.SupportTicketUpdateInput = {};
    const events: { eventType: string; message: string }[] = [];

    if (dto.status !== undefined) {
      data.status = dto.status;
      if (dto.status === "RESOLVED" || dto.status === "CLOSED") {
        data.resolvedAt = new Date();
      }
      events.push({ eventType: "STATUS_CHANGE", message: `Status → ${dto.status}` });
    }
    if (dto.priority !== undefined) {
      data.priority = dto.priority;
      events.push({ eventType: "PRIORITY_CHANGE", message: `Priority → ${dto.priority}` });
    }
    if (dto.assigneeUserId !== undefined) {
      data.assignee = dto.assigneeUserId ? { connect: { id: dto.assigneeUserId } } : { disconnect: true };
      events.push({ eventType: "ASSIGN", message: dto.assigneeUserId ? "Assignee updated" : "Assignee cleared" });
    }
    if (dto.resolutionNotes !== undefined) {
      data.resolutionNotes = dto.resolutionNotes;
      events.push({ eventType: "RESOLUTION_NOTE", message: "Resolution notes updated" });
    }

    if (!Object.keys(data).length) throw new BadRequestException("No changes");

    await this.prisma.$transaction(async (tx) => {
      await tx.supportTicket.update({ where: { id }, data });
      for (const ev of events) {
        await tx.supportTicketEvent.create({
          data: { ticketId: id, actorUserId: actor.userId, eventType: ev.eventType, message: ev.message },
        });
      }
    });
    return this.getTicket(tenantId, id);
  }

  async addEvent(tenantId: string, actor: JwtUser, ticketId: string, dto: CreateSupportTicketEventDto) {
    const exists = await this.prisma.supportTicket.findFirst({ where: { id: ticketId, tenantId } });
    if (!exists) throw new NotFoundException("Support ticket not found");
    const eventType = dto.eventType.trim();
    const marksFirstResponse =
      !exists.firstRespondedAt &&
      ["COMMENT", "FIRST_RESPONSE", "MACRO", "STATUS_CHANGE"].includes(eventType) &&
      actor.userId !== exists.reporterUserId;
    await this.prisma.$transaction(async (tx) => {
      await tx.supportTicketEvent.create({
        data: {
          ticketId,
          actorUserId: actor.userId,
          eventType,
          message: dto.message?.trim() || null,
        },
      });
      if (marksFirstResponse) {
        await tx.supportTicket.update({
          where: { id: ticketId },
          data: {
            firstRespondedAt: new Date(),
            status: exists.status === "OPEN" ? "IN_PROGRESS" : exists.status,
          },
        });
        await tx.supportTicketEvent.create({
          data: {
            ticketId,
            actorUserId: actor.userId,
            eventType: "FIRST_RESPONSE",
            message: "First response recorded (SLA clock stopped)",
          },
        });
      }
    });
    return this.getTicket(tenantId, ticketId);
  }

  async applyMacro(tenantId: string, actor: JwtUser, ticketId: string, macroId: string) {
    const macro = supportMacroById(macroId);
    if (!macro) throw new BadRequestException("Unknown support macro");
    return this.addEvent(tenantId, actor, ticketId, {
      eventType: "MACRO",
      message: `[${macro.titleEn}] ${macro.bodyEn}`,
    });
  }

  async escalateToEngineering(tenantId: string, actor: JwtUser, ticketId: string, note?: string) {
    const exists = await this.prisma.supportTicket.findFirst({ where: { id: ticketId, tenantId } });
    if (!exists) throw new NotFoundException("Support ticket not found");
    if (exists.escalatedToEngineeringAt) {
      return this.getTicket(tenantId, ticketId);
    }
    const trimmed = note?.trim() || "Escalated to engineering";
    await this.prisma.$transaction(async (tx) => {
      await tx.supportTicket.update({
        where: { id: ticketId },
        data: {
          escalatedToEngineeringAt: new Date(),
          engineeringEscalationNote: trimmed.slice(0, 2000),
          priority: exists.priority === "LOW" || exists.priority === "MEDIUM" ? "HIGH" : exists.priority,
          status: exists.status === "OPEN" ? "IN_PROGRESS" : exists.status,
          firstRespondedAt: exists.firstRespondedAt ?? new Date(),
        },
      });
      await tx.supportTicketEvent.create({
        data: {
          ticketId,
          actorUserId: actor.userId,
          eventType: "ESCALATED_ENGINEERING",
          message: trimmed.slice(0, 2000),
        },
      });
      if (!exists.firstRespondedAt) {
        await tx.supportTicketEvent.create({
          data: {
            ticketId,
            actorUserId: actor.userId,
            eventType: "FIRST_RESPONSE",
            message: "First response recorded via engineering escalation",
          },
        });
      }
    });
    return this.getTicket(tenantId, ticketId);
  }

  async trackingLogs(
    tenantId: string,
    query: {
      page?: string;
      pageSize?: string;
      q?: string;
      action?: string;
      resource?: string;
      actorId?: string;
      from?: string;
      to?: string;
      clinicId?: string;
    },
  ) {
    const { page, pageSize, skip } = parsePageParams(query.page, query.pageSize);
    const q = (query.q?.trim() ?? "").slice(0, 200);
    const createdAt = resolveAuditLogCreatedAtFilter(query.from, query.to);

    const where: Prisma.AuditLogWhereInput = {
      tenantId,
      ...(query.action ? { action: { contains: query.action, mode: "insensitive" } } : {}),
      ...(query.resource ? { resource: { contains: query.resource, mode: "insensitive" } } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.clinicId ? { clinicId: query.clinicId } : {}),
      createdAt,
      ...(q
        ? {
            OR: [
              { action: { contains: q, mode: "insensitive" } },
              { resource: { contains: q, mode: "insensitive" } },
              { resourceId: { contains: q, mode: "insensitive" } },
              { actor: { is: { displayName: { contains: q, mode: "insensitive" } } } },
              { actor: { is: { email: { contains: q, mode: "insensitive" } } } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: { actor: { select: { id: true, displayName: true, email: true, role: true } } },
      }),
    ]);

    const items = rows.map((r) => {
      const hints = resolveHints(r.action, r.resource);
      return {
        id: r.id,
        action: r.action,
        resource: r.resource,
        resourceId: r.resourceId,
        clinicId: r.clinicId,
        createdAt: r.createdAt.toISOString(),
        actorId: r.actorId,
        actorDisplayName: r.actor?.displayName ?? null,
        actorEmail: r.actor?.email ?? null,
        actorRole: r.actor?.role ?? null,
        metadata: r.metadata === null ? null : (r.metadata as Record<string, unknown>),
        suggestedModule: mapResourceToSupportModule(r.resource),
        resolution: hints,
      };
    });

    return paginate(items, total, page, pageSize);
  }

  async createTicketFromAuditLog(tenantId: string, actor: JwtUser, auditLogId: string) {
    const log = await this.prisma.auditLog.findFirst({ where: { id: auditLogId, tenantId } });
    if (!log) throw new NotFoundException("Audit log not found");
    const hints = resolveHints(log.action, log.resource);
    return this.createTicket(tenantId, actor, {
      title: `${log.action} on ${log.resource}`,
      description: `Auto-created from audit log ${log.id}.\n\nSuggested: ${hints.summary}`,
      module: mapResourceToSupportModule(log.resource) as SupportProductModule,
      priority: hints.severity === "critical" ? "URGENT" : hints.severity === "warning" ? "HIGH" : "MEDIUM",
      clinicId: log.clinicId ?? undefined,
      resourceType: log.resource,
      resourceId: log.resourceId ?? undefined,
      linkedAuditLogId: log.id,
    });
  }
}
