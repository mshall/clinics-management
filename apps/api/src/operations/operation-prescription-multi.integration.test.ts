import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { OperationDocumentKind, OperationStatus, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { createPrismaClient } from "../prisma/create-prisma-client";
import { PrismaService } from "../prisma/prisma.service";
import { OperationsService } from "./operations.service";

const prisma = createPrismaClient();
const prismaSvc = prisma as unknown as PrismaService;
const stored = new Map<string, Buffer>();
const uploads = {
  put: async (_ns: string, key: string, buf: Buffer) => {
    stored.set(key, buf);
  },
  deleteObject: async (_ns: string, key: string) => {
    stored.delete(key);
  },
  assertExists: async () => undefined,
  getReadStream: async () => undefined,
} as never;

function operationsService(): OperationsService {
  return new OperationsService(prismaSvc, uploads, {
    enqueueProcessDocument: async () => undefined,
  } as never);
}

function pdfFile(name: string) {
  return {
    buffer: Buffer.from(`%PDF-1.4 ${name}`),
    originalname: name,
    mimetype: "application/pdf",
    size: 12 + name.length,
  };
}

describe("Operation prescription multi-upload", () => {
  const stamp = Date.now();
  let tenantId: string;
  let clinicId: string;
  let doctor: JwtUser;
  let patientId: string;
  let operationId: string;

  before(async () => {
    await prisma.$connect();
    const clinic = await prisma.clinic.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
    tenantId = clinic.tenantId;
    clinicId = clinic.id;
    const doc = await prisma.user.findFirstOrThrow({
      where: { tenantId, deletedAt: null, role: UserRole.PHYSICIAN },
    });
    doctor = { userId: doc.id, tenantId, role: doc.role, email: doc.email } as JwtUser;
    const patient = await prisma.patient.create({
      data: {
        tenantId,
        mrn: `ORXM-${stamp}`,
        firstNameEn: "Op",
        lastNameEn: "RxMulti",
        gender: "UNKNOWN",
        phone: `+2010666${String(stamp).slice(-6)}`,
      },
    });
    patientId = patient.id;
    const op = await prisma.operation.create({
      data: {
        tenantId,
        clinicId,
        patientId,
        clinicianId: doc.id,
        operationDate: new Date(),
        totalCost: 100,
        downPayment: 0,
        status: OperationStatus.BOOKED,
        noMedications: false,
      },
    });
    operationId = op.id;
  });

  after(async () => {
    await prisma.operationDocument.deleteMany({ where: { operationId } });
    await prisma.operation.deleteMany({ where: { id: operationId } });
    await prisma.patient.deleteMany({ where: { id: patientId } });
    await prisma.$disconnect();
  });

  it("keeps prior prescriptions when uploading another; replaceDocumentId swaps only one", async () => {
    const svc = operationsService();
    const first = await svc.uploadDocument(
      tenantId,
      operationId,
      OperationDocumentKind.PRESCRIPTION,
      undefined,
      pdfFile("op-rx-a.pdf"),
      doctor,
    );
    const second = await svc.uploadDocument(
      tenantId,
      operationId,
      OperationDocumentKind.PRESCRIPTION,
      undefined,
      pdfFile("op-rx-b.pdf"),
      doctor,
    );
    let rows = await prisma.operationDocument.findMany({
      where: { operationId, kind: OperationDocumentKind.PRESCRIPTION },
      orderBy: { createdAt: "asc" },
    });
    assert.equal(rows.length, 2);
    assert.ok(rows.some((r) => r.id === first.id));
    assert.ok(rows.some((r) => r.id === second.id));

    const replaced = await svc.uploadDocument(
      tenantId,
      operationId,
      OperationDocumentKind.PRESCRIPTION,
      undefined,
      pdfFile("op-rx-a-v2.pdf"),
      doctor,
      { replaceDocumentId: first.id },
    );
    rows = await prisma.operationDocument.findMany({
      where: { operationId, kind: OperationDocumentKind.PRESCRIPTION },
      orderBy: { createdAt: "asc" },
    });
    assert.equal(rows.length, 2);
    assert.ok(!rows.some((r) => r.id === first.id));
    assert.ok(rows.some((r) => r.id === second.id));
    assert.ok(rows.some((r) => r.id === replaced.id && r.originalFileName === "op-rx-a-v2.pdf"));

    await svc.removeDocument(tenantId, operationId, second.id, doctor);
    rows = await prisma.operationDocument.findMany({
      where: { operationId, kind: OperationDocumentKind.PRESCRIPTION },
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.id, replaced.id);
  });
});
