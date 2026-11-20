import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { EncounterStatus, Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { JwtUser } from "../auth/jwt-user";
import { assertEncounterWritable } from "../common/encounter-lock";
import { EncountersService } from "../encounters/encounters.service";
import { PrismaService } from "../prisma/prisma.service";
import { ESCALATION_ACTIONS, evaluateVitals, resolveVitalsThresholds, validateVitalsInput, type EscalationAction, type VitalsInput } from "./vitals";

export type VisitRecordPatch = {
  checklist?: { task: string; done: boolean; note?: string }[];
  assessment?: string;
  intervention?: string;
  evaluation?: string;
  freeText?: string;
  /** nurse.mar OFF (or no structured MAR yet): medication recorded as free text here (KX-23 §07). */
  medicationFreeText?: string;
};

const TEXT_MAX = 5000;

/**
 * KNREC01/02 + KNESC01 — the nursing visit record, vitals and critical-value escalation. Signed and auto-locked like encounters (CL05):
 * signing finalizes the draft encounter that check-in created (so the visit completes and bills through the normal paths).
 */
@Injectable()
export class VisitRecordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encounters: EncountersService,
    private readonly audit: AuditService,
  ) {}

  private async appointmentFor(tenantId: string, nurse: JwtUser, appointmentId: string) {
    const a = await this.prisma.appointment.findFirst({ where: { id: appointmentId, tenantId }, select: { id: true, patientId: true, clinicianId: true, clinicId: true, status: true } });
    if (!a) throw new NotFoundException("Visit not found");
    if (a.clinicianId !== nurse.userId) throw new ForbiddenException("This visit is not assigned to you");
    return a;
  }

  async getOrCreate(tenantId: string, nurse: JwtUser, appointmentId: string) {
    const a = await this.appointmentFor(tenantId, nurse, appointmentId);
    const existing = await this.prisma.visitRecord.findUnique({ where: { appointmentId }, include: { vitals: { orderBy: { recordedAt: "asc" } } } });
    if (existing) return this.view(existing);
    const link = await this.prisma.carePlanVisit.findUnique({ where: { appointmentId }, select: { carePlanId: true, carePlan: { select: { itemsJson: true } } } }).catch(() => null);
    const created = await this.prisma.visitRecord.create({
      data: { tenantId, appointmentId, patientId: a.patientId, nurseId: nurse.userId, carePlanId: link?.carePlanId ?? null, checklistJson: [] },
      include: { vitals: true },
    });
    return this.view(created);
  }

  private view(r: Prisma.VisitRecordGetPayload<{ include: { vitals: true } }>) {
    return {
      id: r.id,
      appointmentId: r.appointmentId,
      status: r.status,
      checklist: r.checklistJson,
      assessment: r.assessment,
      intervention: r.intervention,
      evaluation: r.evaluation,
      freeText: r.freeText,
      medicationFreeText: r.medicationFreeText,
      signedAt: r.signedAt?.toISOString() ?? null,
      locked: r.lockedAt != null,
      vitals: r.vitals.map((v) => ({ id: v.id, recordedAt: v.recordedAt.toISOString(), systolic: v.systolic, diastolic: v.diastolic, pulse: v.pulse, temperatureC: v.temperatureC?.toString() ?? null, spo2: v.spo2, respiratoryRate: v.respiratoryRate, glucoseMgDl: v.glucoseMgDl, painScore: v.painScore, flags: v.flagsJson, critical: v.critical, escalationAction: v.escalationAction })),
    };
  }

  async update(tenantId: string, nurse: JwtUser, appointmentId: string, patch: VisitRecordPatch) {
    await this.appointmentFor(tenantId, nurse, appointmentId);
    const rec = await this.prisma.visitRecord.findUnique({ where: { appointmentId } });
    if (!rec) throw new NotFoundException("Visit record not found");
    // Auto-lock like encounters (CL05): a signed record is immutable.
    if (rec.status === "SIGNED" || rec.lockedAt) throw new ConflictException({ code: "VISIT_RECORD_LOCKED", message: "The visit record is signed and locked" });
    for (const k of ["assessment", "intervention", "evaluation", "freeText", "medicationFreeText"] as const) {
      if (patch[k] != null && patch[k]!.length > TEXT_MAX) throw new BadRequestException(`${k} is too long`);
    }
    const data: Prisma.VisitRecordUpdateInput = {};
    if (patch.checklist) data.checklistJson = patch.checklist as unknown as Prisma.InputJsonValue;
    for (const k of ["assessment", "intervention", "evaluation", "freeText", "medicationFreeText"] as const) if (patch[k] !== undefined) data[k] = patch[k];
    const updated = await this.prisma.visitRecord.update({ where: { id: rec.id }, data, include: { vitals: true } });
    return this.view(updated);
  }

  /** KNREC02/KNESC01 — record vitals, flag out-of-range values, and require an escalation entry for critical ones. */
  async recordVitals(tenantId: string, user: JwtUser, patientId: string, appointmentId: string | null, input: VitalsInput) {
    const err = validateVitalsInput(input);
    if (err) throw new BadRequestException(err);
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, tenantId, deletedAt: null }, select: { id: true, tenant: { select: { market: { select: { clinicalConfig: true } } } } } });
    if (!patient) throw new NotFoundException("Patient not found");
    const thresholds = resolveVitalsThresholds(patient.tenant.market);
    const ev = evaluateVitals(input, thresholds);
    let visitRecordId: string | null = null;
    if (appointmentId) {
      const rec = await this.prisma.visitRecord.findUnique({ where: { appointmentId } });
      if (rec && rec.tenantId === tenantId) {
        if (rec.status === "SIGNED") throw new ConflictException({ code: "VISIT_RECORD_LOCKED", message: "The visit record is signed and locked" });
        visitRecordId = rec.id;
      }
    }
    const row = await this.prisma.vitalsObservation.create({
      data: {
        tenantId,
        patientId,
        visitRecordId,
        recordedById: user.userId,
        systolic: input.systolic ?? null,
        diastolic: input.diastolic ?? null,
        pulse: input.pulse ?? null,
        temperatureC: input.temperatureC != null ? new Prisma.Decimal(input.temperatureC) : null,
        spo2: input.spo2 ?? null,
        respiratoryRate: input.respiratoryRate ?? null,
        glucoseMgDl: input.glucoseMgDl ?? null,
        painScore: input.painScore ?? null,
        flagsJson: ev.flags as unknown as Prisma.InputJsonValue,
        critical: ev.critical,
      },
    });
    if (ev.critical) {
      await this.audit.recordEvent({ tenantId, actorId: user.userId, clinicId: null, action: "vitals.critical_recorded", resource: "VitalsObservation", resourceId: row.id, metadata: { flagged: Object.keys(ev.flags) } });
    }
    return { id: row.id, flags: ev.flags, critical: ev.critical, escalation: ev.escalation, thresholdsVersion: thresholds.version, thresholdsCmoSigned: thresholds.cmoSignOff != null };
  }

  /** KNESC01 — log the action taken after a critical value. Required before the visit record can be signed. */
  async logEscalation(tenantId: string, user: JwtUser, vitalsId: string, body: { action: string; note?: string }) {
    if (!(ESCALATION_ACTIONS as readonly string[]).includes(body.action)) throw new BadRequestException("action must be one of " + ESCALATION_ACTIONS.join(", "));
    const v = await this.prisma.vitalsObservation.findFirst({ where: { id: vitalsId, tenantId } });
    if (!v) throw new NotFoundException("Vitals observation not found");
    if (!v.critical) throw new BadRequestException("Only a critical observation needs an escalation entry");
    const row = await this.prisma.vitalsObservation.update({ where: { id: v.id }, data: { escalationAction: body.action as EscalationAction, escalationNote: body.note?.slice(0, 1000) ?? null, escalatedAt: new Date() } });
    await this.audit.recordEvent({ tenantId, actorId: user.userId, clinicId: null, action: "vitals.escalation_logged", resource: "VitalsObservation", resourceId: v.id, metadata: { action: body.action } });
    return { id: row.id, escalationAction: row.escalationAction };
  }

  /** Trend for charts: last N observations of one patient. */
  async trend(tenantId: string, patientId: string, limit = 30) {
    const rows = await this.prisma.vitalsObservation.findMany({ where: { tenantId, patientId }, orderBy: { recordedAt: "desc" }, take: Math.min(100, limit) });
    return { items: rows.reverse().map((v) => ({ id: v.id, recordedAt: v.recordedAt.toISOString(), systolic: v.systolic, diastolic: v.diastolic, pulse: v.pulse, temperatureC: v.temperatureC?.toString() ?? null, spo2: v.spo2, respiratoryRate: v.respiratoryRate, glucoseMgDl: v.glucoseMgDl, painScore: v.painScore, flags: v.flagsJson, critical: v.critical })) };
  }

  /** KNREC01 — sign: refuses while a critical value has no escalation entry; finalizes the encounter so the visit completes. */
  async sign(tenantId: string, nurse: JwtUser, appointmentId: string) {
    const a = await this.appointmentFor(tenantId, nurse, appointmentId);
    const rec = await this.prisma.visitRecord.findUnique({ where: { appointmentId } });
    if (!rec) throw new NotFoundException("Visit record not found");
    if (rec.status === "SIGNED") throw new ConflictException({ code: "VISIT_RECORD_LOCKED", message: "Already signed" });
    const open = await this.prisma.vitalsObservation.findFirst({ where: { tenantId, visitRecordId: rec.id, critical: true, escalationAction: null }, select: { id: true } });
    if (open) throw new ConflictException({ code: "CRITICAL_VALUE_NOT_ESCALATED", message: "Log the action taken for the critical value before signing", vitalsId: open.id });
    if (!rec.assessment?.trim() && !rec.intervention?.trim() && !rec.freeText?.trim()) throw new BadRequestException("Write the nursing note (assessment, intervention or free text) before signing");
    // Nurses never prescribe: the draft encounter is closed as "no medications prescribed" (scope of practice; MAR lives in MedicationAdministration).
    const enc = await this.prisma.encounter.findFirst({ where: { tenantId, appointmentId, status: { in: [EncounterStatus.DRAFT, EncounterStatus.AMENDED] } }, select: { id: true } });
    if (enc) {
      await assertEncounterWritable(this.prisma, tenantId, enc.id);
      await this.prisma.encounter.update({ where: { id: enc.id }, data: { noMedications: true } });
      await this.encounters.finalize(tenantId, nurse, enc.id);
    }
    const now = new Date();
    const updated = await this.prisma.visitRecord.update({ where: { id: rec.id }, data: { status: "SIGNED", signedAt: now, lockedAt: now }, include: { vitals: true } });
    await this.audit.recordEvent({ tenantId, actorId: nurse.userId, clinicId: a.clinicId, action: "visit_record.signed", resource: "VisitRecord", resourceId: rec.id });
    return this.view(updated);
  }
}
