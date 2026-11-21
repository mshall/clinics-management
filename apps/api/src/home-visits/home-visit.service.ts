import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { AppointmentStatus, Gender, HomeVisitState, Prisma, ServiceLocation, VerificationStatus, type AppointmentType, type HomeVisit } from "@prisma/client";
import { DateTime } from "luxon";
import { normalizeDistrictId, type PlannedVisit, type Viewer } from "@kiorly/field-visit";
import type { JwtUser } from "../auth/jwt-user";
import { AuditService } from "../audit/audit.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { PlanUpgradeRequiredException } from "../entitlements/plan-upgrade-required.exception";
import { FeatureFlagsService, requireFeature } from "../feature-flags/feature-flags-public";
import { FIELD_VISIT_PORT, type FieldVisitPort } from "../field-visit/field-visit.port";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { OUTBOX_EVENT_V23 } from "../messaging/outbox-event-types";
import { PrismaService } from "../prisma/prisma.service";
import { resolveClinicTimezone } from "../scheduling/clinic-scheduling-timezone";
import { effectiveProfession, ScopeOfPracticeService } from "../scope-of-practice/scope-of-practice.service";
import { effectiveVerificationStatus } from "../clinician-verification/profession-verification";
import { resolveProfessionPack, verificationBadgeFor } from "./verification-badge";
import { decryptVisitAddress, encryptVisitAddress } from "./address-crypto";
import { HOME_DISPATCH_FLAG, HOME_ROUTE_VIEW_FLAG, HOME_VISITS_FLAG, isHomeVisitDispatcher } from "./home-visit-config.service";
import { homeVisitAssignedData } from "./home-visit-events";
import { HomeVisitRuleException, OutOfCoverageException } from "./home-visit.errors";
import { checkFirstHomeVisit, checkGenderRestriction, homeFeeBreakdown, parseHomeHours, withinHomeHours } from "./home-visit-rules";
import { HomeVisitPrivacyService } from "./home-visit-privacy.service";
import { ROUTE_MAPS_PORT, type RouteMapsPort } from "./maps/route-maps.port";
import type { VisitAddress } from "./visit-address";
import { districtsFromMarket } from "../field-visit/field-visit.service";

export type HomeBookingCtx = {
  tenantId: string;
  clinicId: string;
  clinicianId: string;
  type: Pick<AppointmentType, "id" | "serviceLocation" | "depositAmount" | "homeSurchargeAmount" | "feeAmount">;
  startsAt: Date;
  endsAt: Date;
  address: VisitAddress;
  patient?: { id: string; gender: Gender } | null;
  source: "KIOREX" | "FRONT_DESK";
  /** Internal only (care-plan follow-ups after the first visit passed HVSAF03); never accepted from a client body. */
  skipFirstVisitRule?: boolean;
};

const LIVE_STATES: HomeVisitState[] = [HomeVisitState.REQUESTED, HomeVisitState.CONFIRMED, HomeVisitState.ON_MY_WAY, HomeVisitState.ARRIVED];

