import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { ClinicalOrderKind, ClinicalOrderStatus, Prisma, RecordShareScope } from "@prisma/client";
import { createHash } from "node:crypto";
import type { JwtUser } from "../auth/jwt-user";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { PlanUpgradeRequiredException } from "../entitlements/plan-upgrade-required.exception";
import { PlanKey } from "@prisma/client";
import { FeatureFlagsService, requireFeature } from "../feature-flags/feature-flags-public";
import { RecordShareService } from "../marketplace/record-share.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { OUTBOX_EVENT } from "../messaging/outbox-event-types";
import { PrismaService } from "../prisma/prisma.service";
import { labOrderPlacedNurseData } from "./lab-sample-events";
import { GENDER_TO_SEX, LabSampleRuleError, checkTemperature, checkTubes, parseCollectedAt, parseHandedOverAt, verifyIdentifiers, type IdentifierInput, type TubeInput } from "./lab-sample-safety";

export type CreateNurseLabOrderInput = {
  items: { code: string; nameEn: string; nameAr?: string }[];
  prescriber: { name: string; orderedOn: string };
  /** The nurse confirms she is transcribing a doctor's request (BR57-style: no order, no collection). */
  confirmedDoctorOrder: boolean;
  notes?: string;
};

export type RecordCollectionInput = {
  /** Home visit the sample was collected on (becomes the event's visitRef). */
  appointmentId?: string;
  identifiers: IdentifierInput[];
  collectedAt?: string;
  handedOverAt?: string;
  temperatureC?: number;
  tubes: TubeInput[];
};

/** Lab-side order status (Kiorex push). Index = progress; a push can never move the mirror backwards (except CANCELLED / REJECTED which are final). */
const STATUS_ORDER = ["HANDED_OFF", "ACCEPTED", "COLLECTED", "IN_LAB", "PARTIALLY_RESULTED", "AWAITING_VALIDATION", "VALIDATED", "RELEASED"] as const;
const FINAL = new Set(["RELEASED", "CANCELLED", "REJECTED_BY_LAB"]);

export type LabStatusPush = {
  status: string;
  labOrderNumber?: string;
  labId?: string;
  occurredAt?: string;
  rejectionCode?: string;
  reportId?: string;
  reportVersion?: number;
  secureLink?: string;
  signedAt?: string;
  custody?: { label?: string; type: string; occurredAt: string; by: "NURSE" | "LAB"; temperatureC?: number | null }[];
};

const rule = (e: LabSampleRuleError) =>
  new UnprocessableEntityException({ code: e.code, message: e.message, ...(e.kind ? { identifierKind: e.kind } : {}) });

/**
 * KNLAB01 / KLORD05 — the Nurse edition records the sample it collected against a LAB order and hands it to Kiorly Lab through Kiorex
 * (`LabOrderPlaced`, contracts 1.6.0). Pro+ (`nurse_lab_samples`), launch behind `clinic.lab_order_handoff`. The collection SAFETY checks
 * (identifiers, times, tube labels, consent) live in `lab-sample-safety.ts` and are never flagged.
 * The lab's status + sanitized chain of custody come back through Kiorex (`applyLabStatus`) and are shown to the nurse without PHI.
 */
