import { Injectable, NotFoundException } from "@nestjs/common";
import { AppointmentStatus, EncounterStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ClinicAiService {
  constructor(private readonly prisma: PrismaService) {}

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
    let score = Math.min(85, patientNoShowCount * 18);
    if (requiresDeposit) score += 12;
    if (hoursUntilStart < 4) score += 8;
    return Math.min(99, Math.max(5, score));
  }

  async refreshAppointmentNoShowRisks(tenantId: string, clinicId?: string) {
    const now = new Date();
    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        ...(clinicId ? { clinicId } : {}),
        status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
        startsAt: { gte: now },
      },
      include: { patient: { select: { noShowCount: true, requiresAppointmentDeposit: true } } },
      take: 200,
    });
  const updates = await Promise.all(
      appointments.map((a) => {
        const hours = (a.startsAt.getTime() - now.getTime()) / 3_600_000;
        const score = this.computeNoShowRisk(
          a.patient.noShowCount,
          a.patient.requiresAppointmentDeposit,
          hours,
        );
        return this.prisma.appointment.update({
          where: { id: a.id },
          data: { noShowRiskScore: score },
        });
      }),
    );
    return { updated: updates.length };
  }

  async startScribeSession(tenantId: string, encounterId: string) {
    const enc = await this.prisma.encounter.findFirst({ where: { id: encounterId, tenantId } });
    if (!enc) throw new NotFoundException("Encounter not found");
    const existing = await this.prisma.aiScribeSession.findFirst({
      where: { tenantId, encounterId, status: { in: ["DRAFT", "RECORDING"] } },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return existing;
    return this.prisma.aiScribeSession.create({
      data: {
        tenantId,
        encounterId,
        status: "DRAFT",
        transcript: "",
        draftNote: {
          subjective: "",
          objective: "",
          assessment: "",
          plan: "",
          localeNote: "Supports Egyptian Arabic mixed with English — wire speech-to-text provider for production",
        },
        draftRx: { medications: [] },
      },
    });
  }

  async approveScribeDraft(tenantId: string, sessionId: string, body: { subjective?: string; objective?: string; assessment?: string; plan?: string }) {
    const session = await this.prisma.aiScribeSession.findFirst({ where: { id: sessionId, tenantId } });
    if (!session) throw new NotFoundException("Scribe session not found");
    const draft = { ...(session.draftNote as object), ...body };
    return this.prisma.$transaction(async (tx) => {
      await tx.aiScribeSession.update({
        where: { id: sessionId },
        data: { draftNote: draft, status: "APPROVED", approvedAt: new Date() },
      });
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
      return { sessionId, appliedToEncounter: Boolean(enc) };
    });
  }
}
