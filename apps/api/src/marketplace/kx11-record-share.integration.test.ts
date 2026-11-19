import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  EncounterStatus,
  Gender,
  PrismaClient,
  RecordShareScope,
  UserRole,
} from "@prisma/client";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { OUTBOX_EVENT } from "../messaging/outbox-event-types";
import { PrismaService } from "../prisma/prisma.service";
import { RecordShareService } from "./record-share.service";

const prisma = new PrismaClient();

describe("KX-11 record share consent", () => {
  const suffix = `${Date.now()}`;
  let tenantId: string;
  let clinicId: string;
  let patientId: string;
  let clinicianId: string;
  let encounterId: string;
  let svc: RecordShareService;

  before(async () => {
    await prisma.$connect();
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    tenantId = (
      await prisma.tenant.create({
        data: {
          name: `KX11 ${suffix}`,
          deploymentCell: "frankfurt",
          marketId: market.id,
          baseCurrency: "EGP",
        },
      })
    ).id;
    clinicId = (
      await prisma.clinic.create({
        data: {
          tenantId,
          nameEn: "KX11",
          nameAr: "كي",
          country: "EG",
          city: "Cairo",
          addressEn: "a",
          addressAr: "ا",
          locationUrl: "https://maps.example/kx11",
          timezone: "Africa/Cairo",
          phone: "201000000311",
          email: `kx11.${suffix}@example.com`,
          licenseNumber: `EG-KX11-${suffix}`,
          defaultCurrency: "EGP",
        },
      })
    ).id;
    clinicianId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `kx11.dr.${suffix}@example.com`,
          passwordHash: "x",
          displayName: "Dr",
          role: UserRole.PHYSICIAN,
        },
      })
    ).id;
    patientId = (
      await prisma.patient.create({
        data: {
          tenantId,
          mrn: `KX11-${suffix}`,
          firstNameEn: "A",
          lastNameEn: "B",
          gender: Gender.M,
          phone: `2011${suffix.slice(-8)}`,
          homeBranchId: clinicId,
        },
      })
    ).id;
    encounterId = (
      await prisma.encounter.create({
        data: {
          tenantId,
          clinicId,
          patientId,
          clinicianId,
          visitType: "CONSULTATION",
          status: EncounterStatus.FINALIZED,
          signedAt: new Date(),
          finalizedAt: new Date(),
          signedByUserId: clinicianId,
          subjective: "well",
          plan: "rest",
        },
      })
    ).id;
    const prismaSvc = prisma as unknown as PrismaService;
    svc = new RecordShareService(prismaSvc, new OutboxEventService(prismaSvc));
  });

  after(async () => {
    if (tenantId) {
      await prisma.outboxEvent.deleteMany({ where: { tenantId } });
      await prisma.patientRecordShareConsent.deleteMany({ where: { tenantId } });
      await prisma.auditLog.deleteMany({ where: { tenantId } });
      await prisma.encounter.deleteMany({ where: { tenantId } });
      await prisma.patient.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.clinic.deleteMany({ where: { tenantId } });
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("shares nothing without an active consent for that scope", async () => {
    const before = await prisma.outboxEvent.count({
      where: { tenantId, type: OUTBOX_EVENT.VISIT_SUMMARY_SHARED },
    });
    const result = await svc.shareAfterSignOff(tenantId, encounterId);
    assert.equal(result, null);
    const after = await prisma.outboxEvent.count({
      where: { tenantId, type: OUTBOX_EVENT.VISIT_SUMMARY_SHARED },
    });
    assert.equal(after, before);

    await svc.upsertConsents(
      tenantId,
      patientId,
      [{ scope: RecordShareScope.VISIT_SUMMARY, granted: true }],
      "CLINIC",
    );
    const shared = await svc.shareAfterSignOff(tenantId, encounterId);
    assert.ok(shared?.shared.includes(RecordShareScope.VISIT_SUMMARY));
    const events = await prisma.outboxEvent.findMany({
      where: { tenantId, type: OUTBOX_EVENT.VISIT_SUMMARY_SHARED },
    });
    assert.ok(events.length >= 1);
    assert.ok((events[0]!.payload as { signature?: string }).signature);

    await svc.upsertConsents(
      tenantId,
      patientId,
      [{ scope: RecordShareScope.VISIT_SUMMARY, granted: false }],
      "KIOREX",
    );
    const revoked = await prisma.outboxEvent.findFirst({
      where: { tenantId, type: OUTBOX_EVENT.RECORD_SHARE_REVOKED },
    });
    assert.ok(revoked);
  });
});
