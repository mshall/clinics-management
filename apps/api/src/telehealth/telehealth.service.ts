import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, Optional, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { AppointmentStatus, Prisma, ServiceLocation, TelehealthMode, TelehealthRole, TelehealthSessionStatus, TelehealthSignalType, UserRole } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { JwtUser } from "../auth/jwt-user";
import { AppointmentsService } from "../appointments/appointments.service";
import { CLINIC_SCOPE_ROLES } from "../common/clinic-scope";
import { hasAnyRole, hasAnyRoleInSet, hasRole } from "../common/effective-roles";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { PrismaService } from "../prisma/prisma.service";
import { NavTabAccessService } from "../user-nav-tabs/nav-tab-access.service";
import { APPOINTMENTS_MUTATE_ROLES, APPOINTMENTS_VIEW_ROLES } from "../user-nav-tabs/nav-tab-module-roles";
import { assertTelehealthBookable, isTelehealthEnabled } from "./telehealth-availability";
import { enqueueTelehealthEvent, telehealthBlock, telehealthEndedData, telehealthMissedData, telehealthStartedData, TELEHEALTH_EVENT } from "./telehealth-events";
import { registerTelehealthChangedHandler } from "./telehealth-hooks";
import { ensureTelehealthSession } from "./telehealth-sync";
import { patientJoinUrl, verifyTelehealthToken } from "./telehealth-token";
import { attendanceThresholdMs, isPastNoShowDeadline, joinWindow, PRESENCE_TTL_MS, windowState, type JoinWindow } from "./telehealth-window";
import { TelehealthException } from "./telehealth.errors";
import { SIGNALING_TRANSPORT, type SignalingTransport } from "./signaling/signaling-transport";
import { VIDEO_PROVIDER, type VideoProvider } from "./video/video-provider";
import { TelehealthNotifier } from "./telehealth-notifier.service";

const sessionInclude = {
  appointment: {
    select: {
      id: true, tenantId: true, clinicId: true, patientId: true, clinicianId: true, startsAt: true, endsAt: true, status: true, serviceLocation: true,
      externalReference: true, bookingSource: true, platformIntegrationClientId: true, notes: true,
      patient: { select: { firstNameEn: true, lastNameEn: true, firstNameAr: true } },
      clinic: { select: { nameEn: true, nameAr: true, timezone: true } },
      clinician: { select: { displayName: true } },
    },
  },
} satisfies Prisma.TelehealthSessionInclude;
export type SessionRow = Prisma.TelehealthSessionGetPayload<{ include: typeof sessionInclude }>;

export type Principal = { role: TelehealthRole; actor?: JwtUser };
const SIGNAL_TYPES: readonly string[] = Object.values(TelehealthSignalType);
const MAX_SIGNAL_BYTES = 16_000;

@Injectable()
export class TelehealthService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(TelehealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly appointments: AppointmentsService,
    private readonly navTabs: NavTabAccessService,
    private readonly flags: FeatureFlagsService,
    private readonly entitlements: EntitlementsService,
    @Inject(VIDEO_PROVIDER) private readonly video: VideoProvider,
    @Inject(SIGNALING_TRANSPORT) private readonly signaling: SignalingTransport,
    @Optional() private readonly notifier?: TelehealthNotifier,
  ) {}

  onModuleInit(): void {
    registerTelehealthChangedHandler(async (tenantId, appointmentId) => {
      const s = await this.prisma.telehealthSession.findFirst({ where: { tenantId, appointmentId }, select: { id: true } });
      if (s) await this.notifier?.sessionChanged(s.id);
    });
  }
  onModuleDestroy(): void {
    registerTelehealthChangedHandler(null);
  }

  // ---------------------------------------------------------------- loading + authz

  private async load(id: string, tenantId?: string): Promise<SessionRow> {
    const s = await this.prisma.telehealthSession.findFirst({ where: { id, ...(tenantId ? { tenantId } : {}) }, include: sessionInclude });
    if (!s) throw new TelehealthException("TELEHEALTH_NOT_FOUND");
    return s;
  }

  private async deny(tenantId: string, actor: JwtUser | undefined, sessionId: string, why: string): Promise<never> {
    await this.audit
      .recordEvent({ tenantId, actorId: actor?.userId ?? null, clinicId: null, action: "telehealth.authz_denied", resource: "TelehealthSession", resourceId: sessionId, metadata: { why } })
      .catch(() => undefined);
    throw new TelehealthException("TELEHEALTH_FORBIDDEN");
  }

  /** need: "clinician" = only the CURRENT clinician (media + signaling); "mutate"/"view" = staff with the appointments tab (clinician implied). */
  async authorizeStaff(actor: JwtUser, session: SessionRow, need: "clinician" | "mutate" | "view"): Promise<void> {
    if (!actor.tenantId || actor.tenantId !== session.tenantId) return this.deny(session.tenantId, actor, session.id, "tenant");
    const isClinician = session.clinicianUserId === actor.userId;
    if (need === "clinician") {
      if (!isClinician) return this.deny(session.tenantId, actor, session.id, "not_current_clinician");
      return;
    }
    if (isClinician) return;
    if (hasRole(actor, UserRole.PHYSICIAN)) return this.deny(session.tenantId, actor, session.id, "physician_not_assigned");
    try {
      if (need === "mutate") await this.navTabs.assertMutateTab(actor, "appointments", APPOINTMENTS_MUTATE_ROLES, "no access");
      else await this.navTabs.assertViewTab(actor, "appointments", APPOINTMENTS_VIEW_ROLES, "no access");
    } catch {
      return this.deny(session.tenantId, actor, session.id, "nav_tab");
    }
    if (hasAnyRoleInSet(actor, CLINIC_SCOPE_ROLES)) {
      const ok = await this.prisma.clinicAdminScope.findFirst({ where: { tenantId: session.tenantId, userId: actor.userId, clinicId: session.clinicId } });
      if (!ok) return this.deny(session.tenantId, actor, session.id, "clinic_scope");
    }
  }

  private async resolvePatient(token: string): Promise<SessionRow> {
    const claims = verifyTelehealthToken(token);
    if (!claims) throw new TelehealthException("TELEHEALTH_LINK_INVALID");
    const s = await this.prisma.telehealthSession.findUnique({ where: { id: claims.s }, include: sessionInclude });
    if (!s || s.patientId !== claims.p) throw new TelehealthException("TELEHEALTH_LINK_INVALID");
    if (s.linkVersion !== claims.v) {
      await this.audit.recordEvent({ tenantId: s.tenantId, actorId: null, clinicId: s.clinicId, action: "telehealth.authz_denied", resource: "TelehealthSession", resourceId: s.id, metadata: { why: "link_version_mismatch" } }).catch(() => undefined);
      throw new TelehealthException("TELEHEALTH_LINK_REVOKED");
    }
    return s;
  }

  // ---------------------------------------------------------------- state helpers

  windowOf(s: SessionRow): JoinWindow {
    return joinWindow(s.appointment.startsAt, s.appointment.endsAt);
  }

  /** Throws the right coded error for a session that cannot be joined; returns normally when the room may be entered. */
  private assertJoinable(s: SessionRow, now: Date): void {
    if (s.status === TelehealthSessionStatus.CANCELLED) {
      throw new TelehealthException(s.endReason === "CONVERTED_IN_PERSON" ? "TELEHEALTH_CONVERTED_IN_PERSON" : "TELEHEALTH_CANCELLED");
    }
    if (s.appointment.serviceLocation !== ServiceLocation.VIDEO) throw new TelehealthException("TELEHEALTH_CONVERTED_IN_PERSON");
    if (s.appointment.status === AppointmentStatus.CANCELLED) throw new TelehealthException("TELEHEALTH_CANCELLED");
    if (s.status === TelehealthSessionStatus.ENDED) throw new TelehealthException("TELEHEALTH_ENDED");
    if (s.status === TelehealthSessionStatus.MISSED && !s.needsStaffReview) throw new TelehealthException("TELEHEALTH_MISSED");
    const w = this.windowOf(s);
    const st = windowState(now, w);
    if (st === "TOO_EARLY") throw new TelehealthException("TELEHEALTH_TOO_EARLY", { opensAt: w.opensAt.toISOString(), startsAt: s.appointment.startsAt.toISOString() });
    if (st === "EXPIRED") throw new TelehealthException("TELEHEALTH_EXPIRED");
  }

  /** Prepayment gate: the patient cannot enter while a required deposit is still unpaid; the clinician can always open the room. */
  private async assertPaid(s: SessionRow): Promise<void> {
    const dep = await this.prisma.patientDeposit.findFirst({ where: { tenantId: s.tenantId, appointmentId: s.appointmentId }, orderBy: { createdAt: "desc" }, select: { status: true } });
    if (dep?.status === "PENDING") throw new TelehealthException("PAYMENT_REQUIRED");
  }

  private statusView(s: SessionRow, now: Date) {
    const w = this.windowOf(s);
    return {
      id: s.id, appointmentId: s.appointmentId, status: s.status, mode: s.mode, linkVersion: s.linkVersion,
      startsAt: s.appointment.startsAt.toISOString(), endsAt: s.appointment.endsAt?.toISOString() ?? null,
      opensAt: w.opensAt.toISOString(), closesAt: w.closesAt.toISOString(), windowState: windowState(now, w),
      needsStaffReview: s.needsStaffReview, attended: s.attendedAt != null,
      clinicianJoinedAt: s.clinicianJoinedAt?.toISOString() ?? null, patientJoinedAt: s.patientJoinedAt?.toISOString() ?? null,
    };
  }

  // ---------------------------------------------------------------- staff API

  /** POST /telehealth/appointments/:appointmentId/session */
  async createForAppointment(actor: JwtUser, appointmentId: string) {
    const tenantId = actor.tenantId!;
    const apt = await this.prisma.appointment.findFirst({ where: { id: appointmentId, tenantId } });
    if (!apt) throw new NotFoundException("Appointment not found");
    if (hasRole(actor, UserRole.PHYSICIAN) && apt.clinicianId !== actor.userId) throw new ForbiddenException("You can only access appointments where you are the clinician");
    try {
      await this.navTabs.assertMutateTab(actor, "appointments", APPOINTMENTS_MUTATE_ROLES, "no access");
    } catch {
      throw new ForbiddenException("You do not have permission to change appointments");
    }
    await assertTelehealthBookable({ prisma: this.prisma, flags: this.flags, entitlements: this.entitlements }, tenantId, apt.clinicianId);
    if (apt.serviceLocation !== ServiceLocation.VIDEO) throw new BadRequestException("Only telehealth appointments have a session; change the visit type first");
    const r = await this.prisma.$transaction((tx) => ensureTelehealthSession(tx, apt, actor.userId));
    if (r.created) {
      await this.audit.recordEvent({ tenantId, actorId: actor.userId, clinicId: apt.clinicId, action: "telehealth.session.created", resource: "TelehealthSession", resourceId: r.id });
      void this.notifier?.sessionChanged(r.id).catch(() => undefined);
    }
    return this.getForStaff(actor, r.id);
  }

  async getForStaff(actor: JwtUser, id: string) {
    const s = await this.load(id, actor.tenantId ?? "-");
    await this.authorizeStaff(actor, s, "view");
    const now = new Date();
    const canLink = !hasRole(actor, UserRole.PHYSICIAN) || s.clinicianUserId === actor.userId;
    return {
      ...this.statusView(s, now),
      enabled: await isTelehealthEnabled(this.flags, this.entitlements, s.tenantId),
      isCurrentClinician: s.clinicianUserId === actor.userId,
      patientName: `${s.appointment.patient.firstNameEn} ${s.appointment.patient.lastNameEn}`.trim(),
      patientId: s.patientId, clinicianId: s.clinicianUserId, clinicId: s.clinicId,
      timezone: s.appointment.clinic.timezone,
      ...(canLink ? { joinUrl: patientJoinUrl(s) } : {}),
    };
  }

  async getByAppointmentForStaff(actor: JwtUser, appointmentId: string) {
    const s = await this.prisma.telehealthSession.findFirst({ where: { appointmentId, tenantId: actor.tenantId ?? "-" }, select: { id: true } });
    if (!s) throw new NotFoundException("No telehealth session for this appointment");
    return this.getForStaff(actor, s.id);
  }

  async joinAsClinician(actor: JwtUser, id: string) {
    const s = await this.load(id, actor.tenantId ?? "-");
    await this.authorizeStaff(actor, s, "clinician");
    return this.join(s, TelehealthRole.CLINICIAN, actor);
  }

  async joinAsPatient(token: string) {
    const s = await this.resolvePatient(token);
    await this.assertPaid(s);
    return this.join(s, TelehealthRole.PATIENT);
  }

  private async join(s: SessionRow, role: TelehealthRole, actor?: JwtUser) {
    const now = new Date();
    this.assertJoinable(s, now);
    const first = role === TelehealthRole.CLINICIAN ? s.clinicianJoinedAt == null : s.patientJoinedAt == null;
    const data: Prisma.TelehealthSessionUpdateInput =
      role === TelehealthRole.CLINICIAN
        ? { clinicianLastSeenAt: now, ...(first ? { clinicianJoinedAt: now } : {}) }
        : { patientLastSeenAt: now, ...(first ? { patientJoinedAt: now } : {}) };
    if (s.status === TelehealthSessionStatus.SCHEDULED || s.status === TelehealthSessionStatus.MISSED) {
      data.status = TelehealthSessionStatus.WAITING;
      if (s.status === TelehealthSessionStatus.MISSED) Object.assign(data, { needsStaffReview: false, missedAt: null });
    }
    await this.prisma.telehealthSession.update({ where: { id: s.id }, data });
    await this.audit
      .recordEvent({ tenantId: s.tenantId, actorId: actor?.userId ?? null, clinicId: s.clinicId, action: "telehealth.session.joined", resource: "TelehealthSession", resourceId: s.id, metadata: { role } })
      .catch(() => undefined);
    if (role === TelehealthRole.PATIENT && first) void this.notifier?.patientJoined(s.id).catch(() => undefined);
    const w = this.windowOf(s);
    const ice = await this.video.prepareJoin({ sessionId: s.id, role, remainingWindowSeconds: Math.max(0, Math.round((w.closesAt.getTime() - now.getTime()) / 1000)) });
    const fresh = await this.load(s.id);
    const peerSeen = role === TelehealthRole.CLINICIAN ? fresh.patientLastSeenAt : fresh.clinicianLastSeenAt;
    return {
      role,
      sessionId: s.id,
      sessionStatus: fresh.status,
      mode: fresh.mode,
      peerJoined: peerSeen != null && now.getTime() - peerSeen.getTime() < PRESENCE_TTL_MS,
      transport: ice.transport,
      iceServers: ice.iceServers,
      turn: ice.turn,
      iceExpiresInSeconds: ice.iceExpiresInSeconds,
      pollIntervalMs: 1200,
      appointment: {
        startsAt: s.appointment.startsAt.toISOString(),
        endsAt: s.appointment.endsAt?.toISOString() ?? null,
        clinicName: s.appointment.clinic.nameEn,
        doctorName: s.appointment.clinician.displayName,
        patientFirstName: s.appointment.patient.firstNameEn,
        timezone: s.appointment.clinic.timezone,
        ...(role === TelehealthRole.CLINICIAN ? { appointmentId: s.appointmentId, patientId: s.patientId, patientName: `${s.appointment.patient.firstNameEn} ${s.appointment.patient.lastNameEn}`.trim() } : {}),
      },
      opensAt: w.opensAt.toISOString(),
      closesAt: w.closesAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------- signaling + presence + attendance

  async postSignal(principal: { actorSessionId?: string; token?: string; actor?: JwtUser; sessionId?: string }, body: { type?: string; payload?: unknown }) {
    const { s, role } = await this.principal(principal);
    this.assertJoinable(s, new Date());
    const type = String(body.type ?? "");
    if (!SIGNAL_TYPES.includes(type)) throw new TelehealthException("TELEHEALTH_BAD_SIGNAL");
    const json = JSON.stringify(body.payload ?? {});
    if (json.length > MAX_SIGNAL_BYTES) throw new TelehealthException("TELEHEALTH_BAD_SIGNAL");
    const r = await this.signaling.publish(s.id, role, type as TelehealthSignalType, body.payload ?? {});
    await this.touch(s, role);
    return r;
  }

  /** GET signals = the heartbeat. Records presence, advances WAITING/ACTIVE, evaluates attendance. */
  async pollSignals(principal: { token?: string; actor?: JwtUser; sessionId?: string }, afterSeq: number) {
    const { s, role } = await this.principal(principal);
    const now = new Date();
    // A terminal state is reported (not thrown) so the page can show the right end screen.
    const terminal = s.status === TelehealthSessionStatus.ENDED || s.status === TelehealthSessionStatus.CANCELLED || s.status === TelehealthSessionStatus.MISSED;
    if (!terminal) this.assertJoinable(s, now);
    const fresh = terminal ? s : await this.touch(s, role, now);
    const messages = await this.signaling.fetch(s.id, role, Math.max(0, Math.floor(afterSeq) || 0));
    const peerSeen = role === TelehealthRole.CLINICIAN ? fresh.patientLastSeenAt : fresh.clinicianLastSeenAt;
    return {
      messages,
      sessionStatus: fresh.status,
      mode: fresh.mode,
      endReason: fresh.endReason,
      peerPresent: peerSeen != null && now.getTime() - peerSeen.getTime() < PRESENCE_TTL_MS,
      attended: fresh.attendedAt != null,
    };
  }

  private async principal(p: { token?: string; actor?: JwtUser; sessionId?: string }): Promise<{ s: SessionRow; role: TelehealthRole }> {
    if (p.token) {
      const s = await this.resolvePatient(p.token);
      return { s, role: TelehealthRole.PATIENT };
    }
    const s = await this.load(p.sessionId ?? "", p.actor?.tenantId ?? "-");
    await this.authorizeStaff(p.actor!, s, "clinician");
    return { s, role: TelehealthRole.CLINICIAN };
  }

  /** Presence heartbeat + status machine + exactly-once attendance. */
  private async touch(s: SessionRow, role: TelehealthRole, now = new Date()): Promise<SessionRow> {
    const mine = role === TelehealthRole.CLINICIAN ? { clinicianLastSeenAt: now } : { patientLastSeenAt: now };
    const cur = await this.prisma.telehealthSession.update({ where: { id: s.id }, data: mine });
    const clinicianHere = cur.clinicianLastSeenAt != null && now.getTime() - cur.clinicianLastSeenAt.getTime() < PRESENCE_TTL_MS;
    const patientHere = cur.patientLastSeenAt != null && now.getTime() - cur.patientLastSeenAt.getTime() < PRESENCE_TTL_MS;
    const both = clinicianHere && patientHere;
    if (both && cur.status !== TelehealthSessionStatus.ACTIVE && cur.status !== TelehealthSessionStatus.ENDED) {
      const moved = await this.prisma.telehealthSession.updateMany({
        where: { id: s.id, status: { in: [TelehealthSessionStatus.SCHEDULED, TelehealthSessionStatus.WAITING, TelehealthSessionStatus.MISSED] } },
        data: { status: TelehealthSessionStatus.ACTIVE, startedAt: cur.startedAt ?? now, bothActiveSince: now },
      });
      if (moved.count === 1) {
        await this.prisma.$transaction(async (tx) => {
          await enqueueTelehealthEvent(tx, { tenantId: s.tenantId, type: TELEHEALTH_EVENT.STARTED, sessionId: s.id, data: telehealthStartedData({ ...cur, status: "ACTIVE" }, s.appointment, now), bookingSource: s.appointment.bookingSource, platformIntegrationClientId: s.appointment.platformIntegrationClientId });
        });
        await this.audit.recordEvent({ tenantId: s.tenantId, actorId: null, clinicId: s.clinicId, action: "telehealth.session.started", resource: "TelehealthSession", resourceId: s.id }).catch(() => undefined);
      }
    } else if (cur.status === TelehealthSessionStatus.ACTIVE) {
      if (both && !cur.bothActiveSince) await this.prisma.telehealthSession.updateMany({ where: { id: s.id, bothActiveSince: null }, data: { bothActiveSince: now } });
      if (!both && cur.bothActiveSince) await this.prisma.telehealthSession.updateMany({ where: { id: s.id }, data: { bothActiveSince: null } });
    }
    const latest = await this.load(s.id);
    if (latest.status === TelehealthSessionStatus.ACTIVE && latest.bothActiveSince && !latest.attendedAt && both && now.getTime() - latest.bothActiveSince.getTime() >= attendanceThresholdMs()) {
      await this.markAttended(latest, now);
      return this.load(s.id);
    }
    return latest;
  }

  /** Both present >= threshold: check-in + billing (same onCheckIn path) + Pre-filled encounter, exactly once even under races. */
  async markAttended(s: SessionRow, now = new Date()): Promise<boolean> {
    const won = await this.prisma.$transaction(async (tx) => {
      const g = await tx.telehealthSession.updateMany({ where: { id: s.id, attendedAt: null }, data: { attendedAt: now } });
      if (g.count !== 1) return false; // somebody else (another poll / instance) already attended it
      await this.appointments.markAttended(s.tenantId, s.appointmentId, { source: "TELEHEALTH", tx });
      return true;
    });
    if (won) {
      await this.audit.recordEvent({ tenantId: s.tenantId, actorId: null, clinicId: s.clinicId, action: "telehealth.session.attended", resource: "TelehealthSession", resourceId: s.id }).catch(() => undefined);
    }
    return won;
  }

  async setMode(principal: { token?: string; actor?: JwtUser; sessionId?: string }, mode: string) {
    if (mode !== TelehealthMode.VIDEO && mode !== TelehealthMode.AUDIO) throw new BadRequestException("mode must be VIDEO or AUDIO");
    const { s, role } = await this.principal(principal);
    this.assertJoinable(s, new Date());
    await this.prisma.telehealthSession.update({ where: { id: s.id }, data: { mode } });
    await this.audit.recordEvent({ tenantId: s.tenantId, actorId: principal.actor?.userId ?? null, clinicId: s.clinicId, action: "telehealth.session.mode_switched", resource: "TelehealthSession", resourceId: s.id, metadata: { mode, role } }).catch(() => undefined);
    return { mode };
  }

  async end(principal: { token?: string; actor?: JwtUser; sessionId?: string }, reason = "ENDED_BY_PARTICIPANT") {
    let s: SessionRow;
    let role: TelehealthRole | "STAFF" = TelehealthRole.PATIENT;
    if (principal.token) s = await this.resolvePatient(principal.token);
    else {
      s = await this.load(principal.sessionId ?? "", principal.actor?.tenantId ?? "-");
      await this.authorizeStaff(principal.actor!, s, "mutate");
      role = s.clinicianUserId === principal.actor!.userId ? TelehealthRole.CLINICIAN : "STAFF";
    }
    // A patient leaving only leaves; the visit ends when the clinician (or staff) ends it, or via the idle/expiry sweep.
    if (role === TelehealthRole.PATIENT) {
      await this.signaling.publish(s.id, TelehealthRole.PATIENT, TelehealthSignalType.BYE, {});
      await this.prisma.telehealthSession.update({ where: { id: s.id }, data: { patientLastSeenAt: null, bothActiveSince: null } });
      return { ended: false, sessionStatus: s.status };
    }
    return { ended: await this.finish(s, reason, principal.actor?.userId ?? null), sessionStatus: TelehealthSessionStatus.ENDED };
  }

  /** Idempotent: ENDED once. Emits telehealth.session.ended. */
  async finish(s: SessionRow, reason: string, actorId: string | null): Promise<boolean> {
    const now = new Date();
    const r = await this.prisma.telehealthSession.updateMany({
      where: { id: s.id, status: { in: [TelehealthSessionStatus.SCHEDULED, TelehealthSessionStatus.WAITING, TelehealthSessionStatus.ACTIVE] } },
      data: { status: TelehealthSessionStatus.ENDED, endedAt: now, endReason: reason, bothActiveSince: null },
    });
    if (r.count !== 1) return false;
    await this.signaling.publish(s.id, TelehealthRole.CLINICIAN, TelehealthSignalType.BYE, {}).catch(() => undefined);
    await this.prisma.$transaction(async (tx) => {
      await enqueueTelehealthEvent(tx, { tenantId: s.tenantId, type: TELEHEALTH_EVENT.ENDED, sessionId: s.id, data: telehealthEndedData({ ...s, status: "ENDED" }, s.appointment, { endedAt: now, endReason: reason, attended: s.attendedAt != null }), bookingSource: s.appointment.bookingSource, platformIntegrationClientId: s.appointment.platformIntegrationClientId });
    });
    await this.audit.recordEvent({ tenantId: s.tenantId, actorId, clinicId: s.clinicId, action: "telehealth.session.ended", resource: "TelehealthSession", resourceId: s.id, metadata: { reason } }).catch(() => undefined);
    return true;
  }

  /** Staff "Regenerate link": old tokens die (linkVersion++), the patient is re-sent the new link. */
  async regenerateLink(actor: JwtUser, id: string) {
    const s = await this.load(id, actor.tenantId ?? "-");
    await this.authorizeStaff(actor, s, "mutate");
    if (s.status === TelehealthSessionStatus.CANCELLED || s.status === TelehealthSessionStatus.ENDED) throw new TelehealthException(s.status === "ENDED" ? "TELEHEALTH_ENDED" : "TELEHEALTH_CANCELLED");
    const u = await this.prisma.telehealthSession.update({ where: { id }, data: { linkVersion: { increment: 1 } } });
    await this.audit.recordEvent({ tenantId: s.tenantId, actorId: actor.userId, clinicId: s.clinicId, action: "telehealth.session.link_regenerated", resource: "TelehealthSession", resourceId: id, metadata: { linkVersion: u.linkVersion } });
    void this.notifier?.sessionChanged(id).catch(() => undefined);
    return { linkVersion: u.linkVersion, joinUrl: patientJoinUrl(u) };
  }

  // ---------------------------------------------------------------- public info

  /** GET /v/:token/info: minimal data, or a clear state. Never throws for state problems (the page renders them). */
  async publicInfo(token: string) {
    const claims = verifyTelehealthToken(token);
    if (!claims) return { state: "INVALID" as const };
    const s = await this.prisma.telehealthSession.findUnique({ where: { id: claims.s }, include: sessionInclude });
    if (!s || s.patientId !== claims.p) return { state: "INVALID" as const };
    if (s.linkVersion !== claims.v) return { state: "LINK_REVOKED" as const };
    const now = new Date();
    const w = this.windowOf(s);
    const base = {
      firstName: s.appointment.patient.firstNameEn,
      doctorName: s.appointment.clinician.displayName,
      clinicName: s.appointment.clinic.nameEn,
      clinicTimezone: s.appointment.clinic.timezone,
      startsAt: s.appointment.startsAt.toISOString(),
      endsAt: s.appointment.endsAt?.toISOString() ?? null,
      opensAt: w.opensAt.toISOString(),
      closesAt: w.closesAt.toISOString(),
      mode: s.mode,
      moved: this.wasMoved(s),
      serverNow: now.toISOString(),
    };
    if (s.status === TelehealthSessionStatus.CANCELLED || s.appointment.status === AppointmentStatus.CANCELLED) {
      return { state: s.endReason === "CONVERTED_IN_PERSON" ? ("CONVERTED_IN_PERSON" as const) : ("CANCELLED" as const), ...base };
    }
    if (s.appointment.serviceLocation !== ServiceLocation.VIDEO) return { state: "CONVERTED_IN_PERSON" as const, ...base };
    if (s.status === TelehealthSessionStatus.ENDED) return { state: "ENDED" as const, ...base };
    if (s.status === TelehealthSessionStatus.MISSED && !s.needsStaffReview) return { state: "MISSED" as const, ...base };
    const ws = windowState(now, w);
    if (ws === "TOO_EARLY") return { state: "TOO_EARLY" as const, ...base };
    if (ws === "EXPIRED") return { state: "EXPIRED" as const, ...base };
    const dep = await this.prisma.patientDeposit.findFirst({ where: { tenantId: s.tenantId, appointmentId: s.appointmentId }, orderBy: { createdAt: "desc" }, select: { status: true } });
    return { state: dep?.status === "PENDING" ? ("PAYMENT_REQUIRED" as const) : ("OPEN" as const), ...base };
  }

  private wasMoved(s: SessionRow): boolean {
    const first = (s.reminderState as { firstStartsAt?: string } | null)?.firstStartsAt;
    return Boolean(first && new Date(first).getTime() !== s.appointment.startsAt.getTime());
  }

  // ---------------------------------------------------------------- doctor settings

  async getSettings(actor: JwtUser, clinicianId: string) {
    this.assertSettingsAccess(actor, clinicianId);
    const row = await this.prisma.clinicianTelehealthSetting.findFirst({ where: { tenantId: actor.tenantId!, clinicianId } });
    return { clinicianId, offersTelehealth: row?.offersTelehealth ?? false, windows: row?.windowsJson ?? null, enabled: await isTelehealthEnabled(this.flags, this.entitlements, actor.tenantId!) };
  }

  async putSettings(actor: JwtUser, clinicianId: string, body: { offersTelehealth?: boolean; windows?: unknown }) {
    this.assertSettingsAccess(actor, clinicianId);
    const tenantId = actor.tenantId!;
    const u = await this.prisma.user.findFirst({ where: { id: clinicianId, tenantId }, select: { id: true } });
    if (!u) throw new NotFoundException("Clinician not found");
    const { parseTelehealthWindows } = await import("./telehealth-availability");
    const windows = body.windows === undefined ? undefined : parseTelehealthWindows(body.windows);
    const row = await this.prisma.clinicianTelehealthSetting.upsert({
      where: { clinicianId },
      create: { tenantId, clinicianId, offersTelehealth: body.offersTelehealth ?? false, windowsJson: (windows ?? Prisma.DbNull) as Prisma.InputJsonValue },
      update: { ...(body.offersTelehealth !== undefined ? { offersTelehealth: body.offersTelehealth } : {}), ...(windows !== undefined ? { windowsJson: (windows ?? Prisma.DbNull) as Prisma.InputJsonValue } : {}) },
    });
    await this.audit.recordEvent({ tenantId, actorId: actor.userId, clinicId: null, action: "telehealth.settings.updated", resource: "ClinicianTelehealthSetting", resourceId: clinicianId, metadata: { offersTelehealth: row.offersTelehealth } });
    return { clinicianId, offersTelehealth: row.offersTelehealth, windows: row.windowsJson };
  }

  private assertSettingsAccess(actor: JwtUser, clinicianId: string): void {
    if (!actor.tenantId) throw new ForbiddenException();
    if (actor.userId === clinicianId) return;
    const managers: UserRole[] = [UserRole.GROUP_ADMIN, UserRole.GROUP_SUPERVISOR, UserRole.CLINIC_ADMIN, UserRole.BRANCH_MANAGER];
    if (!hasAnyRole(actor, managers)) throw new ForbiddenException("Managers or the clinician only");
  }

  // ---------------------------------------------------------------- scheduler work

  /** One sweep: MISSED detection, idle/expired end, signal purge. Safe on several instances (every transition is a guarded updateMany). */
  async tick(now = new Date()): Promise<{ missed: number; ended: number; purged: number }> {
    let missed = 0;
    let ended = 0;
    const open = await this.prisma.telehealthSession.findMany({
      where: { status: { in: [TelehealthSessionStatus.SCHEDULED, TelehealthSessionStatus.WAITING] }, appointment: { startsAt: { lte: now }, status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] } } },
      include: { ...sessionInclude, tenant: { select: { telehealthNoShowMinutes: true } } },
      take: 200,
    });
    for (const s of open) {
      if (!isPastNoShowDeadline(now, s.appointment.startsAt, s.tenant.telehealthNoShowMinutes)) continue;
      if (await this.markMissed(s, now)) missed++;
    }
    const live = await this.prisma.telehealthSession.findMany({ where: { status: { in: [TelehealthSessionStatus.WAITING, TelehealthSessionStatus.ACTIVE] } }, include: sessionInclude, take: 200 });
    for (const s of live) {
      const w = this.windowOf(s);
      const lastSeen = Math.max(s.clinicianLastSeenAt?.getTime() ?? 0, s.patientLastSeenAt?.getTime() ?? 0);
      const idle = lastSeen > 0 && now.getTime() - lastSeen > 2 * 60_000;
      if ((s.status === TelehealthSessionStatus.ACTIVE && idle) || now > w.closesAt) {
        if (await this.finish(s, now > w.closesAt ? "WINDOW_CLOSED" : "DISCONNECTED", null)) ended++;
      }
    }
    const purged = await this.signaling.purgeOlderThan(new Date(now.getTime() - 24 * 3600_000));
    return { missed, ended, purged };
  }

  /** Doctor absent => MISSED + flagged for staff review, appointment untouched, NOT charged. Patient absent => MISSED + existing NO_SHOW rules. */
  async markMissed(s: SessionRow, now: Date): Promise<boolean> {
    const doctorAbsent = s.clinicianJoinedAt == null;
    const r = await this.prisma.telehealthSession.updateMany({
      where: { id: s.id, status: { in: [TelehealthSessionStatus.SCHEDULED, TelehealthSessionStatus.WAITING] }, attendedAt: null },
      data: { status: TelehealthSessionStatus.MISSED, missedAt: now, needsStaffReview: doctorAbsent },
    });
    if (r.count !== 1) return false;
    await this.prisma.$transaction(async (tx) => {
      await enqueueTelehealthEvent(tx, { tenantId: s.tenantId, type: TELEHEALTH_EVENT.MISSED, sessionId: s.id, data: telehealthMissedData({ ...s, status: "MISSED" }, s.appointment, { missedAt: now, absentParty: doctorAbsent ? "CLINICIAN" : "PATIENT" }), bookingSource: s.appointment.bookingSource, platformIntegrationClientId: s.appointment.platformIntegrationClientId });
    });
    await this.audit.recordEvent({ tenantId: s.tenantId, actorId: null, clinicId: s.clinicId, action: "telehealth.session.missed", resource: "TelehealthSession", resourceId: s.id, metadata: { absentParty: doctorAbsent ? "CLINICIAN" : "PATIENT" } }).catch(() => undefined);
    if (!doctorAbsent) {
      try {
        await this.appointments.updateStatus(s.tenantId, s.appointmentId, AppointmentStatus.NO_SHOW);
      } catch (e) {
        this.log.warn(`no-show transition failed for session ${s.id}: ${e instanceof Error ? e.message : "error"}`);
      }
    }
    return true;
  }

  /** For the in-app card: sessions flagged for staff review (doctor never showed). */
  listNeedingReview(actor: JwtUser) {
    return this.prisma.telehealthSession.findMany({ where: { tenantId: actor.tenantId ?? "-", needsStaffReview: true, status: TelehealthSessionStatus.MISSED }, select: { id: true, appointmentId: true, missedAt: true }, take: 50 });
  }

  /** Used by flows that need the block without a session load. */
  async blockForAppointment(appointmentId: string) {
    const s = await this.prisma.telehealthSession.findUnique({ where: { appointmentId }, include: sessionInclude });
    return s ? telehealthBlock(s, s.appointment) : null;
  }
}
