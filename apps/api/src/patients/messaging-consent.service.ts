import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { MessageChannel } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  defaultConsentGranted,
  MESSAGING_CONSENT_CHANNELS,
  MESSAGING_CONSENT_MARKETING,
  MESSAGING_CONSENT_TRANSACTIONAL,
  type MessagingConsentPurpose,
  resolveMessagingPurpose,
} from "./messaging-consent.constants";
import { ConsentPolicyService } from "../compliance/consent-policy.service";
import { CONSENT_PURPOSE_MESSAGING_MARKETING } from "../compliance/consent-policy.constants";

export type MessagingConsentDto = {
  channel: MessageChannel;
  purpose: MessagingConsentPurpose;
  granted: boolean;
  source: string | null;
  updatedAt: string | null;
};

@Injectable()
export class MessagingConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly consentPolicy: ConsentPolicyService,
  ) {}

  async listForPatient(tenantId: string, patientId: string): Promise<MessagingConsentDto[]> {
    await this.assertPatient(tenantId, patientId);
    const rows = await this.prisma.messagingConsent.findMany({
      where: { tenantId, patientId },
    });
    const byKey = new Map(rows.map((r) => [`${r.channel}:${r.purpose}`, r]));
    const out: MessagingConsentDto[] = [];
    for (const channel of MESSAGING_CONSENT_CHANNELS) {
      for (const purpose of [MESSAGING_CONSENT_TRANSACTIONAL, MESSAGING_CONSENT_MARKETING] as const) {
        const row = byKey.get(`${channel}:${purpose}`);
        out.push({
          channel,
          purpose,
          granted: row?.granted ?? defaultConsentGranted(purpose),
          source: row?.source ?? null,
          updatedAt: row?.updatedAt.toISOString() ?? null,
        });
      }
    }
    return out;
  }

  async putForPatient(
    tenantId: string,
    patientId: string,
    actorId: string,
    body: { consents: { channel: MessageChannel; purpose: string; granted: boolean }[] },
  ): Promise<MessagingConsentDto[]> {
    await this.assertPatient(tenantId, patientId);
    for (const c of body.consents ?? []) {
      const purposeRaw = c.purpose?.trim().toUpperCase();
      if (purposeRaw !== MESSAGING_CONSENT_TRANSACTIONAL && purposeRaw !== MESSAGING_CONSENT_MARKETING) continue;
      if (c.channel !== MessageChannel.WHATSAPP && c.channel !== MessageChannel.SMS) continue;
      const purpose = purposeRaw as MessagingConsentPurpose;
      await this.prisma.messagingConsent.upsert({
        where: {
          patientId_channel_purpose: { patientId, channel: c.channel, purpose },
        },
        create: {
          tenantId,
          patientId,
          channel: c.channel,
          purpose,
          granted: Boolean(c.granted),
          source: "staff_ui",
        },
        update: { granted: Boolean(c.granted), source: "staff_ui" },
      });
      await this.audit.recordEvent({
        tenantId,
        actorId,
        clinicId: null,
        action: "MESSAGING_CONSENT_UPDATED",
        resource: "Patient",
        resourceId: patientId,
        metadata: { channel: c.channel, purpose, granted: Boolean(c.granted), source: "staff_ui" },
      });
    }
    return this.listForPatient(tenantId, patientId);
  }

  /** ON-08 — sample ("try it") patients never receive WhatsApp/SMS. */
  async isSamplePatient(tenantId: string, patientId: string): Promise<boolean> {
    const p = await this.prisma.patient.findFirst({ where: { id: patientId, tenantId }, select: { isSample: true } });
    return p?.isSample === true;
  }

  async isGranted(
    tenantId: string,
    patientId: string,
    channel: MessageChannel,
    purpose: MessagingConsentPurpose,
  ): Promise<boolean> {
    if (await this.isSamplePatient(tenantId, patientId)) return false;
    const row = await this.prisma.messagingConsent.findUnique({
      where: { patientId_channel_purpose: { patientId, channel, purpose } },
    });
    if (!row || row.tenantId !== tenantId) return defaultConsentGranted(purpose);
    return row.granted;
  }

  async assertCanSend(
    tenantId: string,
    patientId: string | null | undefined,
    channel: MessageChannel,
    templateKey: string | null | undefined,
  ): Promise<void> {
    if (!patientId?.trim()) return;
    if (await this.isSamplePatient(tenantId, patientId)) {
      throw new ForbiddenException({
        message: "Sample patient — messages are never sent",
        errorCode: "SAMPLE_PATIENT_NO_MESSAGES",
        channel,
      });
    }
    const purpose = resolveMessagingPurpose(templateKey);
    if (purpose === MESSAGING_CONSENT_MARKETING) {
      await this.consentPolicy.require(tenantId, patientId, CONSENT_PURPOSE_MESSAGING_MARKETING, { channel });
      return;
    }
    const ok = await this.isGranted(tenantId, patientId, channel, purpose);
    if (!ok) {
      throw new ForbiddenException({
        message: "Patient has not consented to this type of message",
        errorCode: "MESSAGING_CONSENT_REQUIRED",
        channel,
        purpose,
      });
    }
  }

  async revokeAllWhatsAppForPhone(fromPhone: string, source: string): Promise<number> {
    const digits = fromPhone.replace(/\D/g, "");
    const tail = digits.slice(-10);
    if (tail.length < 8) return 0;
    const patients = await this.prisma.patient.findMany({
      where: {
        deletedAt: null,
        phone: { contains: tail },
      },
      select: { id: true, tenantId: true },
      take: 20,
    });
    let count = 0;
    for (const p of patients) {
      for (const purpose of [MESSAGING_CONSENT_TRANSACTIONAL, MESSAGING_CONSENT_MARKETING] as const) {
        await this.prisma.messagingConsent.upsert({
          where: {
            patientId_channel_purpose: {
              patientId: p.id,
              channel: MessageChannel.WHATSAPP,
              purpose,
            },
          },
          create: {
            tenantId: p.tenantId,
            patientId: p.id,
            channel: MessageChannel.WHATSAPP,
            purpose,
            granted: false,
            source,
          },
          update: { granted: false, source },
        });
      }
      await this.audit.recordEvent({
        tenantId: p.tenantId,
        actorId: null,
        clinicId: null,
        action: "MESSAGING_CONSENT_WHATSAPP_OPT_OUT",
        resource: "Patient",
        resourceId: p.id,
        metadata: { source, phoneTail: tail },
      });
      count += 1;
    }
    return count;
  }

  private async assertPatient(tenantId: string, patientId: string): Promise<void> {
    const row = await this.prisma.patient.findFirst({
      where: { id: patientId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!row) throw new NotFoundException("Patient not found");
  }
}