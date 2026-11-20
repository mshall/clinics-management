import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { MessageChannel, Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { AuditService } from "../audit/audit.service";
import type { JwtUser } from "../auth/jwt-user";
import { FeatureDisabledException } from "../feature-flags/feature-disabled.exception";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { specialtyTemplateFlagKey } from "../feature-flags/feature-flag-keys";
import { MessagingService } from "../messaging/messaging.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  PHYSIO_HEP_TEMPLATE_KEY,
  PHYSIO_HEP_TTL_DAYS,
  PHYSIO_REFERRAL_SOURCES,
  PHYSIO_TEMPLATE_FLAG_CODE,
  OUTCOME_KINDS,
  baselinePoints,
  buildTrend,
  directAccessAllowed,
  validateAssessment,
  validateExercises,
  validateOutcomePoints,
  type Exercise,
  type OutcomePoint,
} from "./physio-pack";
import { rxWebBase } from "./rx-verification-token";

const hash = (raw: string) => createHash("sha256").update(raw, "utf8").digest("hex");
const dec = (n: number) => new Prisma.Decimal(n);

@Injectable()
export class PhysioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly messaging: MessagingService,
    @Optional() private readonly flags?: FeatureFlagsService,
  ) {}

  /** Launch-locked (GPR2): new physio actions are refused only when a Kiorex snapshot marks the flag gate-unsatisfied or OFF. Never records the gate. */
  private async assertTemplateLive(tenantId: string) {
    if (!this.flags) return;
    const key = specialtyTemplateFlagKey(PHYSIO_TEMPLATE_FLAG_CODE);
    if (!(await this.flags.isSpecialtyTemplateVisible(tenantId, key))) throw new FeatureDisabledException(key, "global");
  }

  private async patient(tenantId: string, patientId: string) {
    const p = await this.prisma.patient.findFirst({ where: { id: patientId, tenantId }, select: { id: true, phone: true, isSample: true } });
    if (!p) throw new NotFoundException("Patient not found");
    return p;
  }

  private async plan(tenantId: string, id: string) {
    const p = await this.prisma.physioTreatmentPlan.findFirst({ where: { id, tenantId } });
    if (!p) throw new NotFoundException("Plan not found");
    return p;
  }

  private async marketConfig(tenantId: string) {
    const t = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { market: { select: { clinicalConfig: true } } } });
    return t?.market?.clinicalConfig;
  }

  // PT04
  async createReferral(tenantId: string, user: JwtUser, b: { patientId: string; source: string; referringDoctorName?: string; diagnosis?: string; documentKey?: string }) {
    await this.assertTemplateLive(tenantId);
    await this.patient(tenantId, b.patientId);
    if (!(PHYSIO_REFERRAL_SOURCES as readonly string[]).includes(b.source) || b.source === "KIORLY_REFERRAL") {
      throw new BadRequestException("source must be ATTACHED_DOCUMENT or DIRECT_ACCESS");
    }
    if (b.source === "DIRECT_ACCESS" && !directAccessAllowed(await this.marketConfig(tenantId))) {
      throw new ConflictException({ message: "Direct access without a referral is not allowed in this market", errorCode: "PHYSIO_DIRECT_ACCESS_NOT_ALLOWED" });
    }
    if (b.source === "ATTACHED_DOCUMENT" && !b.referringDoctorName?.trim()) throw new BadRequestException("referringDoctorName is required");
    return this.prisma.physioReferral.create({
      data: { tenantId, patientId: b.patientId, source: b.source, referringDoctorName: b.referringDoctorName?.trim() ?? null, diagnosis: b.diagnosis ?? null, documentKey: b.documentKey ?? null, createdByUserId: user.userId },
    });
  }

  /** ReferralIssued from a Kiorly Clinic doctor, by patient consent (KX-09). Idempotent per externalRef. Inbound transport is the contract owner's (no route yet). */
  async receiveReferral(tenantId: string, b: { patientId: string; externalRef: string; referringDoctorName: string; diagnosis?: string; consentToken?: string }) {
    if (!b.consentToken?.trim()) throw new ConflictException({ message: "Patient consent is required to receive a referral", errorCode: "PHYSIO_REFERRAL_NO_CONSENT" });
    await this.patient(tenantId, b.patientId);
    const existing = await this.prisma.physioReferral.findUnique({ where: { externalRef: b.externalRef } });
    if (existing) return existing;
    return this.prisma.physioReferral.create({
      data: { tenantId, patientId: b.patientId, source: "KIORLY_REFERRAL", referringDoctorName: b.referringDoctorName, diagnosis: b.diagnosis ?? null, externalRef: b.externalRef },
    });
  }

  // PT01
  async createAssessment(tenantId: string, user: JwtUser, b: Parameters<typeof validateAssessment>[0] & { patientId: string; history?: string; encounterId?: string }) {
    await this.assertTemplateLive(tenantId);
    await this.patient(tenantId, b.patientId);
    const pain = validateAssessment(b);
    const row = await this.prisma.physioAssessment.create({
      data: {
        tenantId, patientId: b.patientId, clinicianId: user.userId, encounterId: b.encounterId ?? null,
        complaint: b.complaint!.trim(), history: b.history ?? "", painNrs: pain,
        rom: (b.rom ?? []) as Prisma.InputJsonValue, strength: (b.strength ?? []) as Prisma.InputJsonValue,
        specialTests: (b.specialTests ?? []) as Prisma.InputJsonValue, functionalGoals: (b.functionalGoals ?? []) as Prisma.InputJsonValue,
      },
    });
    await this.recordPoints(tenantId, b.patientId, null, baselinePoints({ painNrs: pain, rom: b.rom, strength: b.strength }));
    return row;
  }

  private async recordPoints(tenantId: string, patientId: string, planId: string | null, points: OutcomePoint[]) {
    if (!points.length) return;
    await this.prisma.physioOutcomeMeasure.createMany({
      data: points.map((p) => ({ tenantId, patientId, planId, kind: p.kind, label: p.label, side: p.side ?? null, value: dec(p.value), unit: p.unit })),
    });
  }

  // PT02
  async createPlan(
    tenantId: string,
    user: JwtUser,
    b: { patientId: string; clinicId?: string; referralId?: string; assessmentId?: string; packageId?: string; sessionCount: number; frequencyPerWeek: number; modalities?: string[]; homeProgramme?: Exercise[] },
  ) {
    await this.assertTemplateLive(tenantId);
    await this.patient(tenantId, b.patientId);
    if (!Number.isInteger(b.sessionCount) || b.sessionCount < 1 || b.sessionCount > 60) throw new BadRequestException("sessionCount must be 1-60");
    if (!Number.isInteger(b.frequencyPerWeek) || b.frequencyPerWeek < 1 || b.frequencyPerWeek > 14) throw new BadRequestException("frequencyPerWeek must be 1-14");
    if (b.referralId) {
      const ref = await this.prisma.physioReferral.findFirst({ where: { id: b.referralId, tenantId, patientId: b.patientId } });
      if (!ref) throw new BadRequestException("Referral not found for this patient");
    } else if (!directAccessAllowed(await this.marketConfig(tenantId))) {
      throw new ConflictException({ message: "A doctor's referral is required before a treatment plan", errorCode: "PHYSIO_REFERRAL_REQUIRED" });
    }
    if (b.packageId) {
      const pkg = await this.prisma.patientServicePackage.findFirst({ where: { id: b.packageId, tenantId, patientId: b.patientId } });
      if (!pkg) throw new BadRequestException("Package not found for this patient");
    }
    const plan = await this.prisma.physioTreatmentPlan.create({
      data: {
        tenantId, patientId: b.patientId, clinicianId: user.userId, clinicId: b.clinicId ?? null, referralId: b.referralId ?? null,
        assessmentId: b.assessmentId ?? null, packageId: b.packageId ?? null, sessionCount: b.sessionCount, frequencyPerWeek: b.frequencyPerWeek,
        modalities: (b.modalities ?? []) as Prisma.InputJsonValue, homeProgramme: (b.homeProgramme ? validateExercises(b.homeProgramme) : []) as unknown as Prisma.InputJsonValue,
      },
    });
    await this.audit.recordEvent({ tenantId, actorId: user.userId, clinicId: b.clinicId ?? null, action: "physio.plan.created", resource: "PhysioTreatmentPlan", resourceId: plan.id, metadata: { sessionCount: b.sessionCount } });
    return this.planView(plan);
  }

  planView(p: { id: string; sessionCount: number; sessionsCompleted: number; status: string; [k: string]: unknown }) {
    return { ...p, sessionsRemaining: Math.max(0, p.sessionCount - p.sessionsCompleted) };
  }

  async getPlan(tenantId: string, id: string) {
    return this.planView(await this.plan(tenantId, id));
  }

  // PT03
  async addProgressNote(tenantId: string, user: JwtUser, planId: string, b: { appointmentId?: string; subjective?: string; intervention?: string; response?: string; nextPlan?: string; outcomes?: OutcomePoint[] }) {
    await this.assertTemplateLive(tenantId);
    const plan = await this.plan(tenantId, planId);
    if (plan.status !== "ACTIVE") throw new ConflictException({ message: "The plan is discharged", errorCode: "PHYSIO_PLAN_CLOSED" });
    if (plan.sessionsCompleted >= plan.sessionCount) throw new ConflictException({ message: "All planned sessions are used", errorCode: "PHYSIO_SESSIONS_EXHAUSTED" });
    const points = validateOutcomePoints(b.outcomes);
    const sessionNo = plan.sessionsCompleted + 1;
    const note = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.physioTreatmentPlan.updateMany({ where: { id: planId, sessionsCompleted: plan.sessionsCompleted }, data: { sessionsCompleted: { increment: 1 } } });
      if (claimed.count !== 1) throw new ConflictException("Concurrent session update, retry");
      return tx.physioProgressNote.create({
        data: { tenantId, planId, patientId: plan.patientId, clinicianId: user.userId, appointmentId: b.appointmentId ?? null, sessionNo, subjective: b.subjective ?? "", intervention: b.intervention ?? "", response: b.response ?? "", nextPlan: b.nextPlan ?? "" },
      });
    });
    await this.recordPoints(tenantId, plan.patientId, planId, points);
    return { note, sessionsCompleted: sessionNo, sessionsRemaining: plan.sessionCount - sessionNo };
  }

  async trend(tenantId: string, patientId: string, kind: string, label: string) {
    if (!(OUTCOME_KINDS as readonly string[]).includes(kind)) throw new BadRequestException("unknown outcome kind");
    const rows = await this.prisma.physioOutcomeMeasure.findMany({ where: { tenantId, patientId, kind, label }, orderBy: { measuredAt: "asc" } });
    return { kind, label, unit: rows[0]?.unit ?? null, ...buildTrend(rows) };
  }

  async discharge(tenantId: string, user: JwtUser, planId: string, summary: string) {
    const plan = await this.plan(tenantId, planId);
    if (plan.status === "DISCHARGED") throw new ConflictException({ message: "Already discharged", errorCode: "PHYSIO_PLAN_CLOSED" });
    if (!summary?.trim()) throw new BadRequestException("A discharge summary is required");
    const row = await this.prisma.physioTreatmentPlan.update({ where: { id: planId }, data: { status: "DISCHARGED", dischargeSummary: summary.trim(), dischargedAt: new Date() } });
    await this.audit.recordEvent({ tenantId, actorId: user.userId, clinicId: plan.clinicId, action: "physio.plan.discharged", resource: "PhysioTreatmentPlan", resourceId: planId, metadata: { sessionsCompleted: plan.sessionsCompleted } });
    return this.planView(row);
  }

  // PT05
  async setHomeProgramme(tenantId: string, planId: string, exercises: Exercise[]) {
    await this.plan(tenantId, planId);
    const row = await this.prisma.physioTreatmentPlan.update({ where: { id: planId }, data: { homeProgramme: validateExercises(exercises) as unknown as Prisma.InputJsonValue } });
    return this.planView(row);
  }

  /** Share the home exercise programme by WhatsApp link. The message body carries the clinic name and link only: no PHI. */
  async shareHomeProgramme(tenantId: string, user: JwtUser, planId: string) {
    await this.assertTemplateLive(tenantId);
    const plan = await this.plan(tenantId, planId);
    if (!Array.isArray(plan.homeProgramme) || plan.homeProgramme.length === 0) throw new ConflictException({ message: "Add a home exercise programme first", errorCode: "PHYSIO_HEP_EMPTY" });
    const patient = await this.patient(tenantId, plan.patientId);
    if (patient.isSample) throw new ConflictException({ message: "Sample patients are never messaged", errorCode: "PHYSIO_HEP_SAMPLE" });
    if (!patient.phone?.trim()) throw new ConflictException({ message: "Patient has no phone number", errorCode: "PHYSIO_HEP_NO_PHONE" });
    const clinic = plan.clinicId ? await this.prisma.clinic.findUnique({ where: { id: plan.clinicId }, select: { nameEn: true, nameAr: true } }) : null;
    const clinicName = clinic?.nameAr?.trim() || clinic?.nameEn || "Kiorly";
    const raw = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + PHYSIO_HEP_TTL_DAYS * 86_400_000);
    const link = `${rxWebBase()}/hep/${encodeURIComponent(raw)}`;
    const msg = await this.messaging.queueMessage(tenantId, {
      patientId: plan.patientId,
      channel: MessageChannel.WHATSAPP,
      toPhone: patient.phone.trim(),
      templateKey: PHYSIO_HEP_TEMPLATE_KEY,
      body: `${clinicName}: ${link}`,
      variables: { clinic: clinicName, link },
      metadata: { kind: "PHYSIO_HEP", planId },
    });
    await this.prisma.physioHepLink.create({ data: { tenantId, planId, tokenHash: hash(raw), expiresAt, sharedAt: new Date() } });
    await this.audit.recordEvent({ tenantId, actorId: user.userId, clinicId: plan.clinicId, action: "physio.hep.shared", resource: "PhysioTreatmentPlan", resourceId: planId, metadata: { outboundMessageId: msg.id, expiresAt: expiresAt.toISOString() } });
    return { outboundMessageId: msg.id, status: msg.status, link, expiresAt: expiresAt.toISOString() };
  }

  /** Public projection: exercises and clinic name only. No patient name, phone, MRN, diagnosis or notes. */
  async publicHomeProgramme(rawToken: string) {
    const link = await this.prisma.physioHepLink.findUnique({ where: { tokenHash: hash(rawToken) }, include: { plan: true } });
    if (!link || link.expiresAt.getTime() < Date.now()) throw new NotFoundException("Link expired or invalid");
    const clinic = link.plan.clinicId ? await this.prisma.clinic.findUnique({ where: { id: link.plan.clinicId }, select: { nameEn: true, nameAr: true } }) : null;
    return { clinicNameEn: clinic?.nameEn ?? null, clinicNameAr: clinic?.nameAr ?? null, exercises: link.plan.homeProgramme, expiresAt: link.expiresAt.toISOString() };
  }
}
