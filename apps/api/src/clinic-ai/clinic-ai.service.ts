import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { AppointmentStatus, EncounterStatus, UsageMetric } from "@prisma/client";
import { computeNoShowRisk } from "../common/no-show-risk";
import { ConsentPolicyService } from "../compliance/consent-policy.service";
import { CONSENT_PURPOSE_AI } from "../compliance/consent-policy.constants";
import { PrismaService } from "../prisma/prisma.service";
import { constrainDraftToScope } from "../scope-of-practice/profession-prompt";
import { ScopeOfPracticeService } from "../scope-of-practice/scope-of-practice.service";
import { UsageMeterService } from "../usage/usage-meter.service";
import {
  assertPilotDraftLatency,
  draftNoteFromTranscript,
  transcribeScribeAudio,
} from "./scribe-stt.provider";

@Injectable()
export class ClinicAiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consent: ConsentPolicyService,
    private readonly usage: UsageMeterService,
    @Optional() private readonly scope?: ScopeOfPracticeService,
  ) {}

  async preVisitSummary(tenantId: string, patientId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, tenantId, deletedAt: null },
      include: { allergies: { take: 5 } },
    });
    if (!patient) throw new NotFoundException("Patient not found");

    const [lastEncounters, meds, pendingLabs] = await Promise.all([
      this.prisma.encounter.findMany({
        where: { tenantId, patientId },
        orderBy: { updatedAt: "desc" },
        take: 3,
        select: { chiefComplaint: true, status: true, updatedAt: true, clinician: { select: { displayName: true } } },
      }),
      this.prisma.encounterMedication.findMany({
        where: { tenantId, encounter: { patientId } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { drugName: true, dosage: true },
      }),
      this.prisma.encounterDocument.findMany({
        where: { tenantId, encounter: { patientId }, kind: { in: ["LAB", "RADIOLOGY"] } },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { kind: true, originalFileName: true, createdAt: true },
      }),
    ]);

    const lines: string[] = [];
    lines.push(
      `Patient ${patient.firstNameEn} ${patient.lastNameEn} · MRN ${patient.mrn}` +
        (patient.allergies.length ? ` · ${patient.allergies.length} allergy alert(s)` : ""),
    );
    if (lastEncounters.length) {
      const e = lastEncounters[0];
      lines.push(
        `Last visit ${e.updatedAt.toISOString().slice(0, 10)} (${e.clinician?.displayName ?? "clinician"}): ${e.chiefComplaint ?? "—"}.`,
      );
    } else lines.push("No prior visits on file.");
    if (meds.length) {
      lines.push(`Active/recent meds: ${meds.map((m) => m.drugName).join(", ")}.`);
    } else lines.push("No recent medications recorded.");
    if (pendingLabs.length) {
      lines.push(`Pending/recent results: ${pendingLabs.map((d) => d.kind).join(", ")}.`);
    } else lines.push("No pending lab/radiology uploads flagged.");
    lines.push("Use allergies, problems, and vitals on the chart before starting.");

    return { patientId, lines: lines.slice(0, 5) };
  }

  computeNoShowRisk(patientNoShowCount: number, requiresDeposit: boolean, hoursUntilStart: number): number {
    return computeNoShowRisk({ noShowCount: patientNoShowCount, requiresDeposit, hoursUntilStart }).score;
  }

  /** Persists the FS-05 rule-based score on upcoming SCHEDULED / CONFIRMED appointments (nightly job + manual refresh). */
  async refreshAppointmentNoShowRisks(tenantId: string, clinicId?: string, now: Date = new Date()) {
    let updated = 0;
    let cursor: string | undefined;
    for (;;) {
      const appointments = await this.prisma.appointment.findMany({
        where: {
          tenantId,
          ...(clinicId ? { clinicId } : {}),
          status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
          startsAt: { gte: now },
        },
        select: {
          id: true,
          startsAt: true,
          noShowRiskScore: true,
          patient: { select: { noShowCount: true, requiresAppointmentDeposit: true } },
        },
        orderBy: { id: "asc" },
        take: 500,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (appointments.length === 0) break;
      for (const a of appointments) {
        const score = this.computeNoShowRisk(
          a.patient.noShowCount,
          a.patient.requiresAppointmentDeposit,
          (a.startsAt.getTime() - now.getTime()) / 3_600_000,
        );
        if (a.noShowRiskScore != null && Number(a.noShowRiskScore) === score) continue;
        await this.prisma.appointment.update({ where: { id: a.id }, data: { noShowRiskScore: score } });
        updated += 1;
      }
      cursor = appointments[appointments.length - 1]!.id;
    }
    return { updated };
  }

  async startScribeSession(
    tenantId: string,
    encounterId: string,
    opts: { patientConsent: boolean; retainAudioAfterSignOff?: boolean } = { patientConsent: false },
  ) {
    const enc = await this.prisma.encounter.findFirst({
      where: { id: encounterId, tenantId },
      select: { id: true, patientId: true },
    });
    if (!enc) throw new NotFoundException("Encounter not found");
    if (!opts.patientConsent) {
      throw new BadRequestException({
        code: "SCRIBE_CONSENT_REQUIRED",
        message: "Patient must consent to AI recording before the scribe starts.",
      });
    }
    const aiOk = await this.consent.isGranted(tenantId, enc.patientId, CONSENT_PURPOSE_AI);
    if (!aiOk) {
      throw new ForbiddenException({
        code: "AI_CONSENT_REQUIRED",
        purpose: CONSENT_PURPOSE_AI,
        message: "Patient AI processing consent is required before ambient scribe recording.",
      });
    }

    const existing = await this.prisma.aiScribeSession.findFirst({
      where: { tenantId, encounterId, status: { in: ["DRAFT", "RECORDING", "PROCESSING", "READY"] } },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      if (existing.status === "DRAFT" || existing.status === "RECORDING") {
        return this.prisma.aiScribeSession.update({
          where: { id: existing.id },
          data: {
            status: "RECORDING",
            consentGrantedAt: existing.consentGrantedAt ?? new Date(),
            recordingStartedAt: existing.recordingStartedAt ?? new Date(),
            retainAudioAfterSignOff: opts.retainAudioAfterSignOff ?? existing.retainAudioAfterSignOff,
          },
        });
      }
      return existing;
    }
    return this.prisma.aiScribeSession.create({
      data: {
        tenantId,
        encounterId,
        status: "RECORDING",
        consentGrantedAt: new Date(),
        recordingStartedAt: new Date(),
        retainAudioAfterSignOff: opts.retainAudioAfterSignOff ?? false,
        transcript: "",
        draftNote: {
          subjective: "",
          objective: "",
          assessment: "",
          plan: "",
          localeNote: "Egyptian Arabic + English STT — review before sign-off",
        },
        draftRx: { medications: [] },
      },
    });
  }

  async getScribeSession(tenantId: string, sessionId: string) {
    const session = await this.prisma.aiScribeSession.findFirst({
      where: { id: sessionId, tenantId },
      include: { _count: { select: { audioChunks: true } } },
    });
    if (!session) throw new NotFoundException("Scribe session not found");
    const { _count, ...rest } = session;
    return {
      ...rest,
      audioChunkCount: _count.audioChunks,
      hasPersistedAudio: _count.audioChunks > 0,
    };
  }

  async uploadAudioChunk(
    tenantId: string,
    sessionId: string,
    body: { seq: number; mimeType?: string; payloadB64: string },
  ) {
    const session = await this.requireOpenSession(tenantId, sessionId);
    if (!body.payloadB64?.trim()) throw new BadRequestException("payloadB64 is required");
    const seq = Number(body.seq);
    if (!Number.isInteger(seq) || seq < 0) throw new BadRequestException("seq must be a non-negative integer");
    const byteLength = Math.ceil((body.payloadB64.length * 3) / 4);
    if (byteLength > 2_000_000) throw new BadRequestException("Audio chunk too large (max ~1.5MB)");

    await this.prisma.aiScribeAudioChunk.upsert({
      where: { sessionId_seq: { sessionId, seq } },
      create: {
        sessionId,
        seq,
        mimeType: body.mimeType?.trim() || "audio/webm",
        payloadB64: body.payloadB64,
        byteLength,
      },
      update: {
        mimeType: body.mimeType?.trim() || "audio/webm",
        payloadB64: body.payloadB64,
        byteLength,
      },
    });
    if (session.status !== "RECORDING") {
      await this.prisma.aiScribeSession.update({ where: { id: sessionId }, data: { status: "RECORDING" } });
    }
    return { ok: true as const, sessionId, seq, byteLength };
  }

  /**
   * Stop recording → STT + draft. Pilot: ≤10 min audio → usable draft in < 60 s.
   */
  async stopScribeSession(tenantId: string, sessionId: string, body?: { audioSeconds?: number }) {
    const session = await this.requireOpenSession(tenantId, sessionId);
    const chunks = await this.prisma.aiScribeAudioChunk.findMany({
      where: { sessionId },
      orderBy: { seq: "asc" },
      select: { byteLength: true },
    });
    const audioBytes = chunks.reduce((n, c) => n + c.byteLength, 0);
    const audioSeconds =
      body?.audioSeconds != null && body.audioSeconds >= 0
        ? Math.min(Math.floor(body.audioSeconds), 2 * 60 * 60)
        : Math.max(1, Math.round(audioBytes / 16_000)); // rough fallback

    await this.prisma.aiScribeSession.update({
      where: { id: sessionId },
      data: { status: "PROCESSING", recordingStoppedAt: new Date(), audioSeconds },
    });

    const wallStart = Date.now();
    const stt = await transcribeScribeAudio({ audioBytes, audioSeconds });
    let draft = draftNoteFromTranscript(stt.transcript);
    // PRSOP04: the draft never suggests actions outside the encounter clinician's profession.
    if (this.scope) {
      const enc = await this.prisma.encounter.findFirst({ where: { id: session.encounterId, tenantId }, select: { clinicianId: true } });
      const ctx = enc ? await this.scope.resolveContext(enc.clinicianId) : null;
      if (ctx) draft = constrainDraftToScope(draft, ctx.pack, ctx.profession);
    }
    const draftLatencyMs = Date.now() - wallStart;
    const withinPilot = assertPilotDraftLatency(audioSeconds, draftLatencyMs);

    const minutes = Math.max(1, Math.ceil(audioSeconds / 60));
    await this.usage.incrementOnce(tenantId, UsageMetric.AI_SCRIBE_MINUTES, `scribe:${sessionId}`, minutes);

    const updated = await this.prisma.aiScribeSession.update({
      where: { id: sessionId },
      data: {
        status: "READY",
        transcript: stt.transcript,
        sttProvider: stt.provider,
        draftLatencyMs,
        draftNote: {
          subjective: draft.subjective,
          objective: draft.objective,
          assessment: draft.assessment,
          plan: draft.plan,
          localeNote: draft.localeNote,
        },
        draftRx: { medications: draft.medications },
      },
    });

    return {
      ...updated,
      pilotBenchmarkOk: withinPilot,
      languageHints: stt.languageHints,
    };
  }

  async approveScribeDraft(
    tenantId: string,
    sessionId: string,
    body: { subjective?: string; objective?: string; assessment?: string; plan?: string },
  ) {
    const session = await this.prisma.aiScribeSession.findFirst({ where: { id: sessionId, tenantId } });
    if (!session) throw new NotFoundException("Scribe session not found");
    const draft = { ...(session.draftNote as object), ...body };
    return this.prisma.$transaction(async (tx) => {
      await tx.aiScribeSession.update({
        where: { id: sessionId },
        data: { draftNote: draft, status: "APPROVED", approvedAt: new Date() },
      });
      if (!session.retainAudioAfterSignOff) {
        await tx.aiScribeAudioChunk.deleteMany({ where: { sessionId } });
      }
      const enc = await tx.encounter.findFirst({ where: { id: session.encounterId, tenantId } });
      if (enc && enc.status !== EncounterStatus.FINALIZED) {
        await tx.encounter.update({
          where: { id: enc.id },
          data: {
            subjective: body.subjective ?? enc.subjective,
            objective: body.objective ?? enc.objective,
            assessment: body.assessment ?? enc.assessment,
            plan: body.plan ?? enc.plan,
          },
        });
      }
      const remaining = await tx.aiScribeAudioChunk.count({ where: { sessionId } });
      return {
        sessionId,
        appliedToEncounter: Boolean(enc),
        audioRetained: remaining > 0,
        audioPurged: remaining === 0,
      };
    });
  }

  private async requireOpenSession(tenantId: string, sessionId: string) {
    const session = await this.prisma.aiScribeSession.findFirst({ where: { id: sessionId, tenantId } });
    if (!session) throw new NotFoundException("Scribe session not found");
    if (session.status === "APPROVED") throw new BadRequestException("Scribe session already approved");
    return session;
  }
}
