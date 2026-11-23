import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { EncounterDocumentKind, UserRole } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { JwtUser } from "../auth/jwt-user";
import { DrugCatalogService } from "../clinical/drug-catalog.service";
import { RxSafetyCheckService } from "../clinical/rx-safety-check.service";
import { createPrismaClient } from "../prisma/create-prisma-client";
import { PrismaService } from "../prisma/prisma.service";
import { EncountersService } from "./encounters.service";

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

function encountersService(): EncountersService {
  const audit = new AuditService(prismaSvc);
  return new EncountersService(
    prismaSvc,
    {} as never,
    {} as never,
    {} as never,
    new DrugCatalogService(prismaSvc),
    new RxSafetyCheckService(prismaSvc),
    audit,
    uploads,
    {} as never,
    { shareAfterSignOff: async () => null } as never,
    { emitStatusChange: async () => undefined } as never,
    { enqueueProcessDocument: async () => undefined } as never,
  );
}

function pdfFile(name: string) {
  return {
    buffer: Buffer.from(`%PDF-1.4 ${name}`),
    originalname: name,
    mimetype: "application/pdf",
    size: 12 + name.length,
  };
}

describe("Encounter prescription multi-upload", () => {
  const stamp = Date.now();
  let tenantId: string;
  let clinicId: string;
  let doctor: JwtUser;
  let patientId: string;
  let encounterId: string;

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
        mrn: `RXM-${stamp}`,
        firstNameEn: "Rx",
        lastNameEn: "Multi",
        gender: "UNKNOWN",
        phone: `+2010555${String(stamp).slice(-6)}`,
      },
    });
    patientId = patient.id;
    const enc = await prisma.encounter.create({
      data: {
        tenantId,
        clinicId,
        patientId,
        clinicianId: doc.id,
        status: "DRAFT",
        visitType: "FOLLOW_UP",
        noMedications: false,
      },
    });
    encounterId = enc.id;
  });

  after(async () => {
    await prisma.encounterDocument.deleteMany({ where: { encounterId } });
    await prisma.encounter.deleteMany({ where: { id: encounterId } });
    await prisma.patient.deleteMany({ where: { id: patientId } });
    await prisma.$disconnect();
  });

  it("keeps prior prescriptions when uploading another; replaceDocumentId swaps only one", async () => {
    const svc = encountersService();
    const first = await svc.uploadDocument(
      tenantId,
      encounterId,
      EncounterDocumentKind.PRESCRIPTION,
      pdfFile("rx-a.pdf"),
      doctor,
    );
    const second = await svc.uploadDocument(
      tenantId,
      encounterId,
      EncounterDocumentKind.PRESCRIPTION,
      pdfFile("rx-b.pdf"),
      doctor,
    );
    let rows = await prisma.encounterDocument.findMany({
      where: { encounterId, kind: EncounterDocumentKind.PRESCRIPTION },
      orderBy: { createdAt: "asc" },
    });
    assert.equal(rows.length, 2);
    assert.ok(rows.some((r) => r.id === first.id));
    assert.ok(rows.some((r) => r.id === second.id));

    const replaced = await svc.uploadDocument(
      tenantId,
      encounterId,
      EncounterDocumentKind.PRESCRIPTION,
      pdfFile("rx-a-v2.pdf"),
      doctor,
      { replaceDocumentId: first.id },
    );
    rows = await prisma.encounterDocument.findMany({
      where: { encounterId, kind: EncounterDocumentKind.PRESCRIPTION },
      orderBy: { createdAt: "asc" },
    });
    assert.equal(rows.length, 2);
    assert.ok(!rows.some((r) => r.id === first.id));
    assert.ok(rows.some((r) => r.id === second.id));
    assert.ok(rows.some((r) => r.id === replaced.id && r.originalFileName === "rx-a-v2.pdf"));
  });
});
