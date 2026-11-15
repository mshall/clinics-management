import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AppointmentQueueStage,
  AppointmentStatus,
  EncounterStatus,
  Prisma,
  RevenueStatus,
  VisitCollectionMode,
} from "@prisma/client";
import { collectionFieldsFromParsed, parseVisitCollectionForAmount, type VisitCollectionInput } from "../common/visit-collection";
import { resolveTransferVerification } from "../common/visit-collection-transfer";
import { queueEtaReceipt } from "../compliance/eta-receipt-queue";
import type { JwtUser } from "../auth/jwt-user";
import { parseFrontDeskRoomLabels } from "../common/front-desk-room-labels";
import { EncountersService } from "../encounters/encounters.service";
import { PrismaService } from "../prisma/prisma.service";
import { PatientsService } from "../patients/patients.service";
import { FrontDeskFlowService } from "./front-desk-flow.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";

@Injectable()
export class FrontDeskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patients: PatientsService,
    private readonly flow: FrontDeskFlowService,
    private readonly encounters: EncountersService,
    private readonly featureFlags: FeatureFlagsService,
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

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const maxTicket = await this.prisma.appointment.aggregate({
      where: {
        tenantId,
        clinicId: apt.clinicId,
        checkedInAt: { gte: dayStart, lt: dayEnd },
        queueTicketNumber: { not: null },
      },
      _max: { queueTicketNumber: true },
    });
    const ticket = (maxTicket._max.queueTicketNumber ?? 0) + 1;
    const now = new Date();
    const pay = body.paymentAmount != null && body.paymentAmount > 0 ? body.paymentAmount : null;
    const allowedTransfers = await this.featureFlags.allowedTransferChannels(tenantId);
    const collection =
      pay != null
        ? parseVisitCollectionForAmount(
            pay,
            body.visitCollection ?? { mode: VisitCollectionMode.CASH_ON_VISIT },
            { allowedTransferChannels: allowedTransfers },
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

    const currency = body.currency?.trim() || apt.clinic.defaultCurrency || "EGP";
    let transferVerificationStatus: import("@prisma/client").TransferVerificationStatus | undefined;
    if (pay != null && collection?.transferChannel && collection.transferReference) {
      transferVerificationStatus = await resolveTransferVerification(
        collection.transferChannel,
        collection.transferReference,
        pay,
        currency,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          status: AppointmentStatus.CHECKED_IN,
          checkedInAt: now,
          queueTicketNumber: ticket,
          checkInPaymentAmount: pay != null ? new Prisma.Decimal(String(pay)) : null,
          ...this.flow.applyCheckInQueueFields({
            preferredRoomLabel: body.roomLabel,
            existingPreferred: apt.preferredRoomLabel ?? apt.roomLabel,
          }),
          ...collectionPatch,
        },
        include: {
          patient: { select: { mrn: true, firstNameEn: true, lastNameEn: true, isVip: true, needsChaperone: true } },
          clinician: { select: { displayName: true } },
        },
      });
      if (pay != null && collection) {
        const revenue = await tx.revenueEntry.create({
          data: {
            tenantId,
            clinicId: apt.clinicId,
            appointmentId: apt.id,
            category: "VISIT",
            description: `Check-in payment · ticket #${ticket} · ${apt.patient.firstNameEn} ${apt.patient.lastNameEn}`,
            grossAmount: new Prisma.Decimal(String(pay)),
            taxAmount: new Prisma.Decimal("0"),
            netAmount: new Prisma.Decimal(String(pay)),
            currency,
            postedAt: now,
            status: RevenueStatus.POSTED,
            transferVerificationStatus,
            ...collectionFieldsFromParsed(collection),
          },
        });
        await queueEtaReceipt(tx, {
          tenantId,
          clinicId: apt.clinicId,
          patientId: apt.patientId,
          revenueEntryId: revenue.id,
          totalAmount: pay,
          currency,
          vatPercent: Number(apt.clinic.invoiceVatPercent ?? 0),
          description: revenue.description ?? "Check-in payment",
          clinicTaxRin: apt.clinic.taxRegistrationNumber,
          collectionMode: collection.collectionMode,
          transferChannel: collection.transferChannel,
          transferReference: collection.transferReference,
        });
      }
      return {
        appointmentId: updated.id,
        queueTicketNumber: ticket,
        checkedInAt: now.toISOString(),
        status: updated.status,
        patientMrn: updated.patient.mrn,
        clinicianName: updated.clinician.displayName,
        paymentRecorded: pay,
      };
    });
  }

  async clinicBoard(tenantId: string, clinicId: string) {
    const clinic = await this.prisma.clinic.findFirst({ where: { id: clinicId, tenantId } });
    if (!clinic) throw new NotFoundException("Clinic not found");
    const roomLabels = parseFrontDeskRoomLabels(clinic.frontDeskRoomLabels);

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const dayAppointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        clinicId,
        status: AppointmentStatus.CHECKED_IN,
        checkedInAt: { gte: dayStart },
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
    const apt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
    });
    if (!apt) throw new NotFoundException("Appointment not found");
    if (apt.status === AppointmentStatus.CANCELLED || apt.status === AppointmentStatus.COMPLETED) {
      throw new BadRequestException("Cannot start visit");
    }
    const existing = await this.prisma.encounter.findFirst({
      where: {
        tenantId,
        appointmentId,
        status: { in: [EncounterStatus.DRAFT, EncounterStatus.AMENDED] },
      },
      select: { id: true },
    });
    if (existing) return { encounterId: existing.id, alreadyOpen: true as const };

    const enc = await this.encounters.create(tenantId, user, {
      clinicId: apt.clinicId,
      patientId: apt.patientId,
      clinicianId: apt.clinicianId,
      appointmentId: apt.id,
      visitType: "Outpatient",
    });
    return { encounterId: enc.id, alreadyOpen: false as const };
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
