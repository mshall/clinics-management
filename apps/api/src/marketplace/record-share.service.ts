import { BadRequestException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { createHmac } from "node:crypto";
import { Prisma, RecordShareScope } from "@prisma/client";
import { FeatureFlagsService, requireFeature } from "../feature-flags/feature-flags-public";
import { mintRxVerificationToken, rxPdfUrl } from "../clinical/rx-verification-token";
import { PrismaService } from "../prisma/prisma.service";
import { OUTBOX_EVENT, OUTBOX_STATUS, OUTBOX_TARGET_KIOREX } from "../messaging/outbox-event-types";
import {
  isActiveShareGrant,
  isRecordShareScope,
  RECORD_SHARE_SCOPES,
} from "./record-share.scopes";

export type RecordShareConsentInput = {
  scope: string;
  granted: boolean;
};

@Injectable()
export class RecordShareService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly flags?: FeatureFlagsService,
  ) {}

  async upsertFromMarketplace(patientId: string, consents: RecordShareConsentInput[]) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, deletedAt: null },
      select: { id: true, tenantId: true },
    });
    if (!patient) throw new NotFoundException("Patient not found");
    // clinic.record_share_patient_app OFF: no NEW grants from the Kiorex patient app (403 FEATURE_DISABLED).
    // Revocations always pass: consent withdrawal is a safety control, never a flag (ADR-025).
    if (this.flags && consents.some((c) => c.granted)) {
      await requireFeature(this.flags, patient.tenantId, "clinic.record_share_patient_app");
    }
    return this.upsertConsents(patient.tenantId, patient.id, consents, "KIOREX");
  }

  async listForPatient(tenantId: string, patientId: string) {
    await this.assertPatient(tenantId, patientId);
    const rows = await this.prisma.patientRecordShareConsent.findMany({
      where: { tenantId, patientId },
    });
    const byScope = new Map(rows.map((r) => [r.scope, r]));
    return RECORD_SHARE_SCOPES.map((scope) => {
      const row = byScope.get(scope);
      return {
        scope,
        granted: isActiveShareGrant(row),
        source: row?.source ?? null,
        capturedAt: row?.capturedAt?.toISOString() ?? null,
        revokedAt: row?.revokedAt?.toISOString() ?? null,
        updatedAt: row?.updatedAt?.toISOString() ?? null,
      };
    });
  }

  /** Clinic UI or Kiorex marketplace upsert. Revocation sets revokedAt and emits deletion request. */
  async upsertConsents(
    tenantId: string,
    patientId: string,
    consents: RecordShareConsentInput[],
    source: string,
  ) {
    await this.assertPatient(tenantId, patientId);
    if (!Array.isArray(consents) || consents.length === 0) {
      throw new BadRequestException("consents array required");
    }

    for (const item of consents) {
      if (!isRecordShareScope(item.scope)) {
        throw new BadRequestException(`Unknown record-share scope: ${item.scope}`);
      }
      const scope = item.scope as RecordShareScope;
      const existing = await this.prisma.patientRecordShareConsent.findUnique({
        where: { patientId_scope: { patientId, scope } },
      });
      const wasActive = isActiveShareGrant(existing);
      const now = new Date();

      if (item.granted) {
        await this.prisma.patientRecordShareConsent.upsert({
          where: { patientId_scope: { patientId, scope } },
          create: {
            tenantId,
            patientId,
            scope,
            granted: true,
            source,
            capturedAt: now,
            revokedAt: null,
          },
          update: {
            granted: true,
            source,
            capturedAt: now,
            revokedAt: null,
          },
        });
      } else {
        await this.prisma.patientRecordShareConsent.upsert({
          where: { patientId_scope: { patientId, scope } },
          create: {
            tenantId,
            patientId,
            scope,
            granted: false,
            source,
            capturedAt: now,
            revokedAt: now,
          },
          update: {
            granted: false,
            source,
            revokedAt: wasActive || !existing ? now : existing!.revokedAt ?? now,
          },
        });
        if (wasActive) {
          await this.enqueueKiorex(tenantId, OUTBOX_EVENT.RECORD_SHARE_REVOKED, "Patient", patientId, {
            patientId,
            scope,
            action: "DELETE_REQUESTED",
          });
        }
      }
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        action: "patient.record_share_consent",
        resource: "Patient",
        resourceId: patientId,
        metadata: { consents, source },
      },
    });

    return this.listForPatient(tenantId, patientId);
  }

  async hasActiveConsent(tenantId: string, patientId: string, scope: RecordShareScope): Promise<boolean> {
    const row = await this.prisma.patientRecordShareConsent.findUnique({
      where: { patientId_scope: { patientId, scope } },
    });
    return isActiveShareGrant(row);
  }

  /**
   * Opaque consent token for a v2 hand-off (PrescriptionIssued / LabOrderPlaced): derived from the active grant row,
   * so it changes when the patient re-consents and cannot be minted without an active, non-revoked grant. Returns
   * null when the patient has not consented for the scope.
   */
  async consentTokenFor(tenantId: string, patientId: string, scope: RecordShareScope): Promise<string | null> {
    const row = await this.prisma.patientRecordShareConsent.findUnique({
      where: { patientId_scope: { patientId, scope } },
    });
    if (!row || row.tenantId !== tenantId || !isActiveShareGrant(row)) return null;
    const mac = createHmac("sha256", process.env.KIOREX_RECORD_SHARE_HMAC_SECRET?.trim() || "dev-record-share-secret")
      .update(`${row.id}:${row.scope}:${row.capturedAt.getTime()}`, "utf8")
      .digest("base64url")
      .slice(0, 32);
    return `rsc_${mac}`;
  }

  /**
   * After visit sign-off: push visit summary (+ Rx when consented) to Kiorex via outbox.
   * Returns null when nothing was shared (no consent).
   */
  async shareAfterSignOff(tenantId: string, encounterId: string): Promise<{ shared: string[] } | null> {
    const enc = await this.prisma.encounter.findFirst({
      where: { id: encounterId, tenantId },
      select: {
        id: true,
        patientId: true,
        clinicId: true,
        signedAt: true,
        appointmentId: true,
        chiefComplaint: true,
        subjective: true,
        objective: true,
        assessment: true,
        plan: true,
        followUpWeeks: true,
        medications: { select: { id: true, drugName: true, dosage: true, frequency: true, duration: true }, orderBy: { createdAt: "asc" }, take: 50 },
        patient: { select: { isSample: true } },
      },
    });
    if (!enc?.signedAt || enc.patient.isSample) return null;

    const shared: string[] = [];
    const visitOk = await this.hasActiveConsent(tenantId, enc.patientId, RecordShareScope.VISIT_SUMMARY);
    const rxOk = await this.hasActiveConsent(tenantId, enc.patientId, RecordShareScope.PRESCRIPTIONS);

    if (!visitOk && !(rxOk && enc.medications.length > 0)) {
      return null;
    }

    if (visitOk) {
      const summary = {
        encounterId: enc.id,
        clinicId: enc.clinicId,
        signedAt: enc.signedAt.toISOString(),
        soap: {
          chiefComplaint: enc.chiefComplaint,
          subjective: enc.subjective,
          objective: enc.objective,
          assessment: enc.assessment,
          plan: enc.plan,
        },
      };
      const signature = signPayload(summary);
      await this.enqueueKiorex(tenantId, OUTBOX_EVENT.VISIT_SUMMARY_SHARED, "Encounter", enc.id, {
        patientId: enc.patientId,
        scope: RecordShareScope.VISIT_SUMMARY,
        summary,
        signature,
        // GRW-GC-2 G-10 (contracts 1.12.0): the interval sits BESIDE the signed summary so the signature is unchanged. Interval only, never a diagnosis.
        ...(followUpIntervalDays(enc.followUpWeeks) ? { followUp: { intervalDays: followUpIntervalDays(enc.followUpWeeks) } } : {}),
      });
      shared.push(RecordShareScope.VISIT_SUMMARY);
    }

    if (rxOk && enc.medications.length > 0) {
      // Rx PDF: a signed, expiring public link to the same PDF the clinic prints/WhatsApps (CL-03). Kiorex fetches it
      // into the patient's vault; the link carries no more PHI than the printed Rx and is never logged.
      const { raw, expiresAt } = await mintRxVerificationToken(this.prisma, tenantId, enc.id, null);
      await this.enqueueKiorex(tenantId, OUTBOX_EVENT.PRESCRIPTION_SHARED, "Encounter", enc.id, {
        patientId: enc.patientId,
        scope: RecordShareScope.PRESCRIPTIONS,
        encounterId: enc.id,
        clinicId: enc.clinicId,
        signedAt: enc.signedAt.toISOString(),
        // contracts 1.13.0 (optional): the visit the prescription came from, an id only; Kiorex falls back to its 7-day inference when absent
        ...(enc.appointmentId ? { appointmentId: enc.appointmentId } : {}),
        ...(rxItems(enc.medications).length ? { items: rxItems(enc.medications) } : {}),
        pdf: { url: rxPdfUrl(raw), expiresAt: expiresAt.toISOString() },
      });
      shared.push(RecordShareScope.PRESCRIPTIONS);
    }

    return { shared };
  }

  /**
   * Contracts 1.13.0 `CARE_PLAN_SUGGESTED`: the treating clinician of a SIGNED visit suggests follow-up care at home. Sent only when the patient's VISIT_SUMMARY share
   * consent is active (the same consent that lets Kiorex know the visit exists); one event per encounter (idempotent); ids and a time only: never the reason, a diagnosis or a note.
   */
  async suggestCarePlan(tenantId: string, encounterId: string): Promise<{ suggested: boolean; reason?: "NOT_SIGNED" | "NO_CONSENT" | "ALREADY_SUGGESTED" | "SAMPLE_PATIENT" }> {
    const enc = await this.prisma.encounter.findFirst({
      where: { id: encounterId, tenantId },
      select: { id: true, patientId: true, clinicId: true, signedAt: true, appointmentId: true, patient: { select: { isSample: true } } },
    });
    if (!enc) throw new NotFoundException("Encounter not found");
    if (!enc.signedAt) return { suggested: false, reason: "NOT_SIGNED" };
    if (enc.patient.isSample) return { suggested: false, reason: "SAMPLE_PATIENT" };
    if (!(await this.hasActiveConsent(tenantId, enc.patientId, RecordShareScope.VISIT_SUMMARY))) return { suggested: false, reason: "NO_CONSENT" };
    const existing = await this.prisma.outboxEvent.findFirst({ where: { tenantId, type: OUTBOX_EVENT.CARE_PLAN_SUGGESTED, aggregateType: "Encounter", aggregateId: enc.id }, select: { id: true } });
    if (existing) return { suggested: false, reason: "ALREADY_SUGGESTED" };
    await this.enqueueKiorex(tenantId, OUTBOX_EVENT.CARE_PLAN_SUGGESTED, "Encounter", enc.id, {
      patientId: enc.patientId,
      encounterId: enc.id,
      clinicId: enc.clinicId,
      ...(enc.appointmentId ? { appointmentId: enc.appointmentId } : {}),
      suggestedAt: new Date().toISOString(),
    });
    return { suggested: true };
  }

  private async enqueueKiorex(
    tenantId: string,
    type: string,
    aggregateType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
  ) {
    await this.prisma.outboxEvent.create({
      data: {
        tenantId,
        type,
        aggregateType,
        aggregateId,
        payload: {
          ...payload,
          aggregateType,
          aggregateId,
        } as Prisma.InputJsonValue,
        target: OUTBOX_TARGET_KIOREX,
        status: OUTBOX_STATUS.PENDING,
        attempts: 0,
        nextAttemptAt: new Date(),
      },
    });
  }

  private async assertPatient(tenantId: string, patientId: string) {
    const p = await this.prisma.patient.findFirst({ where: { id: patientId, tenantId }, select: { id: true } });
    if (!p) throw new NotFoundException("Patient not found");
  }
}