@Injectable()
export class LabSampleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
    private readonly entitlements: EntitlementsService,
    private readonly recordShare: RecordShareService,
    private readonly outbox: OutboxEventService,
  ) {}

  private async assertNurseTenant(tenantId: string) {
    const t = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { edition: true } });
    if (!t || t.edition !== "NURSE") throw new ForbiddenException({ code: "NURSE_EDITION_REQUIRED", message: "Sample collection is part of the Nurse edition" });
  }

  private async assertEntitled(tenantId: string) {
    if (!(await this.entitlements.isEntitled(tenantId, "nurse_lab_samples"))) throw new PlanUpgradeRequiredException("nurse_lab_samples", PlanKey.NURSE_PRO);
  }

  private async ownVisit(tenantId: string, nurse: JwtUser, appointmentId: string) {
    const a = await this.prisma.appointment.findFirst({ where: { id: appointmentId, tenantId }, select: { id: true, patientId: true, clinicianId: true, clinicId: true } });
    if (!a) throw new NotFoundException("Visit not found");
    if (a.clinicianId !== nurse.userId) throw new ForbiddenException("This visit is not assigned to you");
    return a;
  }

  /** The nurse transcribes a doctor's lab request for a visit (a nurse never orders on her own authority). */
  async createOrder(tenantId: string, nurse: JwtUser, appointmentId: string, input: CreateNurseLabOrderInput) {
    await this.assertNurseTenant(tenantId);
    await this.assertEntitled(tenantId);
    await requireFeature(this.flags, tenantId, "clinic.lab_order_handoff");
    if (input.confirmedDoctorOrder !== true) throw new UnprocessableEntityException({ code: "DOCTOR_ORDER_REQUIRED", message: "Confirm you are transcribing a doctor's lab request" });
    const prescriber = input.prescriber?.name?.trim();
    const on = new Date(input.prescriber?.orderedOn ?? "");
    if (!prescriber || prescriber.length < 2 || Number.isNaN(on.getTime()) || on.getTime() > Date.now() + 86_400_000) {
      throw new UnprocessableEntityException({ code: "PRESCRIBER_REQUIRED", message: "The doctor's name and the date of the request are required" });
    }
    if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 30) throw new BadRequestException("1-30 lab tests are required");
    const missing = input.items.filter((i) => !i?.code?.trim() || !i?.nameEn?.trim());
    if (missing.length) throw new UnprocessableEntityException({ code: "ITEM_CODE_REQUIRED", message: "Every test needs its lab catalogue code and name" });
    const visit = await this.ownVisit(tenantId, nurse, appointmentId);
    const order = await this.prisma.clinicalOrder.create({
      data: {
        tenantId,
        clinicId: visit.clinicId,
        patientId: visit.patientId,
        kind: ClinicalOrderKind.LAB,
        status: ClinicalOrderStatus.ORDERED,
        orderedAt: new Date(),
        notes: input.notes?.slice(0, 1000) ?? null,
        createdByUserId: nurse.userId,
        prescriberName: prescriber.slice(0, 160),
        prescribedOn: on,
        items: { create: input.items.map((it, i) => ({ code: it.code.trim(), nameEn: it.nameEn.trim(), nameAr: it.nameAr?.trim() ?? "", sortOrder: i })) },
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    await this.prisma.auditLog.create({
      data: { tenantId, actorId: nurse.userId, clinicId: visit.clinicId, patientId: visit.patientId, action: "LAB_ORDER_TRANSCRIBED", resource: "ClinicalOrder", resourceId: order.id, metadata: { items: order.items.length, appointmentId } },
    });
    return this.view(order, null);
  }

  /**
   * Record the collection and hand the sample to Kiorly Lab. Order of refusals: edition, plan, flag, then the safety checks
   * (identifier-mismatch, future time, ...), then consent. Idempotent per order. Nothing is written when anything is refused.
   */
  async recordCollection(tenantId: string, nurse: JwtUser, orderId: string, input: RecordCollectionInput) {
    await this.assertNurseTenant(tenantId);
    await this.assertEntitled(tenantId);
    await requireFeature(this.flags, tenantId, "clinic.lab_order_handoff");

    const order = await this.prisma.clinicalOrder.findFirst({
      where: { id: orderId, tenantId },
      include: { items: { orderBy: { sortOrder: "asc" } }, patient: true, sampleCollection: { include: { tubes: true } }, clinic: { select: { id: true } } },
    });
    if (!order) throw new NotFoundException("Lab order not found");
    if (order.sampleCollection) return { ...this.collectionView(order.sampleCollection), alreadyHandedOff: true };
    if (order.kind !== ClinicalOrderKind.LAB) throw new ConflictException({ code: "LAB_HANDOFF_NOT_LAB", message: "Only lab orders can be collected for a lab" });
    if (order.patient.isSample) throw new ConflictException({ code: "LAB_HANDOFF_SAMPLE", message: "Sample patients cannot be handed off" });
    if (order.status === ClinicalOrderStatus.DRAFT || order.status === ClinicalOrderStatus.CANCELLED) throw new ConflictException({ code: "LAB_HANDOFF_NOT_PLACED", message: "Place the order before collecting" });
    if (order.items.some((i) => !i.code)) throw new UnprocessableEntityException({ code: "ITEM_CODE_REQUIRED", message: "Every test needs a lab catalogue code" });
    if (input.appointmentId) {
      const v = await this.ownVisit(tenantId, nurse, input.appointmentId);
      if (v.patientId !== order.patientId) throw new ConflictException({ code: "VISIT_PATIENT_MISMATCH", message: "This order belongs to another patient than the visit" });
    }

    const now = new Date();
    let identifiers: string[]; let collectedAt: Date; let handedOverAt: Date | null; let temperature: number | null; let tubes: TubeInput[];
    try {
      identifiers = verifyIdentifiers(order.patient, input.identifiers);
      collectedAt = parseCollectedAt(input.collectedAt, now);
      handedOverAt = parseHandedOverAt(input.handedOverAt, collectedAt, now);
      temperature = checkTemperature(input.temperatureC);
      tubes = checkTubes(input.tubes);
    } catch (e) {
      if (e instanceof LabSampleRuleError) {
        await this.prisma.auditLog.create({
          data: { tenantId, actorId: nurse.userId, clinicId: order.clinicId, patientId: order.patientId, action: "LAB_SAMPLE_REFUSED", resource: "ClinicalOrder", resourceId: order.id, metadata: { code: e.code, ...(e.kind ? { identifierKind: e.kind } : {}) } },
        });
        throw rule(e);
      }
      throw e;
    }
    const clash = await this.prisma.labSampleTube.findFirst({ where: { tenantId, label: { in: tubes.map((t) => t.label) } }, select: { label: true } });
    if (clash) throw new ConflictException({ code: "TUBE_LABEL_DUPLICATE", message: "A tube with this label was already recorded" });

    const consentToken = await this.recordShare.consentTokenFor(tenantId, order.patientId, RecordShareScope.LAB_RESULTS);
    if (!consentToken) throw new ConflictException({ code: "LAB_HANDOFF_NO_CONSENT", message: "The patient has not consented to share lab orders and results with a lab" });

    const prescriberName = order.prescriberName ?? (await this.creatorName(order.createdByUserId));
    const p = order.patient;
    const data = labOrderPlacedNurseData({
      orderId: order.id,
      encounterId: order.encounterId,
      clinicId: order.clinicId,
      patientRef: order.patientId,
      orderingClinicianId: order.createdByUserId ?? nurse.userId,
      consentToken,
      orderedAt: order.orderedAt ?? order.createdAt,
      items: order.items,
      prescriberName,
      identifiersChecked: identifiers,
      patient: { fullName: `${p.firstNameEn} ${p.lastNameEn}`.trim(), dateOfBirth: p.dob, sex: GENDER_TO_SEX[p.gender], phone: p.phone },
      visitRef: input.appointmentId ?? order.id,
      collectorRef: nurse.userId,
      collectorName: (await this.prisma.user.findUnique({ where: { id: nurse.userId }, select: { displayName: true } }))?.displayName ?? null,
      collectedAt,
      handedOverAt,
      temperatureC: temperature,
      samples: tubes,
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const eventId = await this.outbox.enqueueEvent({ tenantId, type: OUTBOX_EVENT.LAB_ORDER_PLACED, aggregateType: "LabOrder", aggregateId: order.id, payload: data }, tx);
      const row = await tx.labSampleCollection.create({
        data: {
          tenantId,
          orderId: order.id,
          patientId: order.patientId,
          appointmentId: input.appointmentId ?? null,
          collectorUserId: nurse.userId,
          collectedAt,
          handedOverAt,
          temperatureC: temperature != null ? new Prisma.Decimal(temperature) : null,
          identifiersChecked: identifiers,
          consentTokenHash: createHash("sha256").update(consentToken).digest("hex"),
          prescriberName,
          outboxEventId: eventId,
          tubes: { create: tubes.map((t) => ({ tenantId, label: t.label, specimenType: t.specimenType, container: t.container ?? null })) },
        },
        include: { tubes: true },
      });
      await tx.clinicalOrder.update({ where: { id: order.id }, data: { status: ClinicalOrderStatus.IN_PROGRESS } });
      await tx.auditLog.create({
        data: { tenantId, actorId: nurse.userId, clinicId: order.clinicId, patientId: order.patientId, action: "LAB_SAMPLE_COLLECTED", resource: "ClinicalOrder", resourceId: order.id, metadata: { outboxEventId: eventId, tubes: tubes.length, identifiers: identifiers.length } },
      });
      return row;
    });
    return { ...this.collectionView(created), alreadyHandedOff: false };
  }

  private async creatorName(userId: string | null): Promise<string | null> {
    if (!userId) return null;
    return (await this.prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } }))?.displayName ?? null;
  }

  async listForVisit(tenantId: string, nurse: JwtUser, opts: { appointmentId?: string; patientId?: string }) {
    const where: Prisma.ClinicalOrderWhereInput = { tenantId, kind: ClinicalOrderKind.LAB };
    if (opts.appointmentId) {
      const v = await this.ownVisit(tenantId, nurse, opts.appointmentId);
      where.patientId = v.patientId;
    } else if (opts.patientId) where.patientId = opts.patientId;
    else where.createdByUserId = nurse.userId;
    const rows = await this.prisma.clinicalOrder.findMany({ where, include: { items: { orderBy: { sortOrder: "asc" } }, sampleCollection: { include: { tubes: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
    return rows.map((o) => this.view(o, o.sampleCollection));
  }

  async get(tenantId: string, orderId: string) {
    const o = await this.prisma.clinicalOrder.findFirst({ where: { id: orderId, tenantId, kind: ClinicalOrderKind.LAB }, include: { items: { orderBy: { sortOrder: "asc" } }, sampleCollection: { include: { tubes: true } } } });
    if (!o) throw new NotFoundException("Lab order not found");
    return this.view(o, o.sampleCollection);
  }

  /** What the nurse sees: status + chain of custody (type, time, temperature, NURSE|LAB) and the tube labels. No names, no results, no PHI. */
  async custody(tenantId: string, orderId: string) {
    const c = await this.prisma.labSampleCollection.findFirst({ where: { orderId, tenantId }, include: { tubes: true } });
    if (!c) throw new NotFoundException({ code: "SAMPLE_NOT_COLLECTED", message: "No sample was collected for this order" });
    return this.collectionView(c);
  }

  private view(
    o: { id: string; status: ClinicalOrderStatus; patientId: string; encounterId: string | null; orderedAt: Date | null; createdAt: Date; prescriberName: string | null; prescribedOn: Date | null; items: { id: string; code: string | null; nameEn: string; nameAr: string }[] },
    c: Prisma.LabSampleCollectionGetPayload<{ include: { tubes: true } }> | null,
  ) {
    return {
      id: o.id,
      status: o.status,
      patientId: o.patientId,
      orderedAt: (o.orderedAt ?? o.createdAt).toISOString(),
      prescriberName: o.prescriberName,
      prescribedOn: o.prescribedOn ? o.prescribedOn.toISOString().slice(0, 10) : null,
      items: o.items.map((i) => ({ id: i.id, code: i.code, nameEn: i.nameEn, nameAr: i.nameAr })),
      collection: c ? this.collectionView(c) : null,
    };
  }

  private collectionView(c: Prisma.LabSampleCollectionGetPayload<{ include: { tubes: true } }>) {
    const custody = Array.isArray(c.custodyJson) ? (c.custodyJson as { label?: string; type: string; occurredAt: string; by: string; temperatureC?: number | null }[]) : [];
    return {
      orderId: c.orderId,
      handedOff: true,
      appointmentId: c.appointmentId,
      collectedAt: c.collectedAt.toISOString(),
      handedOverAt: c.handedOverAt?.toISOString() ?? null,
      temperatureC: c.temperatureC != null ? Number(c.temperatureC) : null,
      identifiersChecked: c.identifiersChecked as string[],
      tubes: c.tubes.map((t) => ({ label: t.label, specimenType: t.specimenType, container: t.container })).sort((a, b) => a.label.localeCompare(b.label)),
      labStatus: c.labStatus,
      labOrderNumber: c.labOrderNumber,
      labStatusAt: c.labStatusAt?.toISOString() ?? null,
      rejectionCode: c.rejectionCode,
      /** Starts with the nurse's own collection, then the lab events relayed by Kiorex. */
      custody: [{ type: "COLLECTED", occurredAt: c.collectedAt.toISOString(), by: "NURSE" as const, temperatureC: c.temperatureC != null ? Number(c.temperatureC) : null }, ...custody.filter((e) => !(e.by === "NURSE" && e.type === "COLLECTED"))],
      result: c.reportId ? { reportId: c.reportId, reportVersion: c.reportVersion, secureLink: c.resultSecureLink, releasedAt: c.resultReleasedAt?.toISOString() ?? null } : null,
    };
  }

  /**
   * Kiorex -> Kiorly status push (marketplace API `POST /lab-orders/:orderId/status`). Monotonic and idempotent; carries no results and no PHI.
   * RELEASED marks the order RESULTS_READY and keeps only the report id + secure link.
   */
  async applyLabStatus(orderId: string, push: LabStatusPush): Promise<{ applied: boolean; status: string }> {
    const known = [...STATUS_ORDER, "CANCELLED", "REJECTED_BY_LAB"];
    if (!known.includes(push.status)) throw new BadRequestException({ code: "UNKNOWN_LAB_STATUS", message: `status must be one of ${known.join(", ")}` });
    const c = await this.prisma.labSampleCollection.findUnique({ where: { orderId } });
    if (!c) throw new NotFoundException({ code: "LAB_HANDOFF_NOT_FOUND", message: "Unknown hand-off" });
    const cur = c.labStatus;
    const regress = !FINAL.has(push.status) && (FINAL.has(cur) || STATUS_ORDER.indexOf(push.status as never) < STATUS_ORDER.indexOf(cur as never));
    // custody may still refresh on an equal/earlier status (late events), but the headline status never moves back
    const data: Prisma.LabSampleCollectionUpdateInput = {};
    if (!regress && push.status !== cur) {
      data.labStatus = push.status;
      data.labStatusAt = push.occurredAt ? new Date(push.occurredAt) : new Date();
    }
    if (push.labOrderNumber) data.labOrderNumber = push.labOrderNumber.slice(0, 60);
    if (push.labId) data.labId = push.labId.slice(0, 80);
    if (push.status === "REJECTED_BY_LAB" && !regress) data.rejectionCode = (push.rejectionCode ?? "REJECTED").slice(0, 60);
    if (push.custody?.length) {
      data.custodyJson = push.custody.slice(0, 200).map((e) => ({
        ...(e.label ? { label: String(e.label).slice(0, 40) } : {}),
        type: String(e.type).slice(0, 40),
        occurredAt: new Date(e.occurredAt).toISOString(),
        by: e.by === "NURSE" ? "NURSE" : "LAB",
        temperatureC: e.temperatureC ?? null,
      })) as unknown as Prisma.InputJsonValue;
    }
    if (push.status === "RELEASED" && push.reportId && push.secureLink) {
      data.reportId = push.reportId;
      data.reportVersion = push.reportVersion ?? 1;
      data.resultSecureLink = push.secureLink;
      data.resultReleasedAt = push.signedAt ? new Date(push.signedAt) : new Date();
    }
    if (Object.keys(data).length === 0) return { applied: false, status: cur };
    await this.prisma.$transaction(async (tx) => {
      await tx.labSampleCollection.update({ where: { id: c.id }, data });
      const next = (data.labStatus as string | undefined) ?? cur;
      const orderStatus = next === "RELEASED" ? ClinicalOrderStatus.RESULTS_READY : next === "CANCELLED" ? ClinicalOrderStatus.CANCELLED : undefined;
      if (orderStatus) {
        await tx.clinicalOrder.update({ where: { id: orderId }, data: { status: orderStatus, ...(orderStatus === ClinicalOrderStatus.RESULTS_READY ? { resultsReadyAt: new Date() } : {}) } });
      }
      await tx.auditLog.create({ data: { tenantId: c.tenantId, actorId: null, clinicId: null, patientId: c.patientId, action: "LAB_STATUS_RECEIVED", resource: "ClinicalOrder", resourceId: orderId, metadata: { status: push.status, applied: !regress } } });
    });
    return { applied: !regress, status: (data.labStatus as string | undefined) ?? cur };
  }
}
