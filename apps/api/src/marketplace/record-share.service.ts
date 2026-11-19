import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { createHmac } from "node:crypto";
import { Prisma, RecordShareScope } from "@prisma/client";
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
  constructor(private readonly prisma: PrismaService) {}

  async upsertFromMarketplace(patientId: string, consents: RecordShareConsentInput[]) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, deletedAt: null },
      select: { id: true, tenantId: true },
    });
    if (!patient) throw new NotFoundException("Patient not found");
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
        chiefComplaint: true,
        subjective: true,
        objective: true,
        assessment: true,
        plan: true,
        medications: { select: { id: true }, take: 1 },
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
      });
      shared.push(RecordShareScope.VISIT_SUMMARY);
    }

    if (rxOk && enc.medications.length > 0) {
      await this.enqueueKiorex(tenantId, OUTBOX_EVENT.PRESCRIPTION_SHARED, "Encounter", enc.id, {
        patientId: enc.patientId,
        scope: RecordShareScope.PRESCRIPTIONS,
        encounterId: enc.id,
        clinicId: enc.clinicId,
        signedAt: enc.signedAt.toISOString(),
      });
      shared.push(RecordShareScope.PRESCRIPTIONS);
    }

    return { shared };
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

function signPayload(payload: unknown): string {
  const secret = process.env.KIOREX_RECORD_SHARE_HMAC_SECRET?.trim() || "dev-record-share-secret";
  return createHmac("sha256", secret).update(JSON.stringify(payload), "utf8").digest("hex");
}
