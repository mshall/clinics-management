import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";
import { ALERT_ROLES, DISPATCHER_ROLES, can, isHomeVisitManager } from "./mobile-roles";
import { hasAnyRole } from "../common/effective-roles";

/** SAFETY PATH (ADR-025): never consults the commercial plan entitlement or any flag. Every plan gets read + acknowledge. */
export type AlertKind = "HOME_VISIT_SOS" | "HOME_VISIT_MISSED_CHECKIN" | "NURSE_SAFETY" | "CRITICAL_VITALS" | "CRITICAL_LAB_RESULT";
export interface MobileAlert {
  id: string;
  kind: AlertKind;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  title: string;
  titleAr: string;
  body: string;
  bodyAr: string;
  subject: { type: string; id: string; label: string } | null;
  raisedAt: string;
  ackedAt: string | null;
  ackedBy: string | null;
  ackedByName: string | null;
  ackNote: string | null;
}

const WINDOW_MS = 14 * 86_400_000;
const HV: Record<string, { kind: AlertKind; en: string; ar: string; sev: "CRITICAL" | "HIGH" }> = {
  SOS: { kind: "HOME_VISIT_SOS", en: "SOS pressed on a home visit", ar: "زر الطوارئ SOS في زيارة منزلية", sev: "CRITICAL" },
  NO_ANSWER: { kind: "HOME_VISIT_MISSED_CHECKIN", en: "No answer to the safety check", ar: "لا إجابة على فحص السلامة", sev: "HIGH" },
  UNSAFE_ABORT: { kind: "NURSE_SAFETY", en: "Home visit aborted as unsafe", ar: "إنهاء زيارة منزلية لعدم الأمان", sev: "HIGH" },
};

@Injectable()
export class MobileAlertsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private clinician(u: JwtUser) {
    return !isHomeVisitManager(u);
  }

  /** Nurse-edition agency dispatcher: org-wide home-visit safety alerts only (never vitals / lab alerts). */
  private async dispatcher(u: JwtUser): Promise<boolean> {
    if (!u.tenantId || can(u, ALERT_ROLES) || !hasAnyRole(u, DISPATCHER_ROLES)) return false;
    const t = await this.prisma.tenant.findUnique({ where: { id: u.tenantId }, select: { edition: true } });
    return t?.edition === "NURSE";
  }

  async list(u: JwtUser, status: "open" | "all" = "open"): Promise<{ items: MobileAlert[]; open: number }> {
    const tenantId = u.tenantId;
    const dispatcher = await this.dispatcher(u);
    if (!tenantId || (!can(u, ALERT_ROLES) && !dispatcher)) return { items: [], open: 0 };
    const since = new Date(Date.now() - WINDOW_MS);
    const mine = dispatcher ? false : this.clinician(u);
    const items: MobileAlert[] = [];
    const acks = new Map((await this.prisma.mobileAlertAck.findMany({ where: { tenantId, ackedAt: { gte: since } } })).map((a) => [a.alertKey, a]));
    const names = new Map((await this.prisma.user.findMany({ where: { tenantId }, select: { id: true, displayName: true } })).map((x) => [x.id, x.displayName]));
    const ackOf = (key: string, ackedAt: Date | null, ackedBy: string | null) => {
      const a = acks.get(key);
      const at = ackedAt ?? a?.ackedAt ?? null;
      const by = ackedBy ?? a?.ackedBy ?? null;
      return { ackedAt: at?.toISOString() ?? null, ackedBy: by, ackedByName: by ? names.get(by) ?? null : null, ackNote: a?.note ?? null };
    };

    // 1. Home-visit safety alerts (existing HomeSafetyAlert rows: SOS / NO_ANSWER / UNSAFE_ABORT)
    const hv = await this.prisma.homeSafetyAlert.findMany({
      where: { tenantId, raisedAt: { gte: since }, ...(status === "open" ? { acknowledgedAt: null, status: { notIn: ["RESOLVED"] } } : {}), ...(mine ? { visit: { clinicianId: u.userId } } : {}) },
      include: { visit: { select: { id: true, clinicianId: true, appointmentId: true, appointment: { select: { patient: { select: { firstNameEn: true, lastNameEn: true } } } } } } },
      orderBy: { raisedAt: "desc" }, take: 100,
    });
    for (const a of hv) {
      const d = HV[a.kind] ?? HV.NO_ANSWER;
      const who = names.get(a.visit.clinicianId ?? "") ?? "clinician";
      const key = `hv_${a.id}`;
      items.push({
        id: key, kind: d.kind, severity: d.sev, title: d.en, titleAr: d.ar,
        body: `${who}: ${d.en}. Contact them now and acknowledge.`, bodyAr: `${who}: ${d.ar}. تواصل معه الآن ثم أقرّ بالاستلام.`,
        subject: { type: "HOME_VISIT", id: a.visitId, label: a.visitId.slice(-6) }, raisedAt: a.raisedAt.toISOString(), ...ackOf(key, a.acknowledgedAt, null),
      });
    }

    // 2. Critical vital signs without an escalation entry (KNESC01); dispatchers get home-visit safety alerts only
    const vit = dispatcher ? [] : await this.prisma.vitalsObservation.findMany({
      where: { tenantId, critical: true, recordedAt: { gte: since }, ...(status === "open" ? { escalatedAt: null } : {}), ...(mine ? { recordedById: u.userId } : {}) },
      orderBy: { recordedAt: "desc" }, take: 50,
    });
    const pIds = [...new Set(vit.map((v) => v.patientId))];
    const patients = new Map((await this.prisma.patient.findMany({ where: { id: { in: pIds } }, select: { id: true, mrn: true } })).map((p) => [p.id, p.mrn]));
    for (const v of vit) {
      const key = `vit_${v.id}`;
      const mrn = patients.get(v.patientId) ?? v.patientId.slice(-6);
      items.push({
        id: key, kind: "CRITICAL_VITALS", severity: "CRITICAL", title: "Critical vital signs", titleAr: "علامات حيوية حرجة",
        body: `Patient ${mrn}: a critical observation needs an escalation (call the doctor / 123).`, bodyAr: `المريض ${mrn}: ملاحظة حرجة تحتاج إلى تصعيد (اتصل بالطبيب / ١٢٣).`,
        subject: { type: "PATIENT", id: v.patientId, label: mrn }, raisedAt: v.recordedAt.toISOString(), ...ackOf(key, v.escalatedAt, v.escalatedAt ? v.recordedById : null),
      });
    }

    // 3. Critical lab results waiting for the doctor
    if (!dispatcher && can(u, [...ALERT_ROLES])) {
      const lab = await this.prisma.clinicalOrder.findMany({
        where: { tenantId, kind: "LAB", status: "RESULTS_READY", resultsReadyAt: { gte: since }, items: { some: { resultFlag: { startsWith: "CRITICAL" } } }, ...(mine ? { createdByUserId: u.userId } : {}) },
        include: { patient: { select: { mrn: true } } }, orderBy: { resultsReadyAt: "desc" }, take: 50,
      });
      for (const o of lab) {
        const key = `lab_${o.id}`;
        if (status === "open" && acks.has(key)) continue;
        items.push({
          id: key, kind: "CRITICAL_LAB_RESULT", severity: "CRITICAL", title: "Critical lab result", titleAr: "نتيجة تحليل حرجة",
          body: `Patient ${o.patient.mrn}: a critical lab result is waiting for your review.`, bodyAr: `المريض ${o.patient.mrn}: نتيجة تحليل حرجة بانتظار مراجعتك.`,
          subject: { type: "LAB_ORDER", id: o.id, label: o.patient.mrn }, raisedAt: (o.resultsReadyAt ?? o.updatedAt).toISOString(), ...ackOf(key, null, null),
        });
      }
    }
    items.sort((a, b) => b.raisedAt.localeCompare(a.raisedAt));
    return { items, open: items.filter((i) => !i.ackedAt).length };
  }

  /** Idempotent, audited acknowledgement. First acknowledger wins. */
  async ack(u: JwtUser, id: string, note?: string) {
    const tenantId = u.tenantId;
    const dispatcher = await this.dispatcher(u);
    if (!tenantId || (!can(u, ALERT_ROLES) && !dispatcher)) throw new ForbiddenException({ code: "FORBIDDEN", message: "Your role cannot acknowledge safety alerts" });
    const [prefix, rowId] = [id.slice(0, id.indexOf("_")), id.slice(id.indexOf("_") + 1)];
    if (dispatcher && prefix !== "hv") throw new NotFoundException({ code: "ALERT_NOT_FOUND" });
    const mine = dispatcher ? false : this.clinician(u);
    const now = new Date();
    if (prefix === "hv") {
      const a = await this.prisma.homeSafetyAlert.findFirst({ where: { id: rowId, tenantId, ...(mine ? { visit: { clinicianId: u.userId } } : {}) } });
      if (!a) throw new NotFoundException({ code: "ALERT_NOT_FOUND" });
      if (!a.acknowledgedAt) await this.prisma.homeSafetyAlert.update({ where: { id: a.id }, data: { acknowledgedAt: now, status: a.status === "ESCALATED" || a.status === "RESOLVED" ? a.status : "ACKNOWLEDGED" } });
    } else if (prefix === "vit") {
      const v = await this.prisma.vitalsObservation.findFirst({ where: { id: rowId, tenantId, critical: true, ...(mine ? { recordedById: u.userId } : {}) } });
      if (!v) throw new NotFoundException({ code: "ALERT_NOT_FOUND" });
      if (!v.escalatedAt) await this.prisma.vitalsObservation.update({ where: { id: v.id }, data: { escalatedAt: now, escalationAction: v.escalationAction ?? "OTHER", escalationNote: note?.slice(0, 1000) ?? "Acknowledged in Kiorly" } });
    } else if (prefix === "lab") {
      const o = await this.prisma.clinicalOrder.findFirst({ where: { id: rowId, tenantId, kind: "LAB" } });
      if (!o) throw new NotFoundException({ code: "ALERT_NOT_FOUND" });
    } else throw new NotFoundException({ code: "ALERT_NOT_FOUND" });
    const existing = await this.prisma.mobileAlertAck.findUnique({ where: { tenantId_alertKey: { tenantId, alertKey: id } } });
    const row = existing ?? (await this.prisma.mobileAlertAck.create({ data: { tenantId, alertKey: id, ackedBy: u.userId, note: note?.slice(0, 1000) ?? null } }));
    if (!existing) await this.audit.recordEvent({ tenantId, actorId: u.userId, clinicId: null, action: "mobile.alert_acknowledged", resource: "MobileAlertAck", resourceId: row.id, metadata: { alertKey: id } });
    return { id, ackedAt: row.ackedAt.toISOString(), ackedBy: row.ackedBy, alreadyAcknowledged: Boolean(existing) };
  }
}
