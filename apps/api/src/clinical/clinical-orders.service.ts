import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { MobilePushService } from "../mobile/mobile-push.service";
import {
  ClinicalOrderKind,
  ClinicalOrderStatus,
  MessageChannel,
  Prisma,
  RecordShareScope,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { UPLOAD_BLOB_STORAGE, type UploadBlobStorage } from "../storage/upload-blob.storage";
import { RecordShareService } from "../marketplace/record-share.service";
import { MessagingService } from "../messaging/messaging.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { OUTBOX_EVENT } from "../messaging/outbox-event-types";

export const RESULTS_READY_TEMPLATE = "results_ready";
const RESULTS_PDF_MAX_BYTES = 15 * 1024 * 1024;

@Injectable()
export class ClinicalOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
    @Optional() private readonly recordShare?: RecordShareService,
    @Optional() private readonly outbox?: OutboxEventService,
    @Optional() @Inject(UPLOAD_BLOB_STORAGE) private readonly uploads?: UploadBlobStorage,
    @Optional() private readonly mobilePush?: MobilePushService,
  ) {}

  /** CL-06 results as PDF: stored privately under the tenant; the order keeps only the relative key. */
  async attachResultsPdf(tenantId: string, orderId: string, file: { buffer: Buffer; size: number; mimetype: string; originalname?: string } | undefined) {
    if (!this.uploads) throw new ConflictException("File storage is not available");
    if (!file?.buffer?.length) throw new BadRequestException("A PDF file is required");
    if (file.size > RESULTS_PDF_MAX_BYTES) throw new BadRequestException("PDF is larger than 15 MB");
    if (file.buffer.subarray(0, 5).toString("latin1") !== "%PDF-") throw new BadRequestException("Only PDF results can be attached");
    const order = await this.prisma.clinicalOrder.findFirst({ where: { id: orderId, tenantId }, select: { id: true, resultsPdfRelativePath: true } });
    if (!order) throw new NotFoundException("Order not found");
    const key = `${tenantId}/clinical-orders/${order.id}/results-${Date.now()}.pdf`;
    await this.uploads.put("encounters", key, file.buffer, "application/pdf");
    if (order.resultsPdfRelativePath) await this.uploads.deleteObject("encounters", order.resultsPdfRelativePath).catch(() => undefined);
    await this.prisma.clinicalOrder.update({ where: { id: order.id }, data: { resultsPdfRelativePath: key } });
    return { orderId: order.id, hasResultsPdf: true as const };
  }

  async openResultsPdf(tenantId: string, orderId: string) {
    if (!this.uploads) throw new ConflictException("File storage is not available");
    const order = await this.prisma.clinicalOrder.findFirst({ where: { id: orderId, tenantId }, select: { resultsPdfRelativePath: true } });
    if (!order?.resultsPdfRelativePath) throw new NotFoundException("No results PDF attached to this order");
    await this.uploads.assertExists("encounters", order.resultsPdfRelativePath);
    return { stream: await this.uploads.getReadStream("encounters", order.resultsPdfRelativePath), filename: `results-${orderId}.pdf` };
  }

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
      const doc = updated.createdByUserId ?? (await this.prisma.encounter.findFirst({ where: { id: updated.encounterId ?? "" }, select: { clinicianId: true } }))?.clinicianId;
      if (this.mobilePush && doc) void this.mobilePush.notifyUsers(updated.tenantId, [doc], "LAB_RESULT_READY", { orderId: updated.id }).catch(() => undefined);
    }

    return updated;
  }

  /**
   * KCV204 — hand a LAB order to Kiorly Lab via Kiorex: emits `LabOrderPlaced` on the outbox. Requires the patient's
   * active LAB_RESULTS record-share consent (its token rides in the event). Idempotent per order. Mock-safe: Kiorex
   * accepts the event until Kiorly Lab GA.
   */
  async handoffToLab(tenantId: string, orderId: string, userId: string | undefined) {
    if (!this.recordShare || !this.outbox) throw new ConflictException("Lab hand-off is not available");
    const order = await this.prisma.clinicalOrder.findFirst({
      where: { id: orderId, tenantId },
      include: { items: { orderBy: { sortOrder: "asc" } }, patient: { select: { isSample: true } } },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.kind !== ClinicalOrderKind.LAB) {
      throw new ConflictException({ message: "Only lab orders can be handed off to a lab", errorCode: "LAB_HANDOFF_NOT_LAB" });
    }
    if (order.patient.isSample) {
      throw new ConflictException({ message: "Sample patients cannot be handed off", errorCode: "LAB_HANDOFF_SAMPLE" });
    }
    if (order.status === ClinicalOrderStatus.DRAFT || order.status === ClinicalOrderStatus.CANCELLED) {
      throw new ConflictException({ message: "Place the order before handing it off", errorCode: "LAB_HANDOFF_NOT_PLACED" });
    }
    const existing = await this.prisma.outboxEvent.findFirst({
      where: { tenantId, type: OUTBOX_EVENT.LAB_ORDER_PLACED, aggregateType: "LabOrder", aggregateId: order.id },
      select: { id: true, status: true },
    });
    if (existing) return { handedOff: true, alreadyHandedOff: true, eventId: existing.id, status: existing.status };
    const consentToken = await this.recordShare.consentTokenFor(tenantId, order.patientId, RecordShareScope.LAB_RESULTS);
    if (!consentToken) {
      throw new ConflictException({
        message: "The patient has not consented to share lab orders and results with a lab",
        errorCode: "LAB_HANDOFF_NO_CONSENT",
      });
    }
    const eventId = await this.outbox.enqueueEvent({
      tenantId,
      type: OUTBOX_EVENT.LAB_ORDER_PLACED,
      aggregateType: "LabOrder",
      aggregateId: order.id,
      payload: {
        orderId: order.id,
        clinicId: order.clinicId,
        patientRef: order.patientId,
        consentToken,
        orderedAt: (order.orderedAt ?? order.createdAt).toISOString(),
        ...(order.encounterId ? { encounterId: order.encounterId } : {}),
        ...(order.createdByUserId ? { orderingClinicianId: order.createdByUserId } : {}),
        items: order.items.map((it) => ({
          ...(it.code ? { code: it.code } : {}),
          nameEn: it.nameEn,
          ...(it.nameAr ? { nameAr: it.nameAr } : {}),
        })),
        ...(order.notes ? { notes: order.notes } : {}),
      },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: userId ?? null,
        clinicId: order.clinicId,
        patientId: order.patientId,
        action: "LAB_ORDER_HANDOFF",
        resource: "ClinicalOrder",
        resourceId: order.id,
        metadata: { patientId: order.patientId, outboxEventId: eventId, items: order.items.length },
      },
    });
    return { handedOff: true, alreadyHandedOff: false, eventId, status: "PENDING" };
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
