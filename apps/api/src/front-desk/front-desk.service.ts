import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AppointmentStatus, Prisma, RevenueStatus } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";
import { PatientsService } from "../patients/patients.service";

@Injectable()
export class FrontDeskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patients: PatientsService,
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
    body: { paymentAmount?: number; roomLabel?: string; currency?: string },
  ) {
    const apt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      include: { patient: true, clinic: { select: { defaultCurrency: true, nameEn: true } } },
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

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          status: AppointmentStatus.CHECKED_IN,
          checkedInAt: now,
          queueTicketNumber: ticket,
          checkInPaymentAmount: pay != null ? new Prisma.Decimal(String(pay)) : null,
          roomLabel: body.roomLabel?.trim() || apt.roomLabel,
        },
        include: {
          patient: { select: { mrn: true, firstNameEn: true, lastNameEn: true, isVip: true, needsChaperone: true } },
          clinician: { select: { displayName: true } },
        },
      });
      if (pay != null) {
        const currency = body.currency?.trim() || apt.clinic.defaultCurrency || "AED";
        await tx.revenueEntry.create({
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
          },
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
    const roomLabels = Array.isArray(clinic.frontDeskRoomLabels)
      ? (clinic.frontDeskRoomLabels as string[])
      : ["Room 1", "Room 2", "Room 3"];

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const waiting = await this.prisma.appointment.findMany({
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
      },
    });

    const now = Date.now();
    const waitingRows = waiting.map((w) => ({
      appointmentId: w.id,
      ticketNumber: w.queueTicketNumber,
      patientName: `${w.patient.firstNameEn} ${w.patient.lastNameEn}`,
      patientMrn: w.patient.mrn,
      clinicianName: w.clinician.displayName,
      roomLabel: w.roomLabel,
      waitMinutes: w.checkedInAt ? Math.floor((now - w.checkedInAt.getTime()) / 60_000) : 0,
      calledAt: w.calledAt?.toISOString() ?? null,
      alerts: this.patientAlertFlags(w.patient),
    }));

    const occupiedRooms = new Set(waiting.filter((w) => w.roomLabel).map((w) => w.roomLabel!));
    const rooms = roomLabels.map((label) => ({
      label,
      free: !occupiedRooms.has(label),
    }));

    return {
      clinicId,
      clinicName: clinic.nameEn,
      lastCalledTicket: clinic.lastCalledTicketNumber,
      waiting: waitingRows,
      rooms,
      generatedAt: new Date().toISOString(),
    };
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
      await this.prisma.appointment.update({
        where: { id: apt.id },
        data: { calledAt: new Date() },
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
