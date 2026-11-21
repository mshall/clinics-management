import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AppointmentStatus, HomeSafetyAlertKind, HomeVisitState, Prisma } from "@prisma/client";
import type { VisitEvent } from "@kiorly/field-visit";
import { AppointmentsService } from "../appointments/appointments.service";
import { AuditService } from "../audit/audit.service";
import type { JwtUser } from "../auth/jwt-user";
import { FIELD_VISIT_PORT, type FieldVisitPort } from "../field-visit/field-visit.port";
import { CommissionChargeService } from "../kiorex/commission-charge.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { OUTBOX_EVENT_V23 } from "../messaging/outbox-event-types";
import { PrismaService } from "../prisma/prisma.service";
import { abortCategoryFrom, homeVisitAbortedUnsafeData, homeVisitEnRouteData } from "./home-visit-events";
import { HomeVisitRuleException } from "./home-visit.errors";
import { arrivalCheck } from "./home-visit-rules";
import { HomeVisitSafetyService } from "./home-visit-safety.service";
import { HomeVisitService } from "./home-visit.service";

type Geo = { lat?: number; lng?: number };
const TRANSITION_STATUS: Record<string, number> = { ILLEGAL_TRANSITION: 409, ADDRESS_NOT_CONFIRMED: 422, GEOSTAMP_REQUIRED: 422, REASON_REQUIRED: 422, NO_SHOW_NOT_ALLOWED: 409 };

/**
 * HVEXE01-03 + HVSAF04: the field lifecycle (On my way · Arrived · Finished · Leave visit - unsafe). The state machine itself is the
 * `@kiorly/field-visit` package behind `FIELD_VISIT_PORT`. Execution endpoints are NEVER flag-gated: a visit that is booked is honoured
 * and its safety controls always work, even when `clinic.home_visits` is switched OFF (ADR-025).
 */
@Injectable()
export class HomeVisitExecService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FIELD_VISIT_PORT) private readonly port: FieldVisitPort,
    private readonly safety: HomeVisitSafetyService,
    private readonly homeVisits: HomeVisitService,
    private readonly appointments: AppointmentsService,
    private readonly commissions: CommissionChargeService,
    private readonly outbox: OutboxEventService,
    private readonly audit: AuditService,
  ) {}

  private async load(tenantId: string, user: JwtUser, id: string) {
    const v = await this.prisma.homeVisit.findFirst({
      where: { id, tenantId },
      include: { appointment: { select: { id: true, clinicId: true, status: true, externalReference: true, platformIntegrationClientId: true } }, geostamps: { orderBy: { recordedAt: "asc" } } },
    });
    if (!v) throw new NotFoundException("Home visit not found");
    // Field events belong to the assigned clinician only (not even admins): on-site safety facts must come from the person on site.
    if (v.clinicianId !== user.userId) throw new ForbiddenException("This home visit is not assigned to you");
    return v;
  }

  private fail(code: string): never {
    throw new HomeVisitRuleException(code, `Home visit transition refused: ${code}`, TRANSITION_STATUS[code] ?? 422);
  }

  /** Offline-queue replay: the visit is already in the target state for this (assigned) actor => 200 with the current visit, no event, no alert/push. */
  private async replayed(tenantId: string, user: JwtUser, v: { id: string; state: HomeVisitState }, target: HomeVisitState) {
    if (v.state !== target) return null;
    return { ...(await this.homeVisits.get(tenantId, user, v.id)), replayed: true as const };
  }

  private geoOf(g: Geo | undefined, district: string) {
    return g && g.lat != null && g.lng != null ? { lat: g.lat, lng: g.lng, districtId: district } : undefined;
  }

  /** Applies the package transition; returns the persisted pieces. Caller wraps side effects. */
  private plan(v: Awaited<ReturnType<HomeVisitExecService["load"]>>, event: VisitEvent, now: Date) {
    const { geostamps, appointment: _a, ...rest } = v;
    void _a;
    const fv = this.safety.toFieldVisit(rest, geostamps);
    const res = this.port.applyVisitEvent(fv, event, now.getTime());
    if (!res.ok) this.fail(res.code);
    return res.visit;
  }

  private stampData(tenantId: string, visitId: string, kind: string, last: { geostamp?: { lat: number; lng: number; districtId?: string } } | undefined, district: string, now: Date) {
    const g = last?.geostamp;
    return { tenantId, visitId, kind, lat: g?.lat ?? null, lng: g?.lng ?? null, districtId: g?.districtId ?? district, recordedAt: now };
  }

  async depart(tenantId: string, user: JwtUser, id: string, body: Geo & { etaMinutes?: number }, now = new Date()) {
    const v = await this.load(tenantId, user, id);
    const again = await this.replayed(tenantId, user, v, HomeVisitState.ON_MY_WAY);
    if (again) return again;
    const next = this.plan(v, { type: "DEPART", geostamp: this.geoOf(body, v.districtId) }, now);
    await this.prisma.$transaction(async (tx) => {
      await tx.homeVisit.update({ where: { id: v.id }, data: { state: HomeVisitState.ON_MY_WAY, enRouteAt: now } });
      await tx.homeVisitGeostamp.create({ data: this.stampData(tenantId, v.id, "ON_MY_WAY", next.history.at(-1), v.districtId, now) });
      if (v.appointment.platformIntegrationClientId) {
        await this.outbox.enqueueEvent(
          {
            tenantId,
            type: OUTBOX_EVENT_V23.HOME_VISIT_EN_ROUTE,
            aggregateType: "Appointment",
            aggregateId: v.appointmentId,
            payload: homeVisitEnRouteData({ appointmentId: v.appointmentId, clinicId: v.appointment.clinicId, externalReference: v.appointment.externalReference, enRouteAt: now, etaMinutes: body.etaMinutes }),
          },
          tx,
        );
      }
    });
    await this.audit.recordEvent({ tenantId, actorId: user.userId, clinicId: v.clinicId, action: "home_visit.en_route", resource: "HomeVisit", resourceId: v.id });
    return this.homeVisits.get(tenantId, user, id);
  }

  /** HVEXE02 — "Arrived" IS check-in: the appointment moves to CHECKED_IN through the normal flow (attendance + commission as in clinic). */
  async arrive(tenantId: string, user: JwtUser, id: string, body: Geo, now = new Date()) {
    const v = await this.load(tenantId, user, id);
    const again = await this.replayed(tenantId, user, v, HomeVisitState.ARRIVED);
    if (again) return again;
    const next = this.plan(v, { type: "ARRIVE", geostamp: body.lat != null && body.lng != null ? { lat: body.lat, lng: body.lng, districtId: v.districtId } : (undefined as never) }, now);
    if (v.appointment.status !== AppointmentStatus.CHECKED_IN && v.appointment.status !== AppointmentStatus.COMPLETED) {
      await this.appointments.updateStatus(tenantId, v.appointmentId, AppointmentStatus.CHECKED_IN, user);
    }
    // Non-blocking: poor GPS must never stop an arrival. The flag is for the dispatcher/owner only (no alert, nothing to the patient).
    const check = arrivalCheck(body, this.homeVisits.decryptFor(v));
    await this.prisma.$transaction(async (tx) => {
      await tx.homeVisit.update({ where: { id: v.id }, data: { state: HomeVisitState.ARRIVED, arrivedAt: now, safetyPromptSentAt: null, safetyAnsweredAt: null, arrivalDistanceM: check.arrivalDistanceM, arrivedOffSite: check.arrivedOffSite } });
      await tx.homeVisitGeostamp.create({ data: this.stampData(tenantId, v.id, "ARRIVED", next.history.at(-1), v.districtId, now) });
    });
    await this.audit.recordEvent({ tenantId, actorId: user.userId, clinicId: v.clinicId, action: "home_visit.arrived", resource: "HomeVisit", resourceId: v.id, metadata: { arrivalDistanceM: check.arrivalDistanceM, arrivedOffSite: check.arrivedOffSite } });
    return this.homeVisits.get(tenantId, user, id);
  }

  /** HVEXE02 — "Finished" = complete. The usual completion guards apply (an open encounter must be finalized first). */
  async finish(tenantId: string, user: JwtUser, id: string, body: Geo, now = new Date()) {
    const v = await this.load(tenantId, user, id);
    const again = await this.replayed(tenantId, user, v, HomeVisitState.FINISHED);
    if (again) return again;
    const next = this.plan(v, { type: "FINISH", geostamp: this.geoOf(body, v.districtId) }, now);
    if (v.appointment.status !== AppointmentStatus.COMPLETED) {
      await this.appointments.updateStatus(tenantId, v.appointmentId, AppointmentStatus.COMPLETED, user);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.homeVisit.update({ where: { id: v.id }, data: { state: HomeVisitState.FINISHED, finishedAt: now, endedAt: now } });
      await tx.homeVisitGeostamp.create({ data: this.stampData(tenantId, v.id, "FINISHED", next.history.at(-1), v.districtId, now) });
    });
    await this.audit.recordEvent({ tenantId, actorId: user.userId, clinicId: v.clinicId, action: "home_visit.finished", resource: "HomeVisit", resourceId: v.id });
    return this.homeVisits.get(tenantId, user, id);
  }

  /**
   * HVSAF04 (BR61) — "Leave visit - unsafe": ends the visit with a reason, NEVER a no-show, no penalty to the clinician, deposit held
   * for review (HOME_VISIT_ABORTED_UNSAFE says HOLD_FOR_REVIEW), incident logged for the owner, safety contact alerted.
   */
  async abortUnsafe(tenantId: string, user: JwtUser, id: string, body: Geo & { reason: string; reasonCategory?: string }, now = new Date()) {
    const v = await this.load(tenantId, user, id);
    const again = await this.replayed(tenantId, user, v, HomeVisitState.ABORTED_UNSAFE);
    if (again) return again;
    const next = this.plan(v, { type: "ABORT_UNSAFE", reason: body.reason, geostamp: this.geoOf(body, v.districtId) }, now);
    const intents: Awaited<ReturnType<CommissionChargeService["onCancelOrNoShow"]>>[] = [];
    await this.prisma.$transaction(async (tx) => {
      await tx.homeVisit.update({ where: { id: v.id }, data: { state: HomeVisitState.ABORTED_UNSAFE, endedAt: now, abortReason: body.reason.trim() } });
      await tx.homeVisitGeostamp.create({ data: this.stampData(tenantId, v.id, "ABORTED_UNSAFE", next.history.at(-1), v.districtId, now) });
      // Close the appointment WITHOUT the cancel/no-show outbox events: Kiorex must not refund or forfeit the deposit automatically.
      await tx.appointment.update({
        where: { id: v.appointmentId },
        data: { status: AppointmentStatus.CANCELLED, cancelledAt: now, cancelledBy: "SYSTEM_UNSAFE_ABORT", cancellationReason: "UNSAFE_ABORT", depositRefundable: null },
      });
      intents.push(await this.commissions.onCancelOrNoShow(tx, tenantId, v.appointmentId));
      if (v.appointment.platformIntegrationClientId) {
        await this.outbox.enqueueEvent(
          {
            tenantId,
            type: OUTBOX_EVENT_V23.HOME_VISIT_ABORTED_UNSAFE,
            aggregateType: "Appointment",
            aggregateId: v.appointmentId,
            payload: homeVisitAbortedUnsafeData({ appointmentId: v.appointmentId, clinicId: v.appointment.clinicId, externalReference: v.appointment.externalReference, abortedAt: now, reasonCategory: abortCategoryFrom(body.reasonCategory), district: v.districtId }),
          },
          tx,
        );
      }
      // Incident for the owner (the free-text reason stays in Kiorly; the audit row carries no address).
      await tx.clinicalIncident.create({
        data: {
          tenantId,
          clinicId: v.clinicId,
          reportedByUserId: user.userId,
          severity: "HIGH",
          summaryEn: `Home visit left as unsafe (visit ${v.id})`,
          summaryAr: `تم ترك زيارة منزلية لأسباب تتعلق بالسلامة (الزيارة ${v.id})`,
        },
      });
    });
    await this.commissions.applyCreditIntents(intents.filter((i): i is NonNullable<typeof i> => i != null));
    await this.audit.recordEvent({ tenantId, actorId: user.userId, clinicId: v.clinicId, action: "home_visit.aborted_unsafe", resource: "HomeVisit", resourceId: v.id, metadata: { noShow: false } });
    // Always tell the safety contact; delivery problems are logged/paged inside, never thrown at the clinician.
    await this.safety.raise(tenantId, v.id, HomeSafetyAlertKind.UNSAFE_ABORT, { now }).catch(() => undefined);
    return this.homeVisits.get(tenantId, user, id);
  }

  async sos(tenantId: string, user: JwtUser, id: string, body: { lat: number; lng: number }, now = new Date()) {
    const v = await this.load(tenantId, user, id);
    if (v.state !== HomeVisitState.ON_MY_WAY && v.state !== HomeVisitState.ARRIVED) throw new ConflictException({ code: "SOS_NOT_AVAILABLE", message: "SOS is available while on my way or on site" });
    if (!Number.isFinite(body.lat) || !Number.isFinite(body.lng)) this.fail("GEOSTAMP_REQUIRED");
    await this.prisma.homeVisitGeostamp.create({ data: { tenantId, visitId: v.id, kind: "SOS", lat: Math.round(body.lat * 100) / 100, lng: Math.round(body.lng * 100) / 100, districtId: v.districtId, recordedAt: now } });
    return this.safety.sos(tenantId, v.id, { lat: body.lat, lng: body.lng }, now);
  }

  async answerSafetyPrompt(tenantId: string, user: JwtUser, id: string, now = new Date()) {
    const v = await this.load(tenantId, user, id);
    await this.safety.answerPrompt(tenantId, v.id, now);
    return { ok: true };
  }
}