export function signPayload(payload: unknown): string {
  const secret = process.env.KIOREX_RECORD_SHARE_HMAC_SECRET?.trim() || "dev-record-share-secret";
  return createHmac("sha256", secret).update(JSON.stringify(payload), "utf8").digest("hex");
}


/** Weeks (1..104) to the contract's interval in days (1..730); absent when unset or out of range. */
export function followUpIntervalDays(weeks: number | null | undefined): number | undefined {
  if (!weeks || !Number.isInteger(weeks) || weeks < 1) return undefined;
  const days = weeks * 7;
  return days >= 1 && days <= 730 ? days : undefined;
}

type RxRow = { drugName: string; dosage: string | null; frequency: string | null; duration: string | null };
const clip = (v: string | null | undefined, n: number) => (v ?? "").trim().slice(0, n);

/** Structured Rx lines (marketplace 1.6.0 `items[]`): name, dose, frequency, durationDays when the free-text duration parses ("7 days", "2 weeks"). The signed PDF stays the legal document. */
export function rxItems(rows: RxRow[]): { name: string; dose?: string; frequency?: string; durationDays?: number }[] {
  return rows
    .filter((r) => r.drugName?.trim())
    .slice(0, 50)
    .map((r) => {
      const dose = clip(r.dosage, 100);
      const frequency = clip(r.frequency, 100);
      const durationDays = parseDurationDays(r.duration);
      return { name: clip(r.drugName, 200), ...(dose ? { dose } : {}), ...(frequency ? { frequency } : {}), ...(durationDays ? { durationDays } : {}) };
    });
}

export function parseDurationDays(text: string | null | undefined): number | undefined {
  const m = /^\s*(\d{1,4})\s*(day|days|d|week|weeks|w|month|months|يوم|ايام|أيام|اسبوع|أسبوع|اسابيع|أسابيع|شهر)?\s*$/i.exec(text ?? "");
  if (!m) return undefined;
  const n = Number(m[1]);
  const u = (m[2] ?? "day").toLowerCase();
  const mult = /^(week|weeks|w|اسبوع|أسبوع|اسابيع|أسابيع)$/.test(u) ? 7 : /^(month|months|شهر)$/.test(u) ? 30 : 1;
  const days = n * mult;
  return days >= 1 && days <= 3650 ? days : undefined;
}
