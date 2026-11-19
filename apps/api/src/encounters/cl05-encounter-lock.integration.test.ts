import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { EncounterDocumentKind, EncounterStatus, PrismaClient, UserRole } from "@prisma/client";
import { AdminDataExplorerService } from "../admin/data-explorer/admin-data-explorer.service";
import { AuditService } from "../audit/audit.service";
import type { JwtUser } from "../auth/jwt-user";
import { DrugCatalogService } from "../clinical/drug-catalog.service";
import { RxSafetyCheckService } from "../clinical/rx-safety-check.service";
import { ENCOUNTER_LOCKED_CODE } from "../common/encounter-lock";
import { PatientsService } from "../patients/patients.service";
import { PrismaService } from "../prisma/prisma.service";
import { EncountersService } from "./encounters.service";

const prisma = new PrismaClient();
const prismaSvc = prisma as unknown as PrismaService;
const uploads = { put: async () => undefined, deleteObject: async () => undefined } as never;

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
  );
}

function isLocked(e: unknown): boolean {
  return e instanceof ConflictException && JSON.stringify(e.getResponse()).includes(ENCOUNTER_LOCKED_CODE);
}

const file = { buffer: Buffer.from("%PDF-1.4"), originalname: "lab.pdf", mimetype: "application/pdf", size: 8 };

