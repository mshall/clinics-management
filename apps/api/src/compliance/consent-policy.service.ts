import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { MessageChannel } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  CONSENT_ERROR_MESSAGES,
  CONSENT_PURPOSE_AI,
  CONSENT_PURPOSE_DATA,
  CONSENT_PURPOSE_MARKETPLACE,
  CONSENT_PURPOSE_MESSAGING_MARKETING,
  type ConsentPurpose,
  type ConsentRequireContext,
} from "./consent-policy.constants";
import {
  defaultConsentGranted,
  MESSAGING_CONSENT_MARKETING,
} from "../patients/messaging-consent.constants";

export type PatientConsentStatusDto = {
  purpose: ConsentPurpose;
  granted: boolean;
  source: string | null;
  capturedAt: string | null;
  signerName: string | null;
  signedOnTablet: boolean | null;
};

export type CaptureConsentInput = {
  granted: boolean;
  source: string;
  signerName?: string | null;
  signedOnTablet?: boolean | null;
};

@Injectable()
export class ConsentPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async messagingMarketingGranted(
    tenantId: string,
    patientId: string,
    channel: MessageChannel,
  ): Promise<boolean> {
    const row = await this.prisma.messagingConsent.findUnique({
      where: {
        patientId_channel_purpose: { patientId, channel, purpose: MESSAGING_CONSENT_MARKETING },
      },
    });
    if (!row || row.tenantId !== tenantId) return defaultConsentGranted(MESSAGING_CONSENT_MARKETING);
    return row.granted;
  }

  private async assertPatient(tenantId: string, patientId: string) {
    const p = await this.prisma.patient.findFirst({
      where: { id: patientId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!p) throw new NotFoundException("Patient not found");
  }

  private deny(purpose: ConsentPurpose, locale?: "en" | "ar") {
    const meta = CONSENT_ERROR_MESSAGES[purpose];
    const message = locale === "ar" ? meta.ar : meta.en;
    throw new ForbiddenException({
      message,
      errorCode: meta.code,
      purpose,
    });
  }

  async isGranted(tenantId: string, patientId: string, purpose: ConsentPurpose): Promise<boolean> {
    if (purpose === CONSENT_PURPOSE_MESSAGING_MARKETING) {
      return this.messagingMarketingGranted(tenantId, patientId, MessageChannel.WHATSAPP);
    }
    if (purpose === CONSENT_PURPOSE_DATA) {
      const row = await this.prisma.patientConsent.findUnique({
        where: { patientId_purpose: { patientId, purpose: CONSENT_PURPOSE_DATA } },
      });
      if (row?.tenantId === tenantId && row.granted) return true;
      const legacy = await this.prisma.patientDataProtectionConsent.findFirst({
        where: { tenantId, patientId },
      });
      return Boolean(legacy);
    }
    const row = await this.prisma.patientConsent.findUnique({
      where: { patientId_purpose: { patientId, purpose } },
    });
    return Boolean(row && row.tenantId === tenantId && row.granted);
  }

  async require(
    tenantId: string,
    patientId: string,
    purpose: ConsentPurpose,
    context?: ConsentRequireContext & { locale?: "en" | "ar" },
  ): Promise<void> {
    if (purpose === CONSENT_PURPOSE_MESSAGING_MARKETING) {
      const channel = context?.channel ?? MessageChannel.WHATSAPP;
      const ok = await this.messagingMarketingGranted(tenantId, patientId, channel);
      if (!ok) this.deny(CONSENT_PURPOSE_MESSAGING_MARKETING, context?.locale);
      return;
    }
    const ok = await this.isGranted(tenantId, patientId, purpose);
    if (!ok) this.deny(purpose, context?.locale);
  }

  async capture(
    tenantId: string,
    patientId: string,
    purpose: Exclude<ConsentPurpose, typeof CONSENT_PURPOSE_MESSAGING_MARKETING>,
    input: CaptureConsentInput,
    actorId?: string | null,
  ) {
    await this.assertPatient(tenantId, patientId);
    const row = await this.prisma.patientConsent.upsert({
      where: { patientId_purpose: { patientId, purpose } },
      create: {
        tenantId,
        patientId,
        purpose,
        granted: input.granted,
        source: input.source,
        signerName: input.signerName?.trim() || null,
        signedOnTablet: input.signedOnTablet ?? null,
      },
      update: {
        granted: input.granted,
        source: input.source,
        signerName: input.signerName?.trim() || null,
        signedOnTablet: input.signedOnTablet ?? null,
        capturedAt: new Date(),
      },
    });
    if (actorId) {
      await this.audit.recordEvent({
        tenantId,
        actorId,
        clinicId: null,
        action: "PATIENT_CONSENT_CAPTURED",
        resource: "Patient",
        resourceId: patientId,
        metadata: { purpose, granted: input.granted, source: input.source },
      });
    }
    return row;
  }

  async captureCheckInBundle(
    tenantId: string,
    patientId: string,
    actorId: string,
    body: {
      dataProcessing?: boolean;
      aiProcessing?: boolean;
      marketplaceSharing?: boolean;
      signerName?: string;
      signedOnTablet?: boolean;
    },
  ) {
    const source = body.signedOnTablet ? "check_in_tablet" : "check_in_receptionist";
    const base = {
      signerName: body.signerName,
      signedOnTablet: body.signedOnTablet ?? false,
    };
    if (body.dataProcessing) {
      await this.capture(tenantId, patientId, CONSENT_PURPOSE_DATA, { granted: true, source, ...base }, actorId);
    }
    if (body.aiProcessing) {
      await this.capture(tenantId, patientId, CONSENT_PURPOSE_AI, { granted: true, source, ...base }, actorId);
    }
    if (body.marketplaceSharing) {
      await this.capture(tenantId, patientId, CONSENT_PURPOSE_MARKETPLACE, { granted: true, source, ...base }, actorId);
    }
  }

  async listForPatient(tenantId: string, patientId: string): Promise<PatientConsentStatusDto[]> {
    await this.assertPatient(tenantId, patientId);
    const rows = await this.prisma.patientConsent.findMany({ where: { tenantId, patientId } });
    const byPurpose = new Map(rows.map((r) => [r.purpose, r]));

    const purposes: ConsentPurpose[] = [
      CONSENT_PURPOSE_DATA,
      CONSENT_PURPOSE_AI,
      CONSENT_PURPOSE_MARKETPLACE,
      CONSENT_PURPOSE_MESSAGING_MARKETING,
    ];

    const out: PatientConsentStatusDto[] = [];
    for (const purpose of purposes) {
      if (purpose === CONSENT_PURPOSE_MESSAGING_MARKETING) {
        const granted = await this.messagingMarketingGranted(tenantId, patientId, MessageChannel.WHATSAPP);
        const rows = await this.prisma.messagingConsent.findUnique({
          where: {
            patientId_channel_purpose: {
              patientId,
              channel: MessageChannel.WHATSAPP,
              purpose: MESSAGING_CONSENT_MARKETING,
            },
          },
        });
        out.push({
          purpose,
          granted,
          source: rows?.source ?? null,
          capturedAt: rows?.updatedAt.toISOString() ?? null,
          signerName: null,
          signedOnTablet: null,
        });
        continue;
      }
      if (purpose === CONSENT_PURPOSE_DATA) {
        const row = byPurpose.get(CONSENT_PURPOSE_DATA);
        let granted = Boolean(row?.granted);
        let capturedAt = row?.capturedAt.toISOString() ?? null;
        let source = row?.source ?? null;
        let signerName = row?.signerName ?? null;
        let signedOnTablet = row?.signedOnTablet ?? null;
        if (!granted) {
          const legacy = await this.prisma.patientDataProtectionConsent.findFirst({
            where: { tenantId, patientId },
            orderBy: { signedAt: "desc" },
          });
          if (legacy) {
            granted = true;
            capturedAt = legacy.signedAt.toISOString();
            source = legacy.signedOnTablet ? "data_protection_tablet" : "data_protection_staff";
            signerName = legacy.signerName;
            signedOnTablet = legacy.signedOnTablet;
          }
        }
        out.push({ purpose, granted, source, capturedAt, signerName, signedOnTablet });
        continue;
      }
      const row = byPurpose.get(purpose);
      out.push({
        purpose,
        granted: Boolean(row?.granted),
        source: row?.source ?? null,
        capturedAt: row?.capturedAt.toISOString() ?? null,
        signerName: row?.signerName ?? null,
        signedOnTablet: row?.signedOnTablet ?? null,
      });
    }
    return out;
  }
}