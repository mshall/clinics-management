import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AppointmentStatus, ServiceLocation } from "@prisma/client";
import { AppointmentsService } from "../appointments/appointments.service";
import { AuditService } from "../audit/audit.service";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";
import { addMinutes } from "../common/appointment-scheduling";
import { mapEffectiveAppointmentType } from "../scheduling/appointment-type-rules";
import { encryptVisitAddress } from "./address-crypto";
import { HomeVisitRuleException } from "./home-visit.errors";
import { HomeVisitService } from "./home-visit.service";
import { homeFeeBreakdown } from "./home-visit-rules";
import { parseVisitAddress, VisitAddressError } from "./visit-address";

export type FrontDeskHomeBookingInput = {
  clinicId: string;
  patientId: string;
  clinicianId: string;
  appointmentTypeId: string;
  startsAt: string;
  visitAddress: unknown;
  /** The booker confirmed the address with the patient (phone / walk-in). Needed before the visit can be CONFIRMED. */
  addressConfirmed?: boolean;
  notes?: string;
  /** Internal (care plans): the visit is a follow-up of a plan whose first visit already passed the first-home-visit rule. */
  carePlanFollowUp?: boolean;
};

/** HVBK02 — the front desk books a home visit (phone or walk-in request) under the same rules as Kiorex bookings. */
@Injectable()
export class HomeVisitBookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly homeVisits: HomeVisitService,
    private readonly appointments: AppointmentsService,
    private readonly audit: AuditService,
  ) {}

  async bookFromFrontDesk(tenantId: string, actor: JwtUser, input: FrontDeskHomeBookingInput) {
    const type = await this.prisma.appointmentType.findFirst({ where: { id: input.appointmentTypeId, tenantId, isActive: true } });
    if (!type) throw new NotFoundException("Appointment type not found");
    if (type.serviceLocation !== ServiceLocation.HOME) throw new BadRequestException("This visit type is not a home visit type");
    const patient = await this.prisma.patient.findFirst({ where: { id: input.patientId, tenantId, deletedAt: null }, select: { id: true, gender: true } });
    if (!patient) throw new NotFoundException("Patient not found");
    const start = new Date(input.startsAt);
    if (Number.isNaN(start.getTime())) throw new BadRequestException("Invalid startsAt");
    const override = await this.prisma.clinicianAppointmentTypeOverride.findFirst({ where: { tenantId, clinicianId: input.clinicianId, appointmentTypeId: type.id } });
    const effective = mapEffectiveAppointmentType(type, override);
    const end = addMinutes(start, effective.durationMinutes);

    let address;
    try {
      address = parseVisitAddress(input.visitAddress, { requireLine1: true });
    } catch (e) {
      if (e instanceof VisitAddressError) throw new HomeVisitRuleException(e.code, e.message);
      throw e;
    }
    await this.homeVisits.assertBookable({
      tenantId,
      clinicId: input.clinicId,
      clinicianId: input.clinicianId,
      type,
      startsAt: start,
      endsAt: end,
      address,
      patient,
      source: "FRONT_DESK",
      skipFirstVisitRule: input.carePlanFollowUp === true,
    });

    const confirmed = input.addressConfirmed === true;
    const appt = await this.appointments.create(tenantId, actor, {
      clinicId: input.clinicId,
      patientId: input.patientId,
      clinicianId: input.clinicianId,
      appointmentTypeId: type.id,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      status: confirmed ? AppointmentStatus.CONFIRMED : AppointmentStatus.SCHEDULED,
      notes: input.notes,
    } as never);
    const surcharge = type.homeSurchargeAmount ? Number(type.homeSurchargeAmount) : null;
    try {
      const visit = await this.prisma.$transaction(async (tx) => {
        await tx.appointment.update({ where: { id: appt.id }, data: { serviceLocation: ServiceLocation.HOME, homeSurchargeAmount: type.homeSurchargeAmount } });
        return this.homeVisits.createForAppointment(tx, {
          tenantId,
          clinicId: input.clinicId,
          appointmentId: appt.id,
          patientId: input.patientId,
          clinicianId: input.clinicianId,
          startsAt: start,
          endsAt: end,
          address,
          addressCiphertext: encryptVisitAddress(address, tenantId),
          addressConfirmed: confirmed,
          appointmentConfirmed: confirmed,
          surcharge,
        });
      });
      await this.audit.recordEvent({ tenantId, actorId: actor.userId, clinicId: input.clinicId, action: "home_visit.booked", resource: "HomeVisit", resourceId: visit.id, metadata: { source: "FRONT_DESK", district: visit.districtId } });
      return { ...(await this.homeVisits.get(tenantId, actor, visit.id)), fee: homeFeeBreakdown(Number(appt.feeAmount ?? 0), surcharge) };
    } catch (e) {
      await this.prisma.appointment.delete({ where: { id: appt.id } }).catch(() => undefined); // compensate: no orphan appointment without its home visit
      throw e;
    }
  }
}