describe("CL-05 sign-off, amendments & auto-lock", () => {
  const stamp = Date.now();
  let tenantId: string;
  let clinicId: string;
  let doctor: JwtUser;
  let admin: JwtUser;
  let otherDoctor: JwtUser | null = null;
  let patientId: string;
  let lockedId: string;
  let diagId: string;
  let medId: string;
  let docId: string;
  let lockHours: number;

  before(async () => {
    await prisma.$connect();
    const clinic = await prisma.clinic.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
    tenantId = clinic.tenantId;
    clinicId = clinic.id;
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    lockHours = tenant.encounterAutoLockHours ?? 72;
    const doc = await prisma.user.findFirstOrThrow({ where: { tenantId, deletedAt: null, role: UserRole.PHYSICIAN } });
    doctor = { userId: doc.id, tenantId, role: doc.role, email: doc.email } as JwtUser;
    const adm = await prisma.user.findFirstOrThrow({ where: { tenantId, deletedAt: null, role: UserRole.GROUP_ADMIN } });
    admin = { userId: adm.id, tenantId, role: adm.role, email: adm.email } as JwtUser;
    const other = await prisma.user.findFirst({
      where: { tenantId, deletedAt: null, role: UserRole.PHYSICIAN, id: { not: doc.id } },
    });
    if (other) otherDoctor = { userId: other.id, tenantId, role: other.role, email: other.email } as JwtUser;

    const patient = await prisma.patient.create({
      data: { tenantId, mrn: `CL05-${stamp}`, firstNameEn: "Lock", lastNameEn: "Test", gender: "UNKNOWN", phone: "+201055500005" },
    });
    patientId = patient.id;
    const signedAt = new Date(Date.now() - (lockHours + 1) * 3600_000);
    const enc = await prisma.encounter.create({
      data: {
        tenantId,
        clinicId,
        patientId,
        clinicianId: doc.id,
        visitType: "Office visit",
        status: EncounterStatus.FINALIZED,
        finalizedAt: signedAt,
        signedAt,
        signedByUserId: doc.id,
        subjective: "ORIGINAL",
        diagnoses: { create: { tenantId, icd10Code: "J02.9", descriptionEn: "Pharyngitis", isPrimary: true } },
        medications: { create: { tenantId, drugName: "Panadol 500mg" } },
        documents: {
          create: {
            tenantId,
            kind: EncounterDocumentKind.LAB,
            originalFileName: "cbc.pdf",
            mimeType: "image/png",
            sizeBytes: 10,
            relativePath: `${tenantId}/cl05-${stamp}/cbc.png`,
          },
        },
      },
      include: { diagnoses: true, medications: true, documents: true },
    });
    lockedId = enc.id;
    diagId = enc.diagnoses[0]!.id;
    medId = enc.medications[0]!.id;
    docId = enc.documents[0]!.id;
  });

  after(async () => {
    await prisma.encounter.deleteMany({ where: { patientId } }).catch(() => undefined);
    await prisma.patient.delete({ where: { id: patientId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("a locked encounter cannot be edited via any endpoint (lock applies even if nobody opened the note)", async () => {
    const before = await prisma.encounter.findUniqueOrThrow({ where: { id: lockedId } });
    assert.equal(before.noteLockedAt, null, "precondition: lock is due but not yet persisted");

    const svc = encountersService();
    const attempts: Array<[string, () => Promise<unknown>]> = [
      ["PATCH encounter", () => svc.update(tenantId, lockedId, { subjective: "TAMPERED" }, doctor)],
      ["POST medication", () => svc.addMedication(tenantId, lockedId, { drugName: "Brufen" }, doctor)],
      ["DELETE medication", () => svc.removeMedication(tenantId, lockedId, medId, doctor)],
      ["POST diagnosis", () => svc.addDiagnosis(tenantId, lockedId, { icd10Code: "R50.9", descriptionEn: "Fever" }, doctor)],
      ["DELETE diagnosis", () => svc.removeDiagnosis(tenantId, lockedId, diagId, doctor)],
      ["POST lab document", () => svc.uploadDocument(tenantId, lockedId, EncounterDocumentKind.LAB, file, doctor)],
      ["DELETE document", () => svc.removeDocument(tenantId, lockedId, docId, doctor)],
      ["DELETE encounter", () => svc.delete(tenantId, lockedId, admin)],
      ["POST finalize", () => svc.finalize(tenantId, doctor, lockedId)],
    ];
    const patients = new PatientsService(prismaSvc, uploads, { assertMutateTab: async () => undefined } as never);
    attempts.push(
      ["DELETE chart encounter document", () => patients.removeEncounterDocumentForPatient(tenantId, patientId, lockedId, docId, admin)],
      [
        "PUT chart encounter document crop",
        () =>
          patients.cropEncounterDocumentForPatient(tenantId, patientId, lockedId, docId, admin, {
            buffer: Buffer.from("png"),
            originalname: "crop.png",
            mimetype: "image/png",
            size: 3,
          }),
      ],
    );
    const explorer = new AdminDataExplorerService(prismaSvc, uploads);
    attempts.push(
      ["explorer PATCH encounter", () => explorer.patch(admin, "encounters", lockedId, { status: "DRAFT" })],
      ["explorer PATCH diagnosis", () => explorer.patch(admin, "diagnoses", diagId, { descriptionEn: "X" })],
      ["explorer PATCH medication", () => explorer.patch(admin, "encounter_medications", medId, { drugName: "X" })],
      ["explorer POST diagnosis", () => explorer.create(admin, "diagnoses", { encounterId: lockedId, icd10Code: "R50.9", descriptionEn: "Fever" })],
      ["explorer POST medication", () => explorer.create(admin, "encounter_medications", { encounterId: lockedId, drugName: "X" })],
      ["explorer DELETE diagnosis", () => explorer.remove(admin, "diagnoses", diagId)],
      ["explorer DELETE medication", () => explorer.remove(admin, "encounter_medications", medId)],
    );

    for (const [label, run] of attempts) {
      await assert.rejects(run, (e: unknown) => {
        if (label === "POST finalize") return e instanceof Error && /already finalized/i.test(e.message);
        if (!isLocked(e) && !(e instanceof Error && /finalized and cannot be edited/i.test(e.message))) {
          assert.fail(`${label}: expected lock rejection, got ${String((e as Error)?.message ?? e)}`);
        }
        return true;
      }, label);
    }

    const after = await prisma.encounter.findUniqueOrThrow({
      where: { id: lockedId },
      include: { diagnoses: true, medications: true, documents: true },
    });
    assert.equal(after.status, EncounterStatus.FINALIZED);
    assert.equal(after.subjective, "ORIGINAL");
    assert.ok(after.noteLockedAt, "lock persisted by the first write attempt");
    assert.equal(after.noteLockedAt!.getTime(), before.finalizedAt!.getTime() + lockHours * 3600_000);
    assert.deepEqual(after.diagnoses.map((d) => d.id), [diagId]);
    assert.deepEqual(after.medications.map((m) => m.id), [medId]);
    assert.deepEqual(after.documents.map((d) => d.id), [docId]);
  });

  it("only the signing clinician (or a supervisor) can amend; another doctor cannot", async (t) => {
    if (!otherDoctor) return t.skip("needs a second physician in the seed tenant");
    await assert.rejects(
      () => encountersService().amend(tenantId, otherDoctor!, lockedId, "Wrong patient side"),
      (e: unknown) => e instanceof ForbiddenException,
    );
  });

  it("amend keeps an append-only trail with reason, author and re-signature, and is audited", async () => {
    const svc = encountersService();
    const amended = await svc.amend(tenantId, doctor, lockedId, "Corrected laterality of exam finding");
    assert.equal(amended.status, EncounterStatus.AMENDED);
    assert.equal(amended.amendments.length, 1);
    assert.equal(amended.amendments[0]!.wasLocked, true);
    assert.equal(amended.amendments[0]!.resignedAt, null);
    const audit = await prisma.auditLog.findFirst({ where: { tenantId, action: "ENCOUNTER_AMENDED", resourceId: lockedId } });
    assert.ok(audit);

    const edited = await svc.update(tenantId, lockedId, { subjective: "ORIGINAL + addendum" }, doctor);
    assert.equal(edited.subjective, "ORIGINAL + addendum");
    const resigned = await svc.finalize(tenantId, doctor, lockedId);
    assert.equal(resigned.status, EncounterStatus.FINALIZED);
    assert.ok(resigned.amendments[0]!.resignedAt);
    assert.equal(resigned.noteLockedAt, null);
    assert.ok(resigned.noteLocksAt, "re-signed note gets a fresh lock window");

    await prisma.encounter.update({ where: { id: lockedId }, data: { noteLockedAt: new Date() } });
    const second = await svc.amend(tenantId, doctor, lockedId, "Added missed allergy note");
    assert.equal(second.amendments.length, 2, "earlier amendment is not overwritten");
    assert.equal(second.amendments[0]!.reason, "Corrected laterality of exam finding");
    assert.equal(second.amendments[1]!.reason, "Added missed allergy note");
  });
});
