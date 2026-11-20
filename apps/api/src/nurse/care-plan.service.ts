import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AppointmentStatus, Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { AppointmentsService } from "../appointments/appointments.service";
import { AuditService } from "../audit/audit.service";
import type { JwtUser } from "../auth/jwt-user";
import { FeatureFlagsService, requireFeature } from "../feature-flags/feature-flags-public";
import { HomeVisitBookingService } from "../home-visits/home-visit-booking.service";
import { HomeVisitRuleException } from "../home-visits/home-visit.errors";
import { carePlanConfirmedData, carePlanEndedData, type CarePlanEndReason } from "../home-visits/home-visit-events";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { OUTBOX_EVENT_V23 } from "../messaging/outbox-event-types";
import { PrismaService } from "../prisma/prisma.service";
import { SlotService } from "../scheduling/slot.service";
import { SLOT_CHANNEL } from "../scheduling/slot-channel";
import { resolveClinicTimezone } from "../scheduling/clinic-scheduling-timezone";
import { planVisitDates, type CarePlanItem } from "./care-plan-schedule";

export type CarePlanInput = {
  clinicId: string;
  patientId: string;
  nurseId: string;
  title: string;
  startDate: string; // YYYY-MM-DD, clinic-local
  items: CarePlanItem[];
  visitAddress: unknown;
  addressConfirmed?: boolean;
  servicePackageId?: string | null;
  requestRef?: string | null;
};

const LIVE: AppointmentStatus[] = [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED];

/** KNCP01-03 — care plan = services x frequency x duration; visits are real home visits through the slot engine and the HV booking rules. */
@Injectable()
export class CarePlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
    private readonly slots: SlotService,
    private readonly booking: HomeVisitBookingService,
    private readonly appointments: AppointmentsService,
    private readonly outbox: OutboxEventService,
    private readonly audit: AuditService,
  ) {}

  /** Generates the visits for [from, +items) starting at `sequenceStart`. Returns booked appointments and dates the slot engine could not serve. */
  private async generate(tenantId: string, actor: JwtUser, planId: string, input: Omit<CarePlanInput, "title" | "servicePackageId" | "requestRef">, sequenceStart: number) {
    const tz = await resolveClinicTimezone(this.prisma, tenantId, input.clinicId);
    const wanted = planVisitDates(input.items, input.startDate, tz);
    const booked: { appointmentId: string; startsAt: Date; endsAt: Date; sequence: number }[] = [];
    const unscheduled: { date: string; appointmentTypeId: string }[] = [];
    let seq = sequenceStart;
    for (const w of wanted) {
      const dayStart = DateTime.fromISO(w.date, { zone: tz }).startOf("day");
      const { slots } = await this.slots.getSlots({ tenantId, clinicId: input.clinicId, clinicianId: input.nurseId, typeId: w.appointmentTypeId, from: dayStart.toJSDate(), to: dayStart.plus({ days: 1 }).toJSDate(), channel: SLOT_CHANNEL.INTERNAL });
      const target = DateTime.fromISO(`${w.date}T${w.timeOfDay}`, { zone: tz }).toMillis();
      const pick = [...slots].filter((s) => Date.parse(s.startsAt) >= target - 60 * 60_000).sort((a, b) => Math.abs(Date.parse(a.startsAt) - target) - Math.abs(Date.parse(b.startsAt) - target))[0];
      if (!pick) {
        unscheduled.push({ date: w.date, appointmentTypeId: w.appointmentTypeId });
        continue;
      }
      try {
        const visit = await this.booking.bookFromFrontDesk(tenantId, actor, {
          clinicId: input.clinicId,
          patientId: input.patientId,
          clinicianId: input.nurseId,
          appointmentTypeId: w.appointmentTypeId,
          startsAt: pick.startsAt,
          visitAddress: input.visitAddress,
          addressConfirmed: input.addressConfirmed ?? true,
          carePlanFollowUp: seq > 1,
        });
        seq += 1;
        booked.push({ appointmentId: visit.appointmentId, startsAt: new Date(visit.plannedStartsAt), endsAt: new Date(visit.plannedEndsAt), sequence: seq - 1 });
      } catch (e) {
        // The FIRST visit must succeed (it carries the first-home-visit safeguards); later dates that fail are reported, not hidden.
        if (seq === 1 || (e instanceof HomeVisitRuleException && e.code === "FIRST_HOME_VISIT_REQUIRES_VERIFIED_PHONE_OR_DEPOSIT")) throw e;
        unscheduled.push({ date: w.date, appointmentTypeId: w.appointmentTypeId });
      }
    }
    await this.prisma.carePlanVisit.createMany({ data: booked.map((b) => ({ carePlanId: planId, appointmentId: b.appointmentId, sequence: b.sequence })) });
    return { booked, unscheduled };
  }

  async create(tenantId: string, actor: JwtUser, input: CarePlanInput) {
    await requireFeature(this.flags, tenantId, "nurse.care_plans"); // a NEW care plan is launch-locked (GKN1); active plans keep completing when OFF
    if (!input.title?.trim()) throw new BadRequestException("title is required");
    if (!input.items?.length) throw new BadRequestException("at least one service item is required");
    if (input.requestRef) {
      const dup = await this.prisma.carePlan.findUnique({ where: { requestRef: input.requestRef } });
      if (dup) return this.get(tenantId, dup.id);
    }
    const plan = await this.prisma.carePlan.create({
      data: { tenantId, clinicId: input.clinicId, patientId: input.patientId, nurseId: input.nurseId, title: input.title.trim(), startDate: new Date(input.startDate), itemsJson: input.items as unknown as Prisma.InputJsonValue, servicePackageId: input.servicePackageId ?? null, requestRef: input.requestRef ?? null, createdById: actor.userId },
    });
    try {
      const { booked, unscheduled } = await this.generate(tenantId, actor, plan.id, input, 1);
      await this.prisma.carePlan.update({ where: { id: plan.id }, data: { visitsTotal: booked.length } });
      if (plan.requestRef && booked.length) {
        await this.outbox.enqueueEvent({
          tenantId,
          type: OUTBOX_EVENT_V23.CARE_PLAN_CONFIRMED,
          aggregateType: "CarePlan",
          aggregateId: plan.id,
          payload: carePlanConfirmedData({ carePlanId: plan.id, clinicId: input.clinicId, requestRef: plan.requestRef, confirmedAt: new Date(), visits: booked }),
        });
      }
      await this.audit.recordEvent({ tenantId, actorId: actor.userId, clinicId: input.clinicId, action: "care_plan.created", resource: "CarePlan", resourceId: plan.id, metadata: { visits: booked.length, unscheduled: unscheduled.length } });
      return { ...(await this.get(tenantId, plan.id)), unscheduled };
    } catch (e) {
      await this.prisma.carePlan.delete({ where: { id: plan.id } }).catch(() => undefined);
      throw e;
    }
  }

  async get(tenantId: string, id: string) {
    const p = await this.prisma.carePlan.findFirst({ where: { id, tenantId }, include: { visits: { orderBy: { sequence: "asc" } } } });
    if (!p) throw new NotFoundException("Care plan not found");
    const appts = await this.prisma.appointment.findMany({ where: { id: { in: p.visits.map((v) => v.appointmentId) } }, select: { id: true, startsAt: true, status: true } });
    const byId = new Map(appts.map((a) => [a.id, a]));
    const done = appts.filter((a) => a.status === AppointmentStatus.COMPLETED).length;
    return {
      id: p.id,
      title: p.title,
      status: p.status,
      patientId: p.patientId,
      nurseId: p.nurseId,
      startDate: p.startDate.toISOString().slice(0, 10),
      items: p.itemsJson,
      visitsTotal: p.visitsTotal,
      visitsDone: done,
      /** KNCP02 — remaining-visit counter. */
      visitsRemaining: Math.max(0, p.visitsTotal - done),
      servicePackageId: p.servicePackageId,
      endedAt: p.endedAt?.toISOString() ?? null,
      dischargeNote: p.dischargeNote ?? null,
      visits: p.visits.map((v) => ({ sequence: v.sequence, appointmentId: v.appointmentId, startsAt: byId.get(v.appointmentId)?.startsAt.toISOString() ?? null, status: byId.get(v.appointmentId)?.status ?? null })),
    };
  }

  async list(tenantId: string, q: { patientId?: string; status?: string }) {
    const rows = await this.prisma.carePlan.findMany({ where: { tenantId, ...(q.patientId ? { patientId: q.patientId } : {}), ...(q.status ? { status: q.status } : {}) }, orderBy: { createdAt: "desc" }, take: 100 });
    return { items: await Promise.all(rows.map((r) => this.get(tenantId, r.id))) };
  }

  private async futureLive(tenantId: string, planId: string, now = new Date()) {
    const links = await this.prisma.carePlanVisit.findMany({ where: { carePlanId: planId } });
    return this.prisma.appointment.findMany({ where: { tenantId, id: { in: links.map((l) => l.appointmentId) }, status: { in: LIVE }, startsAt: { gt: now } }, select: { id: true } });
  }

  private async cancelFuture(tenantId: string, actor: JwtUser, planId: string): Promise<string[]> {
    const future = await this.futureLive(tenantId, planId);
    const ids: string[] = [];
    for (const a of future) {
      await this.appointments.updateStatus(tenantId, a.id, AppointmentStatus.CANCELLED, actor, "Care plan changed");
      ids.push(a.id);
    }
    return ids;
  }

  /** KNCP03 — pause: future visits are released (slots free up); resume regenerates them. */
  async pause(tenantId: string, actor: JwtUser, id: string) {
    const p = await this.mustHave(tenantId, id, "ACTIVE");
    const ids = await this.cancelFuture(tenantId, actor, p.id);
    await this.prisma.carePlan.update({ where: { id }, data: { status: "PAUSED" } });
    return { ...(await this.get(tenantId, id)), cancelledAppointmentIds: ids };
  }

  async resume(tenantId: string, actor: JwtUser, id: string, body: { startDate: string; visitAddress: unknown }) {
    const p = await this.mustHave(tenantId, id, "PAUSED");
    const items = p.itemsJson as unknown as CarePlanItem[];
    const done = await this.prisma.carePlanVisit.count({ where: { carePlanId: id } });
    const { booked, unscheduled } = await this.generate(tenantId, actor, id, { clinicId: p.clinicId, patientId: p.patientId, nurseId: p.nurseId!, startDate: body.startDate, items, visitAddress: body.visitAddress, addressConfirmed: true }, done + 1);
    await this.prisma.carePlan.update({ where: { id }, data: { status: "ACTIVE", visitsTotal: p.visitsTotal + booked.length } });
    return { ...(await this.get(tenantId, id)), unscheduled };
  }

  /** KNCP03 — extend: more days of the same items (a new, later date window). */
  async extend(tenantId: string, actor: JwtUser, id: string, body: { startDate: string; extraDays: number; visitAddress: unknown }) {
    const p = await this.mustHave(tenantId, id, "ACTIVE");
    if (!Number.isInteger(body.extraDays) || body.extraDays < 1 || body.extraDays > 180) throw new BadRequestException("extraDays must be 1..180");
    const items = (p.itemsJson as unknown as CarePlanItem[]).map((i) => ({ ...i, durationDays: body.extraDays }));
    const count = await this.prisma.carePlanVisit.count({ where: { carePlanId: id } });
    const { booked, unscheduled } = await this.generate(tenantId, actor, id, { clinicId: p.clinicId, patientId: p.patientId, nurseId: p.nurseId!, startDate: body.startDate, items, visitAddress: body.visitAddress, addressConfirmed: true }, count + 1);
    await this.prisma.carePlan.update({ where: { id }, data: { visitsTotal: p.visitsTotal + booked.length } });
    return { ...(await this.get(tenantId, id)), unscheduled };
  }

  /** KNCP03 — end with a discharge note; future visits are released; CARE_PLAN_ENDED goes to Kiorex for Kiorex-originated plans. */
  async end(tenantId: string, actor: JwtUser, id: string, body: { reason: CarePlanEndReason; dischargeNote: string }) {
    const p = await this.prisma.carePlan.findFirst({ where: { id, tenantId } });
    if (!p) throw new NotFoundException("Care plan not found");
    if (p.status === "ENDED") throw new ConflictException({ code: "CARE_PLAN_ALREADY_ENDED", message: "The care plan has ended" });
    if (!body.dischargeNote?.trim()) throw new BadRequestException("A discharge note is required to end a care plan");
    if (!["COMPLETED", "CANCELLED_BY_PATIENT", "CANCELLED_BY_PROVIDER", "EXPIRED"].includes(body.reason)) throw new BadRequestException("Invalid reason");
    const cancelled = await this.cancelFuture(tenantId, actor, id);
    const view = await this.get(tenantId, id);
    const endedAt = new Date();
    await this.prisma.carePlan.update({ where: { id }, data: { status: "ENDED", endedAt, dischargeNote: body.dischargeNote.trim() } });
    if (p.requestRef) {
      await this.outbox.enqueueEvent({ tenantId, type: OUTBOX_EVENT_V23.CARE_PLAN_ENDED, aggregateType: "CarePlan", aggregateId: id, payload: carePlanEndedData({ carePlanId: id, clinicId: p.clinicId, requestRef: p.requestRef, endedAt, reason: body.reason, visitsCompleted: view.visitsDone, cancelledAppointmentIds: cancelled }) });
    }
    return { ...(await this.get(tenantId, id)), cancelledAppointmentIds: cancelled };
  }

  /** KNCP03 — the discharge record reaches the patient's Kiorex vault only with the patient's VISIT_SUMMARY consent. */
  async shareDischarge(tenantId: string, id: string) {
    const p = await this.prisma.carePlan.findFirst({ where: { id, tenantId } });
    if (!p) throw new NotFoundException("Care plan not found");
    if (p.status !== "ENDED") throw new ConflictException({ code: "CARE_PLAN_NOT_ENDED", message: "Only an ended care plan has a discharge record" });
    const consent = await this.prisma.patientRecordShareConsent.findFirst({ where: { tenantId, patientId: p.patientId, scope: "VISIT_SUMMARY", granted: true, revokedAt: null } });
    if (!consent) throw new ForbiddenException({ code: "CONSENT_REQUIRED", message: "The patient has not consented to share visit summaries" });
    await this.prisma.carePlan.update({ where: { id }, data: { sharedToVaultAt: new Date() } });
    await this.outbox.enqueueEvent({ tenantId, type: "VISIT_SUMMARY_SHARED", aggregateType: "CarePlan", aggregateId: id, payload: { carePlanId: id, patientId: p.patientId, kind: "CARE_PLAN_DISCHARGE" } });
    return { shared: true };
  }

  private async mustHave(tenantId: string, id: string, status: string) {
    const p = await this.prisma.carePlan.findFirst({ where: { id, tenantId } });
    if (!p) throw new NotFoundException("Care plan not found");
    if (p.status !== status) throw new ConflictException({ code: "CARE_PLAN_STATE", message: `Care plan is ${p.status}` });
    return p;
  }
}
