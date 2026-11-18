import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { MessageChannel, PrismaClient } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { MessagingConsentService } from "../patients/messaging-consent.service";
import { MESSAGING_CONSENT_MARKETING } from "../patients/messaging-consent.constants";
import { PrismaService } from "../prisma/prisma.service";
import { MessagingService } from "./messaging.service";
import { ConsentPolicyService } from "../compliance/consent-policy.service";
import { UsageMeterService } from "../usage/usage-meter.service";

const prisma = new PrismaClient();

function messagingStack(): { messaging: MessagingService; consent: MessagingConsentService } {
  const prismaSvc = prisma as unknown as PrismaService;
  const audit = new AuditService(prismaSvc);
  const policy = new ConsentPolicyService(prismaSvc, audit);
  const consent = new MessagingConsentService(prismaSvc, audit, policy);
  const usage = { assertWhatsAppQuota: async () => undefined } as unknown as UsageMeterService;
  const messaging = new MessagingService(prismaSvc, consent, usage);
  return { messaging, consent };
}

describe("MS-03 marketing consent gate", () => {
  let tenantId: string;
  let patientId: string;

  before(async () => {
    await prisma.$connect();
    const clinic = await prisma.clinic.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
    tenantId = clinic.tenantId;
    const patient = await prisma.patient.create({
      data: {
        tenantId,
        mrn: `MS03-${Date.now()}`,
        firstNameEn: "Consent",
        lastNameEn: "Test",
        gender: "UNKNOWN",
        phone: "+201077766655",
      },
    });
    patientId = patient.id;
  });

  after(async () => {
    await prisma.outboundMessage.deleteMany({ where: { patientId } }).catch(() => undefined);
    await prisma.messagingConsent.deleteMany({ where: { patientId } }).catch(() => undefined);
    await prisma.patient.delete({ where: { id: patientId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("opted-out patients never receive marketing messages", async () => {
    const { messaging } = messagingStack();
    await assert.rejects(
      () =>
        messaging.queueRecallCampaignMessage(tenantId, {
          patientId,
          channel: MessageChannel.WHATSAPP,
          toPhone: "+201077766655",
          templateKey: "recall_birthday",
          body: "Happy birthday",
          variables: { name: "Consent" },
        }),
      (err: unknown) => {
        assert.ok(err instanceof ForbiddenException);
        return true;
      },
    );

    await prisma.messagingConsent.create({
      data: {
        tenantId,
        patientId,
        channel: MessageChannel.WHATSAPP,
        purpose: MESSAGING_CONSENT_MARKETING,
        granted: true,
        source: "test",
      },
    });

    const row = await messaging.queueRecallCampaignMessage(tenantId, {
      patientId,
      channel: MessageChannel.WHATSAPP,
      toPhone: "+201077766655",
      templateKey: "recall_birthday",
      body: "Happy birthday",
      variables: { name: "Consent" },
    });
    assert.equal(row.status, "QUEUED");
    assert.equal(row.templateKey, "recall_birthday");
    await prisma.outboundMessage.delete({ where: { id: row.id } });
  });
});