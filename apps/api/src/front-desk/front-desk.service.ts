import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  AppointmentQueueStage,
  AppointmentStatus,
  EncounterStatus,
  Prisma,
  RevenueStatus,
  VisitCollectionMode,
} from "@prisma/client";
import { parseVisitCollectionForAmount, type VisitCollectionInput } from "../common/visit-collection";
import { resolveTransferVerification } from "../common/visit-collection-transfer";
import { postRevenueWithFiscal } from "../compliance/post-revenue-with-fiscal";
import type { JwtUser } from "../auth/jwt-user";
import { parseFrontDeskRoomLabels } from "../common/front-desk-room-labels";
import { PrismaService } from "../prisma/prisma.service";
import { PatientsService } from "../patients/patients.service";
import {
  collectEncounterVisitFeeBalance,
  getEncounterVisitFeeReceivableSummary,
} from "../common/visit-fee-ledger";
import { ensureDraftEncounterOnCheckIn } from "./ensure-draft-encounter-on-check-in";
import { FrontDeskFlowService } from "./front-desk-flow.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { UPLOAD_BLOB_STORAGE, type UploadBlobStorage } from "../storage/upload-blob.storage";
import { basename } from "node:path";
import { randomUUID } from "node:crypto";

const RECEIPT_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

@Injectable()
export class FrontDeskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patients: PatientsService,
    private readonly flow: FrontDeskFlowService,
    private readonly featureFlags: FeatureFlagsService,
    @Inject(UPLOAD_BLOB_STORAGE) private readonly uploads: UploadBlobStorage,
  ) {}

  quickSearch(tenantId: string, user: JwtUser, q: string) {
    return this.patients.listPaginated(
      tenantId,
      { search: q, page: "1", pageSize: "8", sortBy: "updatedAt", sortOrder: "desc" },
      user,
    );
  }

  async checkIn(
    tenantId: string,
    user: JwtUser,
    appointmentId: string,
    body: {
      paymentAmount?: number;
      roomLabel?: string;
      currency?: string;
      visitCollection?: VisitCollectionInput;
    },
  ) {
    const apt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      include: {
        patient: true,
        clinic: { select: { defaultCurrency: true, nameEn: true, taxRegistrationNumber: true, invoiceVatPercent: true } },
      },
    });
    if (!apt) throw new NotFoundException("Appointment not found");
    if (apt.status === AppointmentStatus.CANCELLED || apt.status === AppointmentStatus.COMPLETED) {
      throw new BadRequestException("Cannot check in this appointment");
    }

    const now = new Date();
    const pay = body.paymentAmount != null && body.paymentAmount > 0 ? body.paymentAmount : null;
    const { resolveTenantTransferCollectionContext } = await import("../common/market-transfer-context");
    const transferCtx = await resolveTenantTransferCollectionContext(this.prisma, this.featureFlags, tenantId);
    const collection =
      pay != null
        ? parseVisitCollectionForAmount(
            pay,
            body.visitCollection ?? { mode: VisitCollectionMode.CASH_ON_VISIT },
            {
              allowedTransferChannels: transferCtx.allowedTransferChannels,
              paymentMethods: transferCtx.paymentMethods,
            },
          )
        : null;
    const collectionPatch =
      collection && pay != null
        ? {
            checkInCollectionMode: collection.collectionMode,
            checkInTransferChannel: collection.transferChannel,
            checkInTransferReference: collection.transferReference,
          }
        : {
            checkInCollectionMode: null,
            checkInTransferChannel: null,
            checkInTransferReference: null,
          };

    const { resolveClinicCurrency } = await import("../common/clinic-currency");
    const currency =
      body.currency?.trim() ||
      apt.clinic.defaultCurrency?.trim() ||
      (await resolveClinicCurrency(this.prisma, tenantId, apt.clinicId));
    let transferVerificationStatus: import("@prisma/client").TransferVerificationStatus | undefined;
    if (pay != null && collection?.transferChannel && collection.transferReference) {
      transferVerificationStatus = await resolveTransferVerification(
        collection.transferChannel,
        collection.transferReference,
        pay,
        currency,
        transferCtx.paymentMethods,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const checkInPatch = await this.flow.buildCheckInStatusPatch(tx, tenantId, apt.clinicId, {
        preferredRoomLabel: body.roomLabel,
        existingPreferred: apt.preferredRoomLabel ?? apt.roomLabel,
      });
      const ticket = checkInPatch.queueTicketNumber;
      const updated = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          ...checkInPatch,
          checkInPaymentAmount: pay != null ? new Prisma.Decimal(String(pay)) : null,
          ...collectionPatch,
        },
        include: {
          patient: { select: { mrn: true, firstNameEn: true, lastNameEn: true, isVip: true, needsChaperone: true } },
          clinician: { select: { displayName: true } },
        },
      });
      if (pay != null && collection) {
        const buyerName = `${apt.patient.firstNameEn} ${apt.patient.lastNameEn}`.trim();
        await postRevenueWithFiscal(tx, {
          tenantId,
          clinicId: apt.clinicId,
          patientId: apt.patientId,
          appointmentId: apt.id,
          category: "VISIT",
          description: `Check-in payment · ticket #${ticket} · ${buyerName}`,
          grossAmount: pay,
          taxAmount: 0,
          netAmount: pay,
          currency,
          postedAt: now,
          status: RevenueStatus.POSTED,
          buyerName,
          clinicTaxRin: apt.clinic.taxRegistrationNumber,
          vatPercent: Number(apt.clinic.invoiceVatPercent ?? 0),
          collectionMode: collection.collectionMode,
          transferChannel: collection.transferChannel,
          transferReference: collection.transferReference,
          transferVerificationStatus,
        });
      }
      const openEncounterId =
        (await ensureDraftEncounterOnCheckIn(tx, tenantId, appointmentId)) ?? null;
      return {
        appointmentId: updated.id,
        queueTicketNumber: ticket,
        checkedInAt: now.toISOString(),
        status: updated.status,
        patientMrn: updated.patient.mrn,
        clinicianName: updated.clinician.displayName,
        paymentRecorded: pay,
        openEncounterId,
      };
    });
  }

  async clinicBoard(tenantId: string, clinicId: string) {
    const clinic = await this.prisma.clinic.findFirst({ where: { id: clinicId, tenantId } });
    if (!clinic) throw new NotFoundException("Clinic not found");
    const roomLabels = parseFrontDeskRoomLabels(clinic.frontDeskRoomLabels);

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const dayAppointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        clinicId,
        status: AppointmentStatus.CHECKED_IN,
        OR: [
          { checkedInAt: { gte: dayStart, lt: dayEnd } },
          { checkedInAt: null, startsAt: { gte: dayStart, lt: dayEnd } },
        ],
      },
      orderBy: { checkedInAt: "asc" },
      include: {
        patient: {
          select: {
            mrn: true,
            firstNameEn: true,
            lastNameEn: true,
            isVip: true,
            needsChaperone: true,
            requiresAppointmentDeposit: true,
            allergies: { take: 3 },
          },
        },
        clinician: { select: { displayName: true } },
        encounters: {
          where: { status: { in: [EncounterStatus.DRAFT, EncounterStatus.AMENDED] } },
          take: 1,
          select: { id: true },
        },
      },
    });

    const now = Date.now();
    const mapRow = (w: (typeof dayAppointments)[number]) => ({
      appointmentId: w.id,
      ticketNumber: w.queueTicketNumber,
      patientName: `${w.patient.firstNameEn} ${w.patient.lastNameEn}`,
      patientMrn: w.patient.mrn,
      clinicianName: w.clinician.displayName,
      queueStage: w.queueStage ?? AppointmentQueueStage.WAITING,
      roomLabel: w.roomLabel,
      preferredRoomLabel: w.preferredRoomLabel,
      waitMinutes: w.checkedInAt ? Math.floor((now - w.checkedInAt.getTime()) / 60_000) : 0,
      calledAt: w.calledAt?.toISOString() ?? null,
      openEncounterId: w.encounters[0]?.id ?? null,
      alerts: this.patientAlertFlags(w.patient),
    });

    const waiting = dayAppointments.filter(
      (w) =>
        w.queueStage === null ||
        w.queueStage === AppointmentQueueStage.WAITING ||
        w.queueStage === AppointmentQueueStage.CALLED,
    );
    const inExam = dayAppointments.filter((w) => w.queueStage === AppointmentQueueStage.IN_EXAM);

    const occupiedRooms = new Set(inExam.filter((w) => w.roomLabel).map((w) => w.roomLabel!));
    const rooms = roomLabels.map((label) => ({
      label,
      free: !occupiedRooms.has(label),
      appointmentId: inExam.find((w) => w.roomLabel === label)?.id ?? null,
    }));

    return {
      clinicId,
      clinicName: clinic.nameEn,
      lastCalledTicket: clinic.lastCalledTicketNumber,
      waiting: waiting.map(mapRow),
      inExam: inExam.map(mapRow),
      rooms,
      generatedAt: new Date().toISOString(),
    };
  }

  /** Opens a draft encounter and auto-assigns an exam room (waiting → in exam). */
  async startVisitFromAppointment(tenantId: string, user: JwtUser, appointmentId: string) {
    void user;
    const apt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
    });
    if (!apt) throw new NotFoundException("Appointment not found");
    if (apt.status === AppointmentStatus.CANCELLED || apt.status === AppointmentStatus.COMPLETED) {
      throw new BadRequestException("Cannot start visit");
    }

    const hadOpen = await this.prisma.encounter.findFirst({
      where: {
        tenantId,
        appointmentId,
        status: { in: [EncounterStatus.DRAFT, EncounterStatus.AMENDED] },
      },
      select: { id: true },
    });

    const encounterId = await this.prisma.$transaction(async (tx) => {
      const openId =
        (await ensureDraftEncounterOnCheckIn(tx, tenantId, appointmentId)) ??
        hadOpen?.id ??
        null;
      if (!openId) throw new BadRequestException("Could not open visit encounter for this appointment");
      await this.flow.onEncounterStarted(tx, tenantId, appointmentId);
      return openId;
    });

    return { encounterId, alreadyOpen: Boolean(hadOpen) as boolean };
  }

  async callTicket(tenantId: string, clinicId: string, ticketNumber: number) {
    const clinic = await this.prisma.clinic.findFirst({ where: { id: clinicId, tenantId } });
    if (!clinic) throw new NotFoundException("Clinic not found");
    const apt = await this.prisma.appointment.findFirst({
      where: {
        tenantId,
        clinicId,
        queueTicketNumber: ticketNumber,
        status: AppointmentStatus.CHECKED_IN,
      },
    });
    if (apt) {
      await this.prisma.$transaction(async (tx) => {
        await this.flow.markCalled(tx, apt.id);
      });
    }
    await this.prisma.clinic.update({
      where: { id: clinicId },
      data: { lastCalledTicketNumber: ticketNumber },
    });
    return { ticketNumber, calledAt: new Date().toISOString() };
  }

  async patientHeaderAlerts(tenantId: string, patientId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, tenantId, deletedAt: null },
      include: { allergies: { take: 10 } },
    });
    if (!patient) throw new NotFoundException("Patient not found");

    const operations = await this.prisma.operation.findMany({
      where: { tenantId, patientId },
      select: { totalCost: true, paidAmount: true },
    });
    let owed = 0;
    for (const op of operations) {
      owed += Math.max(0, Number(op.totalCost) - Number(op.paidAmount));
    }

    return {
      patientId,
      badges: [
        ...(patient.allergies.length > 0
          ? [{ kind: "ALLERGY", level: "high", messageEn: `${patient.allergies.length} allergy(ies)`, messageAr: "حساسية" }]
          : []),
        ...(owed > 0 ? [{ kind: "BALANCE", level: "medium", messageEn: `Balance owed: ${owed.toFixed(2)}`, messageAr: "رصيد مستحق" }] : []),
        ...(patient.isVip ? [{ kind: "VIP", level: "info", messageEn: "VIP", messageAr: "VIP" }] : []),
        ...(patient.needsChaperone
          ? [{ kind: "CHAPERONE", level: "medium", messageEn: "Needs chaperone", messageAr: "يحتاج مرافقاً" }]
          : []),
        ...(patient.requiresAppointmentDeposit
          ? [{ kind: "DEPOSIT", level: "high", messageEn: "Deposit required", messageAr: "عربون مطلوب" }]
          : []),
      ],
    };
  }

  async collectVisitBalance(
    tenantId: string,
    user: JwtUser,
    encounterId: string,
    visitCollectionInput: VisitCollectionInput,
    receiptFile?: Express.Multer.File,
  ) {
    const enc = await this.prisma.encounter.findFirst({
      where: { id: encounterId, tenantId },
      select: { id: true, clinicId: true, patientId: true, status: true, appointmentId: true },
    });
    if (!enc) throw new NotFoundException("Encounter not found");

    const receivable = await getEncounterVisitFeeReceivableSummary(this.prisma, tenantId, encounterId);
    if (!receivable) throw new BadRequestException("No visit fee balance due for this encounter");

    const apt = enc.appointmentId
      ? await this.prisma.appointment.findFirst({
          where: { id: enc.appointmentId, tenantId },
          select: { scheduledCollectionMode: true, scheduledTransferChannel: true },
        })
      : null;

    const { resolveTenantTransferCollectionContext } = await import("../common/market-transfer-context");
    const transferCtx = await resolveTenantTransferCollectionContext(this.prisma, this.featureFlags, tenantId);
    const collection = parseVisitCollectionForAmount(receivable.amount, visitCollectionInput, {
      allowedTransferChannels: transferCtx.allowedTransferChannels,
      paymentMethods: transferCtx.paymentMethods,
    });

    const needsReceipt =
      collection.collectionMode === VisitCollectionMode.MONEY_TRANSFER ||
      apt?.scheduledCollectionMode === VisitCollectionMode.MONEY_TRANSFER;
    if (needsReceipt && (!receiptFile || !receiptFile.buffer?.length)) {
      throw new BadRequestException(
        "Upload the transfer payment receipt (PDF or image) to mark this scheduled fee as collected.",
      );
    }

    let transferReceipt:
      | { relativePath: string; mimeType: string; originalFileName: string }
      | undefined;
    if (receiptFile?.buffer?.length) {
      const mime = receiptFile.mimetype?.trim() || "application/octet-stream";
      if (!RECEIPT_MIME.has(mime)) {
        throw new BadRequestException("Receipt must be a PDF or image (JPEG, PNG, WebP)");
      }
      const base =
        basename(receiptFile.originalname || "receipt").replace(/[^\w.\-]+/g, "_").slice(0, 120) || "receipt";
      const relativePath = `${tenantId}/${encounterId}/${randomUUID()}-${base}`;
      await this.uploads.put("revenue", relativePath, receiptFile.buffer, mime);
      transferReceipt = { relativePath, mimeType: mime, originalFileName: base };
    }

    const clinic = await this.prisma.clinic.findFirst({
      where: { id: enc.clinicId, tenantId },
      select: { taxRegistrationNumber: true, invoiceVatPercent: true, defaultCurrency: true },
    });

    let transferVerificationStatus: import("@prisma/client").TransferVerificationStatus | undefined;
    if (collection.transferChannel && collection.transferReference) {
      transferVerificationStatus = await resolveTransferVerification(
        collection.transferChannel,
        collection.transferReference,
        receivable.amount,
        receivable.currency,
        transferCtx.paymentMethods,
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const result = await collectEncounterVisitFeeBalance(tx, {
          tenantId,
          encounterId,
          collection,
          transferVerificationStatus,
          clinicTaxRin: clinic?.taxRegistrationNumber,
          vatPercent: Number(clinic?.invoiceVatPercent ?? 0),
          transferReceipt: transferReceipt ?? null,
        });
        return {
          ...result,
          currency: receivable.currency,
          encounterId,
          collectedByUserId: user.userId,
          message: needsReceipt
            ? "Transfer fee collected — receipt saved and visit fee posted."
            : undefined,
        };
      });
    } catch (err) {
      if (transferReceipt) {
        await this.uploads.deleteObject("revenue", transferReceipt.relativePath).catch(() => undefined);
      }
      if (err instanceof Error && err.message === "VISIT_BALANCE_ALREADY_COLLECTED") {
        throw new ConflictException("Visit balance was already collected");
      }
      throw err;
    }
  }

  private patientAlertFlags(patient: {
    allergies: unknown[];
    isVip: boolean;
    needsChaperone: boolean;
    requiresAppointmentDeposit: boolean;
  }) {
    const out: string[] = [];
    if (patient.allergies.length) out.push("ALLERGY");
    if (patient.isVip) out.push("VIP");
    if (patient.needsChaperone) out.push("CHAPERONE");
    if (patient.requiresAppointmentDeposit) out.push("DEPOSIT");
    return out;
  }
}
