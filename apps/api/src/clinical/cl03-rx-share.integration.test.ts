import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { MessageChannel, PrismaClient } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { JwtUser } from "../auth/jwt-user";
import { ConsentPolicyService } from "../compliance/consent-policy.service";
import { RecordShareService } from "../marketplace/record-share.service";
import { MessagingService } from "../messaging/messaging.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
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
  return new RxShareService(
    prismaSvc,
    new MessagingService(prismaSvc, consent, usage),
    audit,
    new RecordShareService(prismaSvc),
    new OutboxEventService(prismaSvc),
  );
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
    assert.equal(sent.status, "QUEUED");
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

  it("KCV203 hand-off emits PrescriptionIssued only with the patient's PRESCRIPTIONS consent, once", async () => {
    await assert.rejects(
      () => service().handoffToPharmacy(tenantId, signedId, viewer),
      (e: unknown) => e instanceof ConflictException && JSON.stringify((e as ConflictException).getResponse()).includes("RX_HANDOFF_NO_CONSENT"),
    );
    await prisma.patientRecordShareConsent.upsert({
      where: { patientId_scope: { patientId, scope: "PRESCRIPTIONS" } },
      create: { tenantId, patientId, scope: "PRESCRIPTIONS", granted: true, source: "test" },
      update: { granted: true, revokedAt: null },
    });
    const first = await service().handoffToPharmacy(tenantId, signedId, viewer);
    assert.equal(first.alreadyHandedOff, false);
    const row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: first.eventId } });
    assert.equal(row.type, "PrescriptionIssued");
    assert.equal(row.target, "KIOREX");
    const data = row.payload as Record<string, unknown>;
    assert.match(String(data.consentToken), /^rsc_/);
    assert.equal(data.patientRef, patientId);
    assert.ok(Array.isArray(data.items) && (data.items as unknown[]).length >= 1);
    assert.ok(!JSON.stringify(data).includes("29001011234567"), "never a national id");
    const again = await service().handoffToPharmacy(tenantId, signedId, viewer);
    assert.equal(again.alreadyHandedOff, true);
    assert.equal(again.eventId, first.eventId);
  });

  it("KX-11: the consented PRESCRIPTION_SHARED push carries a signed expiring link to the Rx PDF", async () => {
    // PRESCRIPTIONS consent was granted by the hand-off test above.
    const out = await new RecordShareService(prisma as unknown as PrismaService).shareAfterSignOff(tenantId, signedId);
    assert.ok(out?.shared.includes("PRESCRIPTIONS"));
    const ev = await prisma.outboxEvent.findFirstOrThrow({
      where: { tenantId, type: "PRESCRIPTION_SHARED", aggregateId: signedId },
      orderBy: { createdAt: "desc" },
    });
    const pdf = (ev.payload as { pdf?: { url: string; expiresAt: string } }).pdf!;
    assert.match(pdf.url, /\/api\/v1\/public\/rx\/verify\/[A-Za-z0-9_-]+\/pdf$/);
    assert.ok(new Date(pdf.expiresAt).getTime() > Date.now());
    const token = decodeURIComponent(pdf.url.split("/verify/")[1]!.replace(/\/pdf$/, ""));
    const { pdf: bytes } = await service().pdf(token);
    assert.equal(bytes.subarray(0, 5).toString("latin1"), "%PDF-");
  });
});
