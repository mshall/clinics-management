import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { Gender, MessageChannel, PrismaClient } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { AiGatewayService } from "../providers/ai/ai-gateway.service";
import { AiRuntimeService } from "../providers/ai/ai-runtime.service";
import { MessagingConsentService } from "../patients/messaging-consent.service";
import { ConsentPolicyService } from "./consent-policy.service";
import {
  CONSENT_PURPOSE_AI,
  CONSENT_PURPOSE_MARKETPLACE,
  CONSENT_PURPOSE_MESSAGING_MARKETING,
  CONSENT_ERROR_MESSAGES,
} from "./consent-policy.constants";
import { MESSAGING_CONSENT_MARKETING } from "../patients/messaging-consent.constants";
import { PrismaService } from "../prisma/prisma.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();

function policy(): ConsentPolicyService {
  const prismaSvc = prisma as unknown as PrismaService;
  return new ConsentPolicyService(prismaSvc, new AuditService(prismaSvc));
}

function messaging(): MessagingConsentService {
  const prismaSvc = prisma as unknown as PrismaService;
  const audit = new AuditService(prismaSvc);
  const consent = policy();
  return new MessagingConsentService(prismaSvc, audit, consent);
}

describe("SC-03 consent enforcement", () => {
  let tenantId = "";
  let patientId = "";

  before(async () => {
    await prisma.$connect();
    const clinic = await prisma.clinic.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
    tenantId = clinic.tenantId;
    const patient = await prisma.patient.create({
      data: {
        tenantId,
        mrn: `SC03-${Date.now()}`,
        firstNameEn: "Consent",
        lastNameEn: "Test",
        phone: "+201000009999",
        homeBranchId: clinic.id,
        gender: Gender.UNKNOWN,
      },
    });
    patientId = patient.id;
  });

  after(async () => {
    await prisma.messagingConsent.deleteMany({ where: { patientId } }).catch(() => undefined);
    await prisma.patientConsent.deleteMany({ where: { patientId } }).catch(() => undefined);
    await prisma.patient.delete({ where: { id: patientId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("AI gateway blocks LLM when AI_PROCESSING consent is missing", async () => {
    const consent = policy();
    const gateway = new AiGatewayService({ chatCompletion: async () => ({ ok: true, content: "x" }) } as unknown as AiRuntimeService, consent);
    await assert.rejects(
      () =>
        gateway.chatCompletion(tenantId, { messages: [{ role: "user", content: "hi" }] }, { patientId }),
      (e: unknown) => {
        assert.ok(e instanceof ForbiddenException);
        const body = e.getResponse() as { errorCode?: string };
        assert.equal(body.errorCode, "PATIENT_CONSENT_AI_REQUIRED");
        return true;
      },
    );
    await consent.capture(tenantId, patientId, CONSENT_PURPOSE_AI, { granted: true, source: "test" });
    const out = await gateway.chatCompletion(tenantId, { messages: [{ role: "user", content: "hi" }] }, { patientId });
    assert.equal(out?.ok, true);
  });

  it("marketplace require blocks without MARKETPLACE_SHARING", async () => {
    const consent = policy();
    await assert.rejects(() => consent.require(tenantId, patientId, CONSENT_PURPOSE_MARKETPLACE), ForbiddenException);
    await consent.capture(tenantId, patientId, CONSENT_PURPOSE_MARKETPLACE, { granted: true, source: "kiorex_booking" });
    await consent.require(tenantId, patientId, CONSENT_PURPOSE_MARKETPLACE);
  });

  it("marketing messaging blocks recall without consent", async () => {
    const svc = messaging();
    await prisma.messagingConsent.upsert({
      where: {
        patientId_channel_purpose: {
          patientId,
          channel: MessageChannel.WHATSAPP,
          purpose: MESSAGING_CONSENT_MARKETING,
        },
      },
      create: {
        tenantId,
        patientId,
        channel: MessageChannel.WHATSAPP,
        purpose: MESSAGING_CONSENT_MARKETING,
        granted: false,
        source: "test",
      },
      update: { granted: false },
    });
    await assert.rejects(
      () => svc.assertCanSend(tenantId, patientId, MessageChannel.WHATSAPP, "recall_lapsed"),
      (e: unknown) => {
        assert.ok(e instanceof ForbiddenException);
        const body = e.getResponse() as { errorCode?: string };
        assert.equal(body.errorCode, CONSENT_ERROR_MESSAGES[CONSENT_PURPOSE_MESSAGING_MARKETING].code);
        return true;
      },
    );
  });

  it("GET list includes all purposes", async () => {
    const rows = await policy().listForPatient(tenantId, patientId);
    const purposes = new Set(rows.map((r) => r.purpose));
    assert.ok(purposes.has(CONSENT_PURPOSE_AI));
    assert.ok(purposes.has(CONSENT_PURPOSE_MARKETPLACE));
    assert.ok(purposes.has(CONSENT_PURPOSE_MESSAGING_MARKETING));
  });
});