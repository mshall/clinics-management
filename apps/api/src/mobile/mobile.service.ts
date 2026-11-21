import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { AuditService } from "../audit/audit.service";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { hasRole } from "../common/effective-roles";
import { formatLocalYmd } from "../common/reporting-range";
import { EncountersService } from "../encounters/encounters.service";
import { VisitRecordService } from "../nurse/visit-record.service";
import type { VitalsInput } from "../nurse/vitals";
import { PrismaService } from "../prisma/prisma.service";
import { RevenueService } from "../revenue/revenue.service";
import { MobileAlertsService } from "./mobile-alerts.service";
import { MOBILE_ENTITLEMENT_KEY, MobileEntitlementService } from "./mobile-entitlement.service";
import { MobileUpgradeService } from "./mobile-upgrade.service";
import { MobilePushService } from "./mobile-push.service";
import { NON_PRESCRIBING_PROFESSIONS, REVENUE_ROLES, SIGNING_ROLES, VITALS_ROLES, can, effectiveRoles, isOwner, modulesFor } from "./mobile-roles";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const dayRange = (d: Date) => { const s = new Date(d); s.setUTCHours(0, 0, 0, 0); const e = new Date(s.getTime() + 86_400_000); return { s, e }; };
const name = (p: { firstNameEn: string; lastNameEn: string; firstNameAr?: string | null; lastNameAr?: string | null }) => ({ en: `${p.firstNameEn} ${p.lastNameEn}`.trim(), ar: p.firstNameAr ? `${p.firstNameAr} ${p.lastNameAr ?? ""}`.trim() : null });
const age = (dob: Date | null) => (dob ? Math.floor((Date.now() - dob.getTime()) / (365.25 * 86_400_000)) : null);