@Injectable()
export class HomeVisitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
    private readonly scope: ScopeOfPracticeService,
    @Inject(FIELD_VISIT_PORT) private readonly port: FieldVisitPort,
    @Inject(ROUTE_MAPS_PORT) private readonly maps: RouteMapsPort,
    private readonly privacy: HomeVisitPrivacyService,
    private readonly outbox: OutboxEventService,
    private readonly audit: AuditService,
    @Optional() private readonly entitlements?: EntitlementsService,
  ) {}

  /** Plan entitlement (KX-05 plans table): route view + travel planning = Pro+, dispatch = Clinic+. No entitlement service (unit tests) = entitled. */
  private async entitled(tenantId: string, key: "home_route_view" | "home_dispatch"): Promise<boolean> {
    return this.entitlements ? this.entitlements.isEntitled(tenantId, key) : true;
  }

  // ---- HVBK01/03/06 + HVSAF03 -------------------------------------------------------------------------------------

  private async settingsOf(tenantId: string, clinicianId: string) {
    return this.prisma.clinicianHomeSettings.findUnique({ where: { tenantId_clinicianId: { tenantId, clinicianId } } });
  }

  /** Coverage only (slot listing, holds, dispatch): 422 OUT_OF_COVERAGE when the district is outside the clinician's zone. */
  async assertCovered(tenantId: string, clinicianId: string, districtRaw: string | null | undefined) {
    const s = await this.settingsOf(tenantId, clinicianId);
    if (!s || !s.acceptsHomeVisits) throw new HomeVisitRuleException("HOME_VISITS_NOT_OFFERED", "This clinician does not offer home visits");
    const district = districtRaw ? normalizeDistrictId(districtRaw) : "";
    const zone = { districtIds: s.coverageDistrictIds, maxTravelMinutes: s.maxTravelMinutes, startDistrictId: s.startDistrictId };
    const res = this.port.checkCoverage(zone, { districtId: district }, this.maps.travelMatrix([...s.coverageDistrictIds, district, s.startDistrictId ?? ""]));
    if (!res.inZone) throw new OutOfCoverageException(district || null, res.reason, await this.alternativesFor(tenantId, clinicianId));
    return s;
  }

  /** In-zone alternatives offered with a 422 (other clinicians' districts are not leaked: only this clinician's own zone). */
  private async alternativesFor(tenantId: string, clinicianId: string): Promise<{ district: string }[]> {
    const s = await this.settingsOf(tenantId, clinicianId);
    return (s?.coverageDistrictIds ?? []).slice(0, 5).map((district) => ({ district }));
  }

  private async existingPlanned(tenantId: string, clinicianId: string, from: Date, to: Date, excludeAppointmentId?: string): Promise<PlannedVisit[]> {
    const rows = await this.prisma.homeVisit.findMany({
      where: {
        tenantId,
        clinicianId,
        state: { in: LIVE_STATES },
        plannedStartsAt: { gte: from, lt: to },
        ...(excludeAppointmentId ? { appointmentId: { not: excludeAppointmentId } } : {}),
      },
      select: { id: true, plannedStartsAt: true, plannedEndsAt: true, districtId: true },
    });
    return rows.map((r) => ({ id: r.id, startMs: r.plannedStartsAt.getTime(), endMs: r.plannedEndsAt.getTime(), districtId: r.districtId, buffers: { beforeMinutes: 0, afterMinutes: 0 } }));
  }

  /** All booking-time rules for a HOME visit. Throws the typed 403/422/409; resolves with what the caller needs to persist. */
  async assertBookable(ctx: HomeBookingCtx) {
    await requireFeature(this.flags, ctx.tenantId, HOME_VISITS_FLAG); // new home bookings are launch-locked; booked visits are honoured elsewhere
    await this.scope.assertCan(ctx.clinicianId, "home_visits.perform");
    const settings = await this.assertCovered(ctx.tenantId, ctx.clinicianId, ctx.address.district);
    const tz = await resolveClinicTimezone(this.prisma, ctx.tenantId, ctx.clinicId);

    if (ctx.patient) {
      const g = checkGenderRestriction(settings.restrictToPatientGender, ctx.patient.gender);
      if (!g.ok) throw new HomeVisitRuleException(g.code, g.message);
    }
    let hours;
    try {
      hours = parseHomeHours(settings.homeHoursJson);
    } catch {
      hours = null;
    }
    if (!withinHomeHours(hours, ctx.startsAt, ctx.endsAt, tz)) throw new HomeVisitRuleException("OUTSIDE_HOME_VISIT_HOURS", "Outside this clinician's home-visit hours");

    const dayStart = DateTime.fromJSDate(ctx.startsAt, { zone: tz }).startOf("day");
    const existing = await this.existingPlanned(ctx.tenantId, ctx.clinicianId, dayStart.minus({ hours: 12 }).toJSDate(), dayStart.plus({ days: 1, hours: 12 }).toJSDate());
    const check = this.port.canBookHomeSlot(
      { startMs: ctx.startsAt.getTime(), endMs: ctx.endsAt.getTime(), districtId: normalizeDistrictId(ctx.address.district), buffers: { beforeMinutes: 0, afterMinutes: 0 } },
      existing,
      {
        defaultBuffers: { beforeMinutes: 0, afterMinutes: 0 },
        dailyCap: settings.dailyVisitCap,
        dayKey: (ms) => DateTime.fromMillis(ms, { zone: tz }).toISODate()!,
        matrix: this.maps.travelMatrix([]),
      },
    );
    if (!check.ok) {
      if (check.reason === "OVERLAP") throw new ConflictException({ code: "SLOT_TAKEN", message: "Slot is not available" });
      if (check.reason === "DAILY_CAP") throw new HomeVisitRuleException("HOME_VISIT_DAILY_CAP_REACHED", "Daily home-visit cap reached");
      if (check.reason === "TRAVEL_INFEASIBLE") throw new HomeVisitRuleException("HOME_VISIT_TRAVEL_INFEASIBLE", "Not enough travel time between visits");
      throw new BadRequestException("Invalid visit interval");
    }

    if (ctx.patient && !ctx.skipFirstVisitRule) {
      const prior = await this.prisma.homeVisit.count({ where: { tenantId: ctx.tenantId, patientId: ctx.patient.id, state: { in: [HomeVisitState.ARRIVED, HomeVisitState.FINISHED] } } });
      const dep = ctx.type.depositAmount != null && Number(ctx.type.depositAmount) > 0;
      const first = checkFirstHomeVisit({ hasPriorAttendedHomeVisit: prior > 0, phoneVerifiedByKiorex: ctx.source === "KIOREX", depositRequired: dep });
      if (!first.ok) throw new HomeVisitRuleException(first.code, first.message);
    }
    return { settings, timezone: tz };
  }

  /** Slots for HOME: coverage first (422), then cap / hours / travel feasibility per slot. Slots carry serviceLocation + district. */
  async filterHomeSlots<S extends { startsAt: string; endsAt: string }>(input: { tenantId: string; clinicId: string; clinicianId: string; district: string; slots: S[] }) {
    await requireFeature(this.flags, input.tenantId, HOME_VISITS_FLAG);
    const settings = await this.assertCovered(input.tenantId, input.clinicianId, input.district);
    const tz = await resolveClinicTimezone(this.prisma, input.tenantId, input.clinicId);
    let hours;
    try {
      hours = parseHomeHours(settings.homeHoursJson);
    } catch {
      hours = null;
    }
    const district = normalizeDistrictId(input.district);
    const from = input.slots.length ? new Date(Math.min(...input.slots.map((s) => Date.parse(s.startsAt))) - 36 * 3600_000) : new Date();
    const to = input.slots.length ? new Date(Math.max(...input.slots.map((s) => Date.parse(s.endsAt))) + 36 * 3600_000) : new Date();
    const existing = await this.existingPlanned(input.tenantId, input.clinicianId, from, to);
    const opts = {
      defaultBuffers: { beforeMinutes: 0, afterMinutes: 0 },
      dailyCap: settings.dailyVisitCap,
      dayKey: (ms: number) => DateTime.fromMillis(ms, { zone: tz }).toISODate()!,
      matrix: this.maps.travelMatrix([]),
    };
    return input.slots
      .filter((s) => {
        const start = new Date(s.startsAt);
        const end = new Date(s.endsAt);
        if (!withinHomeHours(hours, start, end, tz)) return false;
        return this.port.canBookHomeSlot({ startMs: start.getTime(), endMs: end.getTime(), districtId: district, buffers: { beforeMinutes: 0, afterMinutes: 0 } }, existing, opts).ok;
      })
      .map((s) => ({ ...s, serviceLocation: "HOME" as const, district }));
  }

  /** HVBK03 — persist the home visit for an appointment (inside the booking transaction). The address is stored encrypted only. */
  async createForAppointment(
    tx: Pick<Prisma.TransactionClient, "homeVisit">,
    input: {
      tenantId: string;
      clinicId: string;
      appointmentId: string;
      patientId: string;
      clinicianId: string;
      startsAt: Date;
      endsAt: Date;
      address: VisitAddress | null;
      addressCiphertext?: string | null;
      addressConfirmed: boolean;
      appointmentConfirmed: boolean;
      surcharge?: number | null;
    },
  ): Promise<HomeVisit> {
    const district = input.address?.district ? normalizeDistrictId(input.address.district) : "";
    if (!district) throw new HomeVisitRuleException("VISIT_ADDRESS_REQUIRED", "visitAddress is required for HOME visit types");
    const ciphertext = input.addressCiphertext ?? (input.address ? encryptVisitAddress(input.address, input.tenantId) : null);
    return tx.homeVisit.create({
      data: {
        tenantId: input.tenantId,
        clinicId: input.clinicId,
        appointmentId: input.appointmentId,
        patientId: input.patientId,
        clinicianId: input.clinicianId,
        state: input.addressConfirmed && input.appointmentConfirmed ? HomeVisitState.CONFIRMED : HomeVisitState.REQUESTED,
        districtId: district,
        addressCiphertext: ciphertext,
        addressConfirmedAt: input.addressConfirmed ? new Date() : null,
        plannedStartsAt: input.startsAt,
        plannedEndsAt: input.endsAt,
        surchargeAmount: input.surcharge != null && input.surcharge > 0 ? new Prisma.Decimal(input.surcharge) : null,
      },
    });
  }

  // ---- reads (HVPRV01, HVEXE01) -----------------------------------------------------------------------------------

  viewerOf(user: JwtUser): Viewer {
    return { userId: user.userId, isOrgAdmin: isHomeVisitDispatcher(user) };
  }

  private async assertVisible(tenantId: string, user: JwtUser, v: HomeVisit): Promise<void> {
    if (isHomeVisitDispatcher(user) || v.clinicianId === user.userId) return;
    throw new ForbiddenException("This home visit is not assigned to you");
  }

  async serialize(user: JwtUser, v: HomeVisit & { appointment?: { feeAmount: Prisma.Decimal; homeSurchargeAmount: Prisma.Decimal | null; externalReference: string | null } | null; patient?: { id: string; firstNameEn: string; lastNameEn: string; phone: string } | null }, now = new Date()) {
    const viewer = this.viewerOf(user);
    const address = this.privacy.view(viewer, v, now);
    const visible = !address.masked;
    return {
      id: v.id,
      appointmentId: v.appointmentId,
      state: v.state,
      clinicianId: v.clinicianId,
      plannedStartsAt: v.plannedStartsAt.toISOString(),
      plannedEndsAt: v.plannedEndsAt.toISOString(),
      district: v.districtId,
      address,
      patient: v.patient
        ? { id: v.patient.id, name: `${v.patient.firstNameEn} ${v.patient.lastNameEn}`.trim(), ...(visible ? { phone: v.patient.phone } : {}) }
        : { id: v.patientId },
      enRouteAt: v.enRouteAt?.toISOString() ?? null,
      arrivedAt: v.arrivedAt?.toISOString() ?? null,
      // BR: arrival distance / off-site flag are for the dispatcher/owner only; never patient-facing, never blocks the arrival.
      ...(isHomeVisitDispatcher(user) && v.arrivedAt ? { arrivalDistanceM: v.arrivalDistanceM ?? null, arrivedOffSite: v.arrivedOffSite } : {}),
      finishedAt: v.finishedAt?.toISOString() ?? null,
      abortReason: v.abortReason ?? null,
      fee: v.appointment ? homeFeeBreakdown(Number(v.appointment.feeAmount), v.appointment.homeSurchargeAmount ? Number(v.appointment.homeSurchargeAmount) : null) : undefined,
      source: v.appointment?.externalReference ? "KIOREX" : "KIORLY",
      ...(v.state === HomeVisitState.ABORTED_UNSAFE ? { noShow: false } : {}),
    };
  }

  async get(tenantId: string, user: JwtUser, id: string) {
    const v = await this.prisma.homeVisit.findFirst({ where: { id, tenantId }, include: { appointment: { select: { feeAmount: true, homeSurchargeAmount: true, externalReference: true } } } });
    if (!v) throw new NotFoundException("Home visit not found");
    await this.assertVisible(tenantId, user, v);
    const patient = await this.prisma.patient.findFirst({ where: { id: v.patientId, tenantId }, select: { id: true, firstNameEn: true, lastNameEn: true, phone: true } });
    return this.serialize(user, { ...v, patient });
  }

  async list(tenantId: string, user: JwtUser, q: { from?: string; to?: string; state?: HomeVisitState; clinicianId?: string }) {
    const where: Prisma.HomeVisitWhereInput = { tenantId };
    if (!isHomeVisitDispatcher(user)) where.clinicianId = user.userId;
    else if (q.clinicianId) where.clinicianId = q.clinicianId;
    if (q.state) where.state = q.state;
    if (q.from || q.to) where.plannedStartsAt = { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) };
    const rows = await this.prisma.homeVisit.findMany({
      where,
      orderBy: { plannedStartsAt: "asc" },
      take: 200,
      include: { appointment: { select: { feeAmount: true, homeSurchargeAmount: true, externalReference: true } } },
    });
    const patients = await this.prisma.patient.findMany({ where: { tenantId, id: { in: [...new Set(rows.map((r) => r.patientId))] } }, select: { id: true, firstNameEn: true, lastNameEn: true, phone: true } });
    const byId = new Map(patients.map((p) => [p.id, p]));
    return { items: await Promise.all(rows.map((r) => this.serialize(user, { ...r, patient: byId.get(r.patientId) ?? null }))) };
  }

  /**
   * HVEXE01 "Today" route: the clinician's home visits in time order. With clinic.home_route_view ON the response adds
   * travel legs and a navigation link per visit (link only when the viewer may see the address); OFF = list view only.
   */
  async route(tenantId: string, user: JwtUser, q: { date?: string; clinicianId?: string }) {
    const clinic = await this.prisma.clinic.findFirst({ where: { tenantId }, select: { id: true } });
    const tz = clinic ? await resolveClinicTimezone(this.prisma, tenantId, clinic.id) : "UTC";
    const day = (q.date ? DateTime.fromISO(q.date, { zone: tz }) : DateTime.now().setZone(tz)).startOf("day");
    if (!day.isValid) throw new BadRequestException("Invalid date");
    const clinicianId = isHomeVisitDispatcher(user) ? q.clinicianId ?? user.userId : user.userId;
    const rows = await this.prisma.homeVisit.findMany({
      where: { tenantId, clinicianId, plannedStartsAt: { gte: day.toJSDate(), lt: day.plus({ days: 1 }).toJSDate() }, state: { notIn: [HomeVisitState.CANCELLED] } },
      orderBy: { plannedStartsAt: "asc" },
      include: { appointment: { select: { feeAmount: true, homeSurchargeAmount: true, externalReference: true } } },
    });
    const patients = await this.prisma.patient.findMany({ where: { tenantId, id: { in: [...new Set(rows.map((r) => r.patientId))] } }, select: { id: true, firstNameEn: true, lastNameEn: true, phone: true } });
    const byId = new Map(patients.map((p) => [p.id, p]));
    const items = await Promise.all(rows.map((r) => this.serialize(user, { ...r, patient: byId.get(r.patientId) ?? null })));
    const routeView = (await this.flags.evaluate(tenantId, HOME_ROUTE_VIEW_FLAG)).effective && (await this.entitled(tenantId, "home_route_view"));
    if (!routeView) return { date: day.toISODate(), view: "LIST" as const, items };
    const legs = this.maps.legs(rows.map((r) => ({ id: r.id, districtId: r.districtId })));
    const withLinks = items.map((it, i) => {
      const row = rows[i]!;
      const a = it.address;
      const url = !a.masked ? this.maps.navigationUrl({ lat: a.lat, lng: a.lng, query: [a.line1, a.building, a.district].filter(Boolean).join(" ") }) : null;
      const leg = legs.find((l) => l.toId === row.id);
      return { ...it, navigationUrl: url, travelMinutesFromPrevious: leg?.travelMinutes ?? null };
    });
    return { date: day.toISODate(), view: "ROUTE" as const, items: withLinks };
  }

  // ---- KNAG / dispatch ---------------------------------------------------------------------------------------------

  /** True when the clinician is VERIFIED for their CURRENT profession (PRVER): the dispatch guard; aides never pass (no home scope). */
  async isDispatchable(tenantId: string, clinicianId: string): Promise<{ ok: boolean; reason?: string }> {
    const u = await this.prisma.user.findFirst({
      where: { id: clinicianId, tenantId, deletedAt: null, deactivatedAt: null },
      select: { id: true, role: true, additionalRoles: true, profession: true, tenant: { select: { market: { select: { code: true, clinicalConfig: true } } } }, clinicianVerification: { select: { status: true, verifiedProfession: true } } },
    });
    if (!u) return { ok: false, reason: "CLINICIAN_NOT_FOUND" };
    const profession = effectiveProfession(u);
    if (!profession) return { ok: false, reason: "NOT_A_CLINICIAN" };
    const pack = resolveProfessionPack(u.tenant?.market);
    const status = effectiveVerificationStatus(u.clinicianVerification, profession, pack);
    if (status !== VerificationStatus.VERIFIED) return { ok: false, reason: "CLINICIAN_NOT_VERIFIED" };
    return { ok: true };
  }

  async assign(tenantId: string, actor: JwtUser, visitId: string, clinicianId: string, now = new Date()) {
    if (!isHomeVisitDispatcher(actor)) throw new ForbiddenException("Only a dispatcher or manager can assign home visits");
    const v = await this.prisma.homeVisit.findFirst({ where: { id: visitId, tenantId }, include: { appointment: { select: { clinicId: true, externalReference: true, platformIntegrationClientId: true } } } });
    if (!v) throw new NotFoundException("Home visit not found");
    if (v.state !== HomeVisitState.REQUESTED && v.state !== HomeVisitState.CONFIRMED) throw new HomeVisitRuleException("HOME_VISIT_NOT_REASSIGNABLE", "Only a visit that has not started can be (re)assigned", 409);

    const guard = await this.isDispatchable(tenantId, clinicianId);
    if (!guard.ok) throw new HomeVisitRuleException(guard.reason === "CLINICIAN_NOT_VERIFIED" ? "CLINICIAN_NOT_VERIFIED" : guard.reason!, "This clinician cannot be assigned home visits");
    await this.scope.assertCan(clinicianId, "home_visits.perform");
    await this.assertCovered(tenantId, clinicianId, v.districtId);
    const clash = await this.prisma.appointment.findFirst({
      where: { tenantId, clinicianId, id: { not: v.appointmentId }, status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED, AppointmentStatus.CHECKED_IN] }, startsAt: { lt: v.plannedEndsAt }, endsAt: { gt: v.plannedStartsAt } },
      select: { id: true },
    });
    if (clash) throw new ConflictException({ code: "CLINICIAN_BUSY", message: "The clinician has another appointment at this time" });

    await this.prisma.$transaction(async (tx) => {
      await tx.homeVisit.update({ where: { id: v.id }, data: { clinicianId, assignedById: actor.userId, assignedAt: now } });
      await tx.appointment.update({ where: { id: v.appointmentId }, data: { clinicianId } });
    });
    const clinician = await this.prisma.user.findFirst({
      where: { id: clinicianId, tenantId },
      select: { id: true, displayName: true, profession: true, role: true, additionalRoles: true, tenant: { select: { market: { select: { code: true, clinicalConfig: true } } } } },
    });
    if (v.appointment.platformIntegrationClientId) {
      const badge = clinician ? verificationBadgeFor(clinician) : null;
      await this.outbox.enqueueEvent({
        tenantId,
        type: OUTBOX_EVENT_V23.HOME_VISIT_ASSIGNED,
        aggregateType: "Appointment",
        aggregateId: v.appointmentId,
        // Display name, photo URL (none yet), badge and profession only: never a phone number, address or coordinates.
        payload: homeVisitAssignedData({
          appointmentId: v.appointmentId,
          clinicId: v.appointment.clinicId,
          externalReference: v.appointment.externalReference,
          clinicianId,
          displayName: clinician?.displayName ?? "Clinician",
          badge: badge?.labelEn ?? null,
          profession: clinician ? effectiveProfession(clinician) : null,
          assignedAt: now,
        }),
      });
    }
    await this.audit.recordEvent({ tenantId, actorId: actor.userId, clinicId: v.clinicId, action: "home_visit.assigned", resource: "HomeVisit", resourceId: v.id, metadata: { clinicianId } });
    return this.get(tenantId, actor, v.id);
  }

  /** KNAG02 + clinic.home_dispatch — rank clinicians: verified, in zone, free, gender-compatible; continuity with the patient first. */
  async suggest(tenantId: string, actor: JwtUser, visitId: string) {
    if (!isHomeVisitDispatcher(actor)) throw new ForbiddenException("Only a dispatcher or manager can dispatch home visits");
    await requireFeature(this.flags, tenantId, HOME_DISPATCH_FLAG);
    if (!(await this.entitled(tenantId, "home_dispatch"))) throw new PlanUpgradeRequiredException("home_dispatch", "CLINIC");
    const v = await this.prisma.homeVisit.findFirst({ where: { id: visitId, tenantId } });
    if (!v) throw new NotFoundException("Home visit not found");
    const patient = await this.prisma.patient.findFirst({ where: { id: v.patientId, tenantId }, select: { gender: true } });
    const candidates = await this.prisma.clinicianHomeSettings.findMany({ where: { tenantId, acceptsHomeVisits: true, coverageDistrictIds: { has: v.districtId } } });
    const dayStart = new Date(v.plannedStartsAt.getTime() - 12 * 3600_000);
    const out: { clinicianId: string; score: number; reasons: string[] }[] = [];
    for (const c of candidates) {
      const reasons: string[] = ["IN_ZONE"];
      let score = 10;
      if (!(await this.isDispatchable(tenantId, c.clinicianId)).ok) continue;
      if (patient && !checkGenderRestriction(c.restrictToPatientGender, patient.gender).ok) continue;
      const clash = await this.prisma.appointment.findFirst({
        where: { tenantId, clinicianId: c.clinicianId, id: { not: v.appointmentId }, status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED, AppointmentStatus.CHECKED_IN] }, startsAt: { lt: v.plannedEndsAt }, endsAt: { gt: v.plannedStartsAt } },
        select: { id: true },
      });
      if (clash) continue;
      const prior = await this.prisma.homeVisit.count({ where: { tenantId, patientId: v.patientId, clinicianId: c.clinicianId, state: HomeVisitState.FINISHED } });
      if (prior > 0) {
        score += 100;
        reasons.push("CONTINUITY");
      }
      const sameDay = await this.prisma.homeVisit.count({ where: { tenantId, clinicianId: c.clinicianId, state: { in: LIVE_STATES }, plannedStartsAt: { gte: dayStart, lt: new Date(v.plannedStartsAt.getTime() + 12 * 3600_000) } } });
      score -= sameDay;
      out.push({ clinicianId: c.clinicianId, score, reasons });
    }
    return { visitId, suggestions: out.sort((a, b) => b.score - a.score).slice(0, 5) };
  }

  /** The decrypted address for a REQUESTED/CONFIRMED visit snapshot — used only to hand over at "On my way". Never logged. */
  decryptFor(v: Pick<HomeVisit, "tenantId" | "addressCiphertext">): VisitAddress | null {
    return decryptVisitAddress(v.addressCiphertext, v.tenantId);
  }
}
