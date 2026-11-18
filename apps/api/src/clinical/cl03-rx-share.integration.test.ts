import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { MessageChannel, PrismaClient } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { JwtUser } from "../auth/jwt-user";
import { ConsentPolicyService } from "../compliance/consent-policy.service";
import { MessagingService } from "../messaging/messaging.service";
import { MessagingConsentService } from "../patients/messaging-consent.service";
import { MESSAGING_CONSENT_TRANSACTIONAL } from "../patients/messaging-consent.constants";
import { PrismaService } from "../prisma/prisma.service";
import type { UsageMeterService } from "../usage/usage-meter.service";
import { RX_READY_TEMPLATE_KEY, RxShareService } from "./rx-share.service";

const prisma = new PrismaClient();

function service(): RxShareService {
  const prismaSvc = prisma as unknown as PrismaService;
  const audit = new AuditService(prismaSvc);
  const consent = new MessagingConsentService(prismaSvc, audit, new ConsentPolicyService(prismaSvc, audit));
  const usage = { assertWhatsAppQuota: async () => undefined } as unknown as UsageMeterService;
  return new RxShareService(prismaSvc, new MessagingService(prismaSvc, consent, usage), audit);
}

describe("CL-03 prescription verification & WhatsApp share", () => {
  const stamp = Date.now();
  let tenantId: string;
  let clinicId: string;
  let viewer: JwtUser;
  let patientId: string;
  let signedId: string;
  let draftId: string;

  before(async () => {
    await prisma.$connect();
    const clinic = await prisma.clinic.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
    tenantId = clinic.tenantId;
    clinicId = clinic.id;
    const user = await prisma.user.findFirstOrThrow({ where: { tenantId, deletedAt: null, role: "PHYSICIAN" } });
    viewer = { userId: user.id, tenantId, role: user.role, email: user.email } as JwtUser;
    const patient = await prisma.patient.create({
      data: {
        tenantId,
        mrn: `CL03-${stamp}`,
        firstNameEn: "Karim",
        lastNameEn: "Fathy",
        gender: "UNKNOWN",
        phone: "+201055500003",
        nationalId: "29001011234567",
        dob: new Date("1990-01-01"),
      },
    });
    patientId = patient.id;
    const base = { tenantId, clinicId, patientId, clinicianId: user.id, visitType: "Office visit" };
    const signed = await prisma.encounter.create({
      data: {
        ...base,
        status: "FINALIZED",
        finalizedAt: new Date(),
        signedAt: new Date(),
        signedByUserId: user.id,
        subjective: "SECRET-SOAP-NOTE",
        assessment: "SECRET-ASSESSMENT",
        diagnoses: { create: { tenantId, icd10Code: "J02.9", descriptionEn: "SECRET-DIAGNOSIS", isPrimary: true } },
        medications: {
          create: { tenantId, drugName: "Panadol 500mg", dosage: "1 tab", frequency: "TID", duration: "5 days" },
        },
      },
    });
    signedId = signed.id;
    const draft = await prisma.encounter.create({
      data: { ...base, status: "DRAFT", medications: { create: { tenantId, drugName: "Brufen" } } },
    });
    draftId = draft.id;
  });

  after(async () => {
    await prisma.outboundMessage.deleteMany({ where: { patientId } }).catch(() => undefined);
    await prisma.messagingConsent.deleteMany({ where: { patientId } }).catch(() => undefined);
    await prisma.encounter.deleteMany({ where: { id: { in: [signedId, draftId] } } }).catch(() => undefined);
    await prisma.patient.delete({ where: { id: patientId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("only signed visits get a verified, printable Rx", async () => {
    await assert.rejects(
      () => service().printable(tenantId, draftId, viewer),
      (e: unknown) => e instanceof ConflictException && JSON.stringify(e.getResponse()).includes("RX_NOT_SIGNED"),
    );
    const printed = await service().printable(tenantId, signedId, viewer);
    assert.match(printed.verifyUrl ?? "", /\/rx\/[A-Za-z0-9_-]{20,}$/);
    assert.equal(printed.items[0]!.instructionsAr, "ثلاث مرات يومياً — لمدة ٥ أيام");
    const audit = await prisma.auditLog.findFirst({
      where: { tenantId, action: "RX_VERIFICATION_ISSUED", resourceId: signedId },
    });
    assert.ok(audit);
  });

  it("verification page shows no more PHI than the printed Rx", async () => {
    const printed = await service().printable(tenantId, signedId, viewer);
    const token = decodeURIComponent(printed.verifyUrl!.split("/rx/")[1]!);
    const view = await service().verify(token);
    assert.equal(view.status, "VALID");
    const json = JSON.stringify(view);
    for (const secret of [
      `CL03-${stamp}`,
      "+201055500003",
      "29001011234567",
      "1990-01-01",
      "Fathy",
      "SECRET-SOAP-NOTE",
      "SECRET-ASSESSMENT",
      "SECRET-DIAGNOSIS",
      patientId,
      signedId,
    ]) {
      assert.ok(!json.includes(secret), `verification leaks ${secret}`);
    }
    if (view.status === "VALID") {
      assert.equal(view.patientInitials, "K. F.");
      assert.equal(view.items[0]!.brand, "Panadol 500mg");
      assert.equal(view.doctorName, printed.doctorName);
    }
    const row = await prisma.prescriptionVerificationToken.findFirstOrThrow({
      where: { encounterId: signedId, viewCount: { gt: 0 } },
    });
    assert.equal(row.viewCount, 1);
  });

  it("expired and unknown tokens disclose nothing", async () => {
    const printed = await service().printable(tenantId, signedId, viewer);
    const token = decodeURIComponent(printed.verifyUrl!.split("/rx/")[1]!);
    await prisma.prescriptionVerificationToken.updateMany({
      where: { encounterId: signedId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    assert.deepEqual(await service().verify(token), { status: "EXPIRED" });
    await assert.rejects(() => service().verify("not-a-token"));
    await assert.rejects(() => service().pdf(token));
  });

  it("Send to patient queues the PDF on WhatsApp with the approved template, consent-checked", async () => {
    await assert.rejects(
      () => service().sendToPatient(tenantId, draftId, viewer),
      (e: unknown) => e instanceof ConflictException,
    );
    const sent = await service().sendToPatient(tenantId, signedId, viewer);
    const msg = await prisma.outboundMessage.findUniqueOrThrow({ where: { id: sent.outboundMessageId } });
    assert.equal(msg.channel, MessageChannel.WHATSAPP);
    assert.equal(msg.templateKey, RX_READY_TEMPLATE_KEY);
    assert.equal(msg.status, "QUEUED");
    const meta = msg.metadata as Record<string, string>;
    assert.match(meta.documentLink!, /\/api\/v1\/public\/rx\/verify\/[A-Za-z0-9_-]+\/pdf$/);
    const token = decodeURIComponent(meta.documentLink!.split("/verify/")[1]!.replace(/\/pdf$/, ""));
    const { pdf } = await service().pdf(token);
    assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
    assert.ok(
      await prisma.auditLog.findFirst({ where: { tenantId, action: "RX_SENT_TO_PATIENT", resourceId: signedId } }),
    );

    await prisma.messagingConsent.create({
      data: {
        tenantId,
        patientId,
        channel: MessageChannel.WHATSAPP,
        purpose: MESSAGING_CONSENT_TRANSACTIONAL,
        granted: false,
        source: "test",
      },
    });
    await assert.rejects(
      () => service().sendToPatient(tenantId, signedId, viewer),
      (e: unknown) => e instanceof ForbiddenException,
    );
  });
});