@Injectable()
export class MobileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ent: MobileEntitlementService,
    private readonly push: MobilePushService,
    private readonly alerts: MobileAlertsService,
    private readonly encounters: EncountersService,
    private readonly visits: VisitRecordService,
    private readonly revenue: RevenueService,
    private readonly upgrade: MobileUpgradeService,
  ) {}

  // ------------------------------------------------------------------ bootstrap
  async bootstrap(u: JwtUser, deviceHeader?: string) {
    const tenantId = requireTenantId(u);
    const [tenant, user, e] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { id: true, name: true, nameAr: true, defaultLocale: true, edition: true, market: { select: { code: true } } } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: u.userId }, select: { id: true, displayName: true, email: true, role: true, additionalRoles: true, profession: true } }),
      this.ent.evaluate(tenantId),
    ]);
    const roleModules = modulesFor(u, tenant.edition, user.profession);
    const dev = deviceHeader ? await this.prisma.mobileDevice.findFirst({ where: { tenantId, userId: u.userId, OR: [{ id: deviceHeader }, { deviceId: deviceHeader }] } }) : null;
    return {
      apiVersion: 1 as const,
      product: "clinic" as const,
      serverTime: new Date().toISOString(),
      user: { id: user.id, name: user.displayName, email: user.email, role: user.role, roles: effectiveRoles({ role: user.role, additionalRoles: user.additionalRoles, isTenantOwner: u.isTenantOwner }), isOwner: isOwner(u), locale: tenant.defaultLocale },
      org: { id: tenant.id, name: tenant.name, nameAr: tenant.nameAr, plan: e.plan, rawPlan: e.rawPlan, edition: tenant.edition, marketCode: tenant.market?.code ?? null },
      entitlement: { key: MOBILE_ENTITLEMENT_KEY, enabled: e.enabled, requiredPlan: e.requiredPlan, reason: e.reason },
      safetyAlertsOnly: !e.enabled,
      modules: e.enabled ? roleModules : [],
      /** Basic orgs only: what this role would get on PRO (locked tiles), my latest upgrade request, and open requests for owner/admin. */
      upgrade: e.enabled ? null : await this.upgrade.bootstrapBlock(u, roleModules.filter((m) => m.enabled).map((m) => m.key), isOwner(u) || can(u, [UserRole.GROUP_ADMIN, UserRole.CLINIC_ADMIN])),
      device: dev ? { id: dev.id, status: dev.status } : null,
    };
  }

  // -------------------------------------------------------------------- devices
  async registerDevice(u: JwtUser, b: { deviceId: string; platform: string; name: string; appVersion?: string; pushToken?: string }) {
    const tenantId = requireTenantId(u);
    const deviceToken = randomBytes(32).toString("base64url");
    const data = { platform: b.platform, name: b.name, appVersion: b.appVersion ?? null, tokenHash: sha256(deviceToken), status: "ACTIVE" as const, revokedAt: null, revokedBy: null, sessionId: u.sessionId ?? null, lastSeenAt: new Date(), ...(b.pushToken ? { pushToken: b.pushToken, pushProvider: "mock" } : {}) };
    const row = await this.prisma.mobileDevice.upsert({ where: { userId_deviceId: { userId: u.userId, deviceId: b.deviceId } }, create: { tenantId, userId: u.userId, deviceId: b.deviceId, ...data }, update: data });
    await this.audit.recordEvent({ tenantId, actorId: u.userId, clinicId: null, action: "mobile.device_registered", resource: "MobileDevice", resourceId: row.id, metadata: { platform: b.platform } });
    return { id: row.id, deviceId: row.deviceId, deviceToken, status: row.status };
  }

  async listDevices(u: JwtUser) {
    const tenantId = requireTenantId(u);
    const all = can(u, [UserRole.GROUP_ADMIN, UserRole.CLINIC_ADMIN, UserRole.GROUP_SUPERVISOR]);
    const rows = await this.prisma.mobileDevice.findMany({ where: { tenantId, ...(all ? {} : { userId: u.userId }) }, orderBy: { createdAt: "desc" } });
    const names = new Map((await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, displayName: true } })).map((x) => [x.id, x.displayName]));
    return { items: rows.map((r) => ({ id: r.id, deviceId: r.deviceId, platform: r.platform, name: r.name, appVersion: r.appVersion, status: r.status, hasPushToken: Boolean(r.pushToken), lastSeenAt: r.lastSeenAt, createdAt: r.createdAt, revokedAt: r.revokedAt, staff: { id: r.userId, name: names.get(r.userId) ?? null }, mine: r.userId === u.userId })) };
  }

  /** Remote sign-out: revoke the device AND the refresh session it signed in with. */
  async revokeDevice(u: JwtUser, id: string) {
    const tenantId = requireTenantId(u);
    const d = await this.prisma.mobileDevice.findFirst({ where: { id, tenantId } });
    if (!d) throw new NotFoundException({ code: "DEVICE_NOT_FOUND" });
    if (d.userId !== u.userId && !can(u, [UserRole.GROUP_ADMIN, UserRole.CLINIC_ADMIN, UserRole.GROUP_SUPERVISOR])) throw new ForbiddenException({ code: "FORBIDDEN", message: "Only the owner of the device or an organization admin can sign it out" });
    if (d.status === "ACTIVE") {
      await this.prisma.mobileDevice.update({ where: { id }, data: { status: "REVOKED", revokedAt: new Date(), revokedBy: u.userId, pushToken: null } });
      if (d.sessionId) await this.prisma.userSession.updateMany({ where: { id: d.sessionId, userId: d.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.recordEvent({ tenantId, actorId: u.userId, clinicId: null, action: "mobile.device_revoked", resource: "MobileDevice", resourceId: id, metadata: { remote: d.userId !== u.userId } });
    }
    return { id, status: "REVOKED" as const };
  }

  async setPushToken(u: JwtUser, id: string, b: { token: string; provider: "expo" | "mock" }) {
    const d = await this.prisma.mobileDevice.findFirst({ where: { id, tenantId: requireTenantId(u), userId: u.userId } });
    if (!d) throw new NotFoundException({ code: "DEVICE_NOT_FOUND" });
    if (d.status !== "ACTIVE") throw new ConflictException({ code: "DEVICE_REVOKED" });
    await this.prisma.mobileDevice.update({ where: { id }, data: { pushToken: b.token, pushProvider: b.provider } });
    return { id, hasPushToken: true, provider: b.provider };
  }

  // ---------------------------------------------------------------------- inbox
  async inbox(u: JwtUser, q: { limit?: string; cursor?: string }) {
    const tenantId = requireTenantId(u);
    const limit = Math.min(Math.max(Number(q.limit) || 30, 1), 100);
    const rows = await this.prisma.mobilePush.findMany({ where: { tenantId, userId: u.userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}) });
    const page = rows.slice(0, limit);
    const unread = await this.prisma.mobilePush.count({ where: { tenantId, userId: u.userId, readAt: null } });
    return { items: page.map((r) => ({ id: r.id, kind: r.kind, title: r.title, titleAr: r.titleAr, body: r.body, bodyAr: r.bodyAr, data: r.data, createdAt: r.createdAt, readAt: r.readAt })), nextCursor: rows.length > limit ? page[page.length - 1].id : null, unread };
  }
  async markRead(u: JwtUser, id: string) {
    const tenantId = requireTenantId(u);
    const r = await this.prisma.mobilePush.updateMany({ where: { id, tenantId, userId: u.userId, readAt: null }, data: { readAt: new Date() } });
    if (!r.count && !(await this.prisma.mobilePush.findFirst({ where: { id, tenantId, userId: u.userId } }))) throw new NotFoundException({ code: "MESSAGE_NOT_FOUND" });
    return { id, read: true };
  }
  async markAllRead(u: JwtUser) {
    const r = await this.prisma.mobilePush.updateMany({ where: { tenantId: requireTenantId(u), userId: u.userId, readAt: null }, data: { readAt: new Date() } });
    return { updated: r.count };
  }
  async pushTest(u: JwtUser) {
    const tenantId = requireTenantId(u);
    const m = await this.push.send({ tenantId, userId: u.userId, templateId: "TEST", data: { test: true } });
    const devices = await this.prisma.mobileDevice.count({ where: { tenantId, userId: u.userId, status: "ACTIVE", pushToken: { not: null } } });
    return { id: m.id, provider: m.provider, status: m.status, devices };
  }

  /** Endpoint-level role scoping: the same module keys as bootstrap, so an endpoint is never wider than the tile the role gets (403 MODULE_NOT_ALLOWED). */
  private async requireModule(u: JwtUser, key: string) {
    const [tn, me] = await Promise.all([this.prisma.tenant.findUniqueOrThrow({ where: { id: requireTenantId(u) }, select: { edition: true } }), this.prisma.user.findUnique({ where: { id: u.userId }, select: { profession: true } })]);
    if (!modulesFor(u, tn.edition, me?.profession).some((m) => m.key === key && m.enabled)) throw new ForbiddenException({ code: "MODULE_NOT_ALLOWED", key, message: "Your role does not include this part of the app" });
  }

  // ------------------------------------------------------------------- schedule
  private scheduleWhere(u: JwtUser, date: Date, clinicId?: string) {
    const { s, e } = dayRange(date);
    const own = hasRole(u, UserRole.PHYSICIAN) && !isOwner(u);
    return { tenantId: requireTenantId(u), startsAt: { gte: s, lt: e }, ...(clinicId ? { clinicId } : {}), ...(own ? { clinicianId: u.userId } : {}) };
  }

  /** Today's schedule + live queue (checked-in patients ordered by ticket). Clinicians see their own; staff/managers see the clinic. */
  async schedule(u: JwtUser, q: { date?: string; clinicId?: string }) {
    await this.requireModule(u, "clinic.schedule");
    return this.scheduleData(u, q);
  }

  private async scheduleData(u: JwtUser, q: { date?: string; clinicId?: string }) {
    const date = q.date ? new Date(q.date) : new Date();
    if (Number.isNaN(date.getTime())) throw new BadRequestException("Invalid date");
    const rows = await this.prisma.appointment.findMany({
      where: this.scheduleWhere(u, date, q.clinicId), orderBy: { startsAt: "asc" }, take: 300,
      include: { patient: { select: { id: true, mrn: true, firstNameEn: true, lastNameEn: true, firstNameAr: true, lastNameAr: true, gender: true, dob: true } }, clinician: { select: { id: true, displayName: true } }, appointmentType: { select: { nameEn: true, nameAr: true } }, clinic: { select: { id: true, nameEn: true, nameAr: true } } },
    });
    const homeIds = new Set((await this.prisma.homeVisit.findMany({ where: { appointmentId: { in: rows.map((r) => r.id) } }, select: { appointmentId: true } })).map((h) => h.appointmentId));
    const items = rows.map((a) => ({
      id: a.id, startsAt: a.startsAt, endsAt: a.endsAt, status: a.status, queueStage: a.queueStage, queueTicketNumber: a.queueTicketNumber, roomLabel: a.roomLabel, checkedInAt: a.checkedInAt, isHomeVisit: homeIds.has(a.id), notes: a.notes,
      patient: { id: a.patient.id, mrn: a.patient.mrn, name: name(a.patient).en, nameAr: name(a.patient).ar, gender: a.patient.gender, age: age(a.patient.dob) },
      clinician: { id: a.clinician.id, name: a.clinician.displayName }, clinic: { id: a.clinic.id, name: a.clinic.nameEn, nameAr: a.clinic.nameAr },
      type: a.appointmentType ? { name: a.appointmentType.nameEn, nameAr: a.appointmentType.nameAr } : null,
    }));
    const queue = items.filter((i) => i.status === "CHECKED_IN").sort((a, b) => (a.queueTicketNumber ?? 9999) - (b.queueTicketNumber ?? 9999));
    return { date: dayRange(date).s.toISOString().slice(0, 10), items, queue, counts: { total: items.length, scheduled: items.filter((i) => ["SCHEDULED", "CONFIRMED"].includes(i.status)).length, waiting: queue.filter((i) => i.queueStage !== "IN_EXAM").length, inExam: queue.filter((i) => i.queueStage === "IN_EXAM").length, completed: items.filter((i) => i.status === "COMPLETED").length, cancelled: items.filter((i) => i.status === "CANCELLED" || i.status === "NO_SHOW").length } };
  }

  // -------------------------------------------------------------------- summary
  async summary(u: JwtUser) {
    const tenantId = requireTenantId(u);
    const sched = await this.scheduleData(u, {});
    const [tn, me] = await Promise.all([this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { edition: true } }), this.prisma.user.findUnique({ where: { id: u.userId }, select: { profession: true } })]);
    const mods = new Set(modulesFor(u, tn.edition, me?.profession).filter((m) => m.enabled).map((m) => m.key));
    const isDoc = can(u, SIGNING_ROLES);
    const [unread, alerts, pendingRx, pendingLabs, myDrafts] = await Promise.all([
      this.prisma.mobilePush.count({ where: { tenantId, userId: u.userId, readAt: null } }),
      this.alerts.list(u, "open"),
      mods.has("clinic.prescriptions") ? this.prisma.encounter.count({ where: { tenantId, status: "DRAFT", ...(isOwner(u) ? {} : hasRole(u, UserRole.PHYSICIAN) ? { clinicianId: u.userId } : {}), OR: [{ medications: { some: {} } }, { documents: { some: { kind: "PRESCRIPTION" } } }] } }) : null,
      mods.has("clinic.labs") ? this.pendingLabCount(u) : null,
      mods.has("clinic.visits") ? this.prisma.encounter.count({ where: { tenantId, status: "DRAFT", clinicianId: u.userId } }) : null,
    ]);
    return { serverTime: new Date().toISOString(), today: sched.counts, nextUp: sched.items.find((i) => ["SCHEDULED", "CONFIRMED", "CHECKED_IN"].includes(i.status)) ?? null, pendingPrescriptions: pendingRx, pendingLabReviews: pendingLabs, openVisits: myDrafts, unreadInbox: unread, openAlerts: alerts.open, doctor: isDoc };
  }

  private async pendingLabCount(u: JwtUser) {
    const tenantId = requireTenantId(u);
    const own = hasRole(u, UserRole.PHYSICIAN) && !isOwner(u);
    const rows = await this.prisma.clinicalOrder.findMany({ where: { tenantId, kind: "LAB", status: "RESULTS_READY", ...(own ? { OR: [{ encounter: { clinicianId: u.userId } }, { createdByUserId: u.userId }] } : {}) }, select: { id: true }, take: 500 });
    const done = await this.prisma.mobileResultReview.count({ where: { tenantId, orderId: { in: rows.map((i) => i.id) } } });
    return rows.length - done;
  }

  // --------------------------------------------------------------------- search
  async search(u: JwtUser, qRaw: string) {
    const tenantId = requireTenantId(u);
    await this.requireModule(u, "clinic.patients");
    const q = qRaw.trim();
    if (q.length < 2) return { query: q, patients: [], appointmentsToday: [] };
    const patients = await this.prisma.patient.findMany({
      where: { tenantId, deletedAt: null, OR: [{ firstNameEn: { contains: q, mode: "insensitive" } }, { lastNameEn: { contains: q, mode: "insensitive" } }, { firstNameAr: { contains: q } }, { lastNameAr: { contains: q } }, { phone: { contains: q } }, { mrn: { contains: q, mode: "insensitive" } }] },
      select: { id: true, mrn: true, firstNameEn: true, lastNameEn: true, firstNameAr: true, lastNameAr: true, gender: true, dob: true, phone: true }, take: 10,
    });
    const { s, e } = dayRange(new Date());
    const appts = await this.prisma.appointment.findMany({ where: { tenantId, startsAt: { gte: s, lt: e }, patientId: { in: patients.map((p) => p.id) } }, select: { id: true, patientId: true, startsAt: true, status: true } });
    return { query: q, patients: patients.map((p) => ({ id: p.id, mrn: p.mrn, name: name(p).en, nameAr: name(p).ar, gender: p.gender, age: age(p.dob), phone: p.phone })), appointmentsToday: appts };
  }

  // -------------------------------------------------------------- prescriptions
  async prescriptions(u: JwtUser, status: "pending" | "signed" = "pending") {
    const tenantId = requireTenantId(u);
    await this.requireModule(u, "clinic.prescriptions");
    const own = hasRole(u, UserRole.PHYSICIAN) && !isOwner(u);
    const rows = await this.prisma.encounter.findMany({
      where: { tenantId, ...(own ? { clinicianId: u.userId } : {}), ...(status === "pending" ? { status: "DRAFT", OR: [{ medications: { some: {} } }, { documents: { some: { kind: "PRESCRIPTION" } } }] } : { status: { in: ["FINALIZED", "AMENDED"] }, finalizedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } }) },
      include: { patient: { select: { id: true, mrn: true, firstNameEn: true, lastNameEn: true, firstNameAr: true, lastNameAr: true } }, medications: true, clinician: { select: { id: true, displayName: true } }, diagnoses: { select: { icd10Code: true, descriptionEn: true } } },
      orderBy: { updatedAt: "desc" }, take: 50,
    });
    return { status, items: rows.map((e) => ({ encounterId: e.id, status: e.status, visitType: e.visitType, updatedAt: e.updatedAt, finalizedAt: e.finalizedAt, signedAt: e.signedAt, patient: { id: e.patient.id, mrn: e.patient.mrn, name: name(e.patient).en, nameAr: name(e.patient).ar }, clinician: e.clinician, diagnoses: e.diagnoses, medications: e.medications.map((m) => ({ id: m.id, drugName: m.drugName, dosage: m.dosage, route: m.route, safetyOverride: Boolean(m.safetyOverrideReason), unverified: m.drugUnverified })) })) };
  }

  /** Sign = finalize the encounter with the existing rules (assigned clinician only, medications policy, billing seat). Idempotent: re-sign returns 409 ALREADY_SIGNED. */
  private async assertMaySign(u: JwtUser, what: string) {
    const me = await this.prisma.user.findUnique({ where: { id: u.userId }, select: { profession: true } });
    if (!can(u, SIGNING_ROLES) || (me?.profession && NON_PRESCRIBING_PROFESSIONS.includes(me.profession))) throw new ForbiddenException({ code: "FORBIDDEN", message: `Only a physician can ${what}` });
  }

  async signPrescription(u: JwtUser, encounterId: string) {
    const tenantId = requireTenantId(u);
    await this.assertMaySign(u, "sign prescriptions");
    const enc = await this.prisma.encounter.findFirst({ where: { id: encounterId, tenantId }, select: { status: true } });
    if (!enc) throw new NotFoundException({ code: "ENCOUNTER_NOT_FOUND" });
    if (enc.status !== "DRAFT") throw new ConflictException({ code: "ALREADY_SIGNED" });
    const r = await this.encounters.finalize(tenantId, u, encounterId);
    return { encounterId, status: r.status, signedAt: (r as { signedAt?: unknown }).signedAt ?? new Date().toISOString() };
  }

  // ----------------------------------------------------------------- lab results
  async labResults(u: JwtUser, status: "pending" | "reviewed" = "pending") {
    const tenantId = requireTenantId(u);
    await this.requireModule(u, "clinic.labs");
    const own = hasRole(u, UserRole.PHYSICIAN) && !isOwner(u);
    const base = { tenantId, kind: "LAB" as const, status: "RESULTS_READY" as const, ...(own ? { OR: [{ encounter: { clinicianId: u.userId } }, { createdByUserId: u.userId }] } : {}) };
    const rows = await this.prisma.clinicalOrder.findMany({ where: base, include: { items: { orderBy: { sortOrder: "asc" } }, patient: { select: { id: true, mrn: true, firstNameEn: true, lastNameEn: true, firstNameAr: true, lastNameAr: true } } }, orderBy: { resultsReadyAt: "desc" }, take: 100 });
    const reviews = new Map((await this.prisma.mobileResultReview.findMany({ where: { tenantId, orderId: { in: rows.map((r) => r.id) } } })).map((r) => [r.orderId, r]));
    const items = rows.filter((r) => (status === "pending" ? !reviews.has(r.id) : reviews.has(r.id))).map((o) => ({
      orderId: o.id, resultsReadyAt: o.resultsReadyAt, critical: o.items.some((i) => (i.resultFlag ?? "").startsWith("CRITICAL")), hasPdf: Boolean(o.resultsPdfRelativePath),
      patient: { id: o.patient.id, mrn: o.patient.mrn, name: name(o.patient).en, nameAr: name(o.patient).ar },
      items: o.items.map((i) => ({ code: i.code, name: i.nameEn, nameAr: i.nameAr, value: i.resultValue, unit: i.resultUnit, flag: i.resultFlag })),
      review: reviews.get(o.id) ? { reviewedAt: reviews.get(o.id)!.reviewedAt, reviewedBy: reviews.get(o.id)!.reviewedBy, note: reviews.get(o.id)!.note } : null,
    }));
    return { status, items };
  }

  async approveLabResult(u: JwtUser, orderId: string, note?: string) {
    const tenantId = requireTenantId(u);
    await this.assertMaySign(u, "approve results");
    const o = await this.prisma.clinicalOrder.findFirst({ where: { id: orderId, tenantId, kind: "LAB" } });
    if (!o) throw new NotFoundException({ code: "ORDER_NOT_FOUND" });
    if (o.status !== "RESULTS_READY") throw new ConflictException({ code: "RESULTS_NOT_READY" });
    const existing = await this.prisma.mobileResultReview.findUnique({ where: { tenantId_orderId: { tenantId, orderId } } });
    const row = existing ?? (await this.prisma.mobileResultReview.create({ data: { tenantId, orderId, reviewedBy: u.userId, note: note?.slice(0, 1000) ?? null } }));
    if (!existing) await this.audit.recordEvent({ tenantId, actorId: u.userId, clinicId: o.clinicId, action: "mobile.lab_result_approved", resource: "ClinicalOrder", resourceId: orderId });
    return { orderId, reviewedAt: row.reviewedAt, reviewedBy: row.reviewedBy, alreadyApproved: Boolean(existing) };
  }

  // --------------------------------------------------------------------- vitals
  async recordVitals(u: JwtUser, b: { patientId: string; appointmentId?: string } & VitalsInput, idempotencyKey?: string) {
    const tenantId = requireTenantId(u);
    if (!can(u, VITALS_ROLES)) throw new ForbiddenException({ code: "FORBIDDEN", message: "Your role cannot record vitals" });
    const { patientId, appointmentId, ...v } = b;
    if (!patientId) throw new BadRequestException("patientId is required");
    // Offline replay: the same Idempotency-Key from the same staff member stores one reading and notifies once.
    const key = idempotencyKey?.trim().slice(0, 200);
    const r = await this.visits.recordVitals(tenantId, u, patientId, appointmentId ?? null, v, key ? { id: `vit_idem_${sha256(`${tenantId}|${u.userId}|${key}`).slice(0, 32)}` } : {});
    if (r.critical && !r.replayed) {
      const mgr = await this.prisma.user.findMany({ where: { tenantId, role: { in: [UserRole.BRANCH_MANAGER, UserRole.GROUP_ADMIN, UserRole.CLINIC_ADMIN] }, deletedAt: null }, select: { id: true } });
      await this.push.notifyUsers(tenantId, [u.userId, ...mgr.map((m) => m.id)], "CRITICAL_VITALS", { vitalsId: r.id, alertKey: `vit_${r.id}` });
    }
    return r;
  }

  // -------------------------------------------------------------------- revenue
  /** Owner snapshot: today / 7 d / 30 d net revenue + 7-day daily sparkline (posted revenue ledger; same access rules as /revenue/totals). */
  async revenueSnapshot(u: JwtUser) {
    const tenantId = requireTenantId(u);
    if (!can(u, REVENUE_ROLES)) throw new ForbiddenException({ code: "FORBIDDEN", message: "Revenue is limited to owners, managers and finance" });
    // Same calendar the web ledger uses (resolveReportingRange = server-local days): a UTC date string here made "today" differ from /revenue/totals near midnight.
    const day = formatLocalYmd;
    const today = new Date();
    const range = async (from: Date, to: Date) => this.revenue.totals(tenantId, day(from), day(to), undefined, undefined, u);
    const daily: { date: string; net: number; gross: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86_400_000);
      const t = await range(d, d);
      daily.push({ date: day(d), net: Number(t.netTotal), gross: Number(t.grossTotal) });
    }
    const d30 = await range(new Date(today.getTime() - 29 * 86_400_000), today);
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { baseCurrency: true } });
    const s = new Date(today.getFullYear(), today.getMonth(), today.getDate()), e = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const collected = await this.prisma.appointment.count({ where: { tenantId, startsAt: { gte: s, lt: e }, status: "COMPLETED" } });
    return { currency: tenant.baseCurrency, today: daily[6], last7: { net: daily.reduce((a, b) => a + b.net, 0), gross: daily.reduce((a, b) => a + b.gross, 0) }, last30: { net: Number(d30.netTotal), gross: Number(d30.grossTotal) }, daily, completedVisitsToday: collected };
  }
}
