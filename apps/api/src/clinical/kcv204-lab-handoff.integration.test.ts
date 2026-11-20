import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ClinicalOrderKind, Gender, PrismaClient } from "@prisma/client";
import { ConflictException } from "@nestjs/common";
import { Readable } from "node:stream";
import { RecordShareService } from "../marketplace/record-share.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import type { PrismaService } from "../prisma/prisma.service";
import { ClinicalOrdersService } from "./clinical-orders.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();

describe("KCV204 lab order handoff emits LabOrderPlaced with a consent token", () => {
  const suffix = `kcv204-${Date.now()}`;
  let tenantId: string;
  let clinicId: string;
  let patientId: string;
  let svc: ClinicalOrdersService;

  before(async () => {
    await prisma.$connect();
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    tenantId = (await prisma.tenant.create({ data: { name: `KCV204 ${suffix}`, marketId: market.id, deploymentCell: "frankfurt", baseCurrency: "EGP" } })).id;
    clinicId = (
      await prisma.clinic.create({
        data: {
          tenantId,
          nameEn: "KCV204",
          nameAr: "ا",
          addressEn: "x",
          addressAr: "ا",
          country: "EG",
          city: "Cairo",
          locationUrl: "https://maps.example/kcv204",
          timezone: "Africa/Cairo",
          phone: "201000000204",
          email: `kcv204.${suffix}@example.com`,
          licenseNumber: `EG-KCV204-${suffix}`,
          defaultCurrency: "EGP",
        },
      })
    ).id;
    patientId = (
      await prisma.patient.create({
        data: { tenantId, mrn: `KCV204-${suffix}`, firstNameEn: "Lab", lastNameEn: "Patient", gender: Gender.M, phone: `2012${suffix.slice(-8)}`, homeBranchId: clinicId, nationalId: "29001011234999" },
      })
    ).id;
    const p = prisma as unknown as PrismaService;
    svc = new ClinicalOrdersService(p, { queueMessage: async () => ({ id: "x" }), ensureDefaultTemplates: async () => undefined } as never, new RecordShareService(p), new OutboxEventService(p));
  });

  after(async () => {
    if (tenantId) {
      await prisma.outboxEvent.deleteMany({ where: { tenantId } });
      await prisma.auditLog.deleteMany({ where: { tenantId } });
      await prisma.patientRecordShareConsent.deleteMany({ where: { tenantId } });
      await prisma.clinicalOrderItem.deleteMany({ where: { order: { tenantId } } });
      await prisma.clinicalOrder.deleteMany({ where: { tenantId } });
      await prisma.patient.deleteMany({ where: { tenantId } });
      await prisma.clinic.deleteMany({ where: { tenantId } });
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("requires LAB_RESULTS consent, then emits one LabOrderPlaced (idempotent), never a national id", async () => {
    const order = await svc.create(tenantId, undefined, {
      clinicId,
      patientId,
      kind: ClinicalOrderKind.LAB,
      items: [{ code: "CBC", nameEn: "CBC", nameAr: "صورة دم" }],
    });
    await assert.rejects(
      () => svc.handoffToLab(tenantId, order.id, undefined),
      (e: unknown) => e instanceof ConflictException && JSON.stringify((e as ConflictException).getResponse()).includes("LAB_HANDOFF_NO_CONSENT"),
    );
    await prisma.patientRecordShareConsent.create({
      data: { tenantId, patientId, scope: "LAB_RESULTS", granted: true, source: "test" },
    });
    const first = await svc.handoffToLab(tenantId, order.id, undefined);
    assert.equal(first.alreadyHandedOff, false);
    const ev = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: first.eventId } });
    assert.equal(ev.type, "LabOrderPlaced");
    assert.equal(ev.target, "KIOREX");
    assert.equal(ev.aggregateType, "LabOrder");
    const data = ev.payload as Record<string, unknown>;
    assert.match(String(data.consentToken), /^rsc_/);
    assert.equal(data.patientRef, patientId);
    assert.deepEqual(data.items, [{ code: "CBC", nameEn: "CBC", nameAr: "صورة دم" }]);
    assert.ok(!JSON.stringify(data).includes("29001011234999"));
    const again = await svc.handoffToLab(tenantId, order.id, undefined);
    assert.equal(again.alreadyHandedOff, true);

    const img = await svc.create(tenantId, undefined, { clinicId, patientId, kind: ClinicalOrderKind.IMAGING, items: [{ nameEn: "Chest X-ray" }] });
    await assert.rejects(() => svc.handoffToLab(tenantId, img.id, undefined), (e: unknown) => e instanceof ConflictException);

    // Revoking consent: no new hand-offs for other orders.
    await prisma.patientRecordShareConsent.updateMany({ where: { patientId, scope: "LAB_RESULTS" }, data: { granted: false, revokedAt: new Date() } });
    const second = await svc.create(tenantId, undefined, { clinicId, patientId, kind: ClinicalOrderKind.LAB, items: [{ nameEn: "HbA1c" }] });
    await assert.rejects(() => svc.handoffToLab(tenantId, second.id, undefined), (e: unknown) => e instanceof ConflictException);
  });

  it("CL-06: results PDF is stored per tenant, only real PDFs are accepted, and it streams back", async () => {
    const blobs = new Map<string, Buffer>();
    const uploads = {
      put: async (_k: string, key: string, body: Buffer) => void blobs.set(key, body),
      assertExists: async (_k: string, key: string) => {
        if (!blobs.has(key)) throw new Error("missing");
      },
      getReadStream: async (_k: string, key: string) => Readable.from(blobs.get(key)!),
      deleteObject: async (_k: string, key: string) => void blobs.delete(key),
    };
    const p = prisma as unknown as PrismaService;
    const withStorage = new ClinicalOrdersService(p, {} as never, new RecordShareService(p), new OutboxEventService(p), uploads as never);
    const order = await withStorage.create(tenantId, undefined, { clinicId, patientId, kind: ClinicalOrderKind.LAB, items: [{ nameEn: "Lipids" }] });
    await assert.rejects(() => withStorage.attachResultsPdf(tenantId, order.id, { buffer: Buffer.from("not a pdf"), size: 9, mimetype: "application/pdf" }));
    const pdf = Buffer.from("%PDF-1.4\n%results");
    await withStorage.attachResultsPdf(tenantId, order.id, { buffer: pdf, size: pdf.length, mimetype: "application/pdf" });
    const row = await prisma.clinicalOrder.findUniqueOrThrow({ where: { id: order.id } });
    assert.ok(row.resultsPdfRelativePath?.startsWith(`${tenantId}/clinical-orders/${order.id}/`));
    const { stream } = await withStorage.openResultsPdf(tenantId, order.id);
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(Buffer.from(c));
    assert.equal(Buffer.concat(chunks).toString(), pdf.toString());
    await assert.rejects(() => withStorage.openResultsPdf("other-tenant", order.id));
  });
});
