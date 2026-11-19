import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ClinicalOrderKind,
  ClinicalOrderStatus,
  MessageChannel,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MessagingService } from "../messaging/messaging.service";

export const RESULTS_READY_TEMPLATE = "results_ready";

@Injectable()
export class ClinicalOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
  ) {}

  list(tenantId: string, opts: { encounterId?: string; patientId?: string }) {
    return this.prisma.clinicalOrder.findMany({
      where: {
        tenantId,
        ...(opts.encounterId ? { encounterId: opts.encounterId } : {}),
        ...(opts.patientId ? { patientId: opts.patientId } : {}),
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(
    tenantId: string,
    userId: string | undefined,
    body: {
      clinicId: string;
      patientId: string;
      encounterId?: string;
      kind: ClinicalOrderKind;
      notes?: string;
      items: { code?: string; nameEn: string; nameAr?: string }[];
    },
  ) {
    if (!body.items?.length) throw new BadRequestException("At least one order item is required");
    const patient = await this.prisma.patient.findFirst({
      where: { id: body.patientId, tenantId },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException("Patient not found");

    return this.prisma.clinicalOrder.create({
      data: {
        tenantId,
        clinicId: body.clinicId,
        patientId: body.patientId,
        encounterId: body.encounterId ?? null,
        kind: body.kind,
        status: ClinicalOrderStatus.ORDERED,
        orderedAt: new Date(),
        notes: body.notes ?? null,
        createdByUserId: userId ?? null,
        items: {
          create: body.items.map((it, i) => ({
            code: it.code ?? null,
            nameEn: it.nameEn,
            nameAr: it.nameAr ?? "",
            sortOrder: i,
          })),
        },
      },
      include: { items: true },
    });
  }

  async patch(
    tenantId: string,
    orderId: string,
    body: {
      status?: ClinicalOrderStatus;
      resultsJson?: unknown;
      items?: { id?: string; resultValue?: string; resultUnit?: string; resultFlag?: string }[];
      notes?: string;
    },
  ) {
    const order = await this.prisma.clinicalOrder.findFirst({
      where: { id: orderId, tenantId },
      include: { clinic: { select: { nameEn: true, nameAr: true } }, patient: true, items: true },
    });
    if (!order) throw new NotFoundException("Order not found");

    const nextStatus = body.status ?? order.status;
    const becomingReady =
      nextStatus === ClinicalOrderStatus.RESULTS_READY && order.status !== ClinicalOrderStatus.RESULTS_READY;

    if (body.items?.length) {
      for (const it of body.items) {
        if (!it.id) continue;
        await this.prisma.clinicalOrderItem.updateMany({
          where: { id: it.id, orderId },
          data: {
            ...(it.resultValue !== undefined ? { resultValue: it.resultValue } : {}),
            ...(it.resultUnit !== undefined ? { resultUnit: it.resultUnit } : {}),
            ...(it.resultFlag !== undefined ? { resultFlag: it.resultFlag } : {}),
          },
        });
      }
    }

    const updated = await this.prisma.clinicalOrder.update({
      where: { id: orderId },
      data: {
        status: nextStatus,
        notes: body.notes ?? order.notes,
        resultsJson:
          body.resultsJson !== undefined ? (body.resultsJson as Prisma.InputJsonValue) : undefined,
        resultsReadyAt: becomingReady ? new Date() : order.resultsReadyAt,
      },
      include: { items: { orderBy: { sortOrder: "asc" } }, clinic: { select: { nameEn: true, nameAr: true } }, patient: true },
    });

    if (becomingReady) {
      await this.notifyResultsReady(updated);
    }

    return updated;
  }

  /** Acceptance: Results ready → WhatsApp template "results_ready". */
  async notifyResultsReady(order: {
    id: string;
    tenantId: string;
    patientId: string;
    notifiedAt: Date | null;
    clinic: { nameEn: string; nameAr: string };
    patient: { phone: string | null; firstNameEn: string; isSample: boolean };
  }) {
    if (order.notifiedAt || order.patient.isSample) return { sent: false as const };
    const phone = order.patient.phone?.trim();
    if (!phone) return { sent: false as const };

    await this.messaging.ensureDefaultTemplates(order.tenantId);
    const clinic = order.clinic.nameEn || order.clinic.nameAr;
    const body = `Your lab results are ready. Please contact ${clinic}.`;
    await this.messaging.queueMessage(order.tenantId, {
      patientId: order.patientId,
      channel: MessageChannel.WHATSAPP,
      templateKey: RESULTS_READY_TEMPLATE,
      toPhone: phone,
      body,
      variables: {
        name: order.patient.firstNameEn,
        clinic,
      },
    });
    await this.prisma.clinicalOrder.update({
      where: { id: order.id },
      data: { notifiedAt: new Date() },
    });
    return { sent: true as const };
  }
}
