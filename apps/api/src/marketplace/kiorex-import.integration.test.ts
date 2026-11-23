import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { createPrismaClient } from "../prisma/create-prisma-client";
import type { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { LocalUploadBlobStorage } from "../storage/local-upload-blob.storage";
import { KiorexImportService } from "./kiorex-import.service";
import type { PlatformIntegrationPrincipal } from "./platform-integration-client.service";

const prisma = createPrismaClient();
const root = mkdtempSync(path.join(tmpdir(), "kx-import-"));
const svc = new KiorexImportService(prisma as unknown as PrismaService, new AuditService(prisma as unknown as PrismaService), new LocalUploadBlobStorage(root));
const sfx = `${Date.now()}`;
const client = { id: `cli_${sfx}`, scopes: ["MARKETPLACE", "ONBOARDING_IMPORT"] } as unknown as PlatformIntegrationPrincipal;
const noScope = { id: `cli_${sfx}`, scopes: ["MARKETPLACE"] } as unknown as PlatformIntegrationPrincipal;
const batchId = `b${sfx}`;
const orgId = `org_${sfx}`;
const key = (entity: string, s: string) => `imp:${batchId}:${entity}:${s}`;
const pdf = Buffer.from("%PDF-1.4 test").toString("base64");

describe("Kiorex org import receiver", () => {
  let tenantId = "";
  const ids: Record<string, string> = {};
  before(() => prisma.$connect());
  after(async () => {
    if (tenantId) await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.kiorexImportOrg.deleteMany({ where: { clientId: client.id } });
    await prisma.$disconnect();
    rmSync(root, { recursive: true, force: true });
  });

  it("requires the ONBOARDING_IMPORT scope", async () => {
    await assert.rejects(svc.importRecords(noScope, batchId, { orgId, orgName: "X", entity: "patients", items: [] }), /ONBOARDING_IMPORT|scope/);
  });

  it("provisions the org on first chunk, creates patients, de-duplicates, and replays idempotently", async () => {
    const items = [
      { idempotencyKey: key("patients", "1"), sourceKey: "1", data: { fullName: "Mona Ibrahim", firstName: "Mona", lastName: "Ibrahim", phone: "01012345678", gender: "FEMALE", nationalId: "29001010100011" } },
      { idempotencyKey: key("patients", "2"), sourceKey: "2", data: { fullName: "محمد علي", phone: "01112345678", gender: "MALE" } },
      { idempotencyKey: key("patients", "3"), sourceKey: "3", data: { fullName: "Mona Ibrahim", firstName: "Mona", lastName: "Ibrahim", phone: "01012345678", nationalId: "29001010100011" } }, // same person again
    ];
    const r1 = await svc.importRecords(client, batchId, { orgId, orgName: "Nile Clinic", orgNameAr: "عيادة النيل", entity: "patients", items });
    assert.equal(r1.results.length, 3);
    assert.equal(r1.created, 2); // the third is a duplicate of the first
    assert.equal(r1.results[2].targetId, r1.results[0].targetId);
    ids.p1 = r1.results[0].targetId; ids.p2 = r1.results[1].targetId;
    const org = await prisma.kiorexImportOrg.findFirstOrThrow({ where: { clientId: client.id, kiorexOrgId: orgId } });
    tenantId = org.tenantId;
    const t = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    assert.equal(t.name, "Nile Clinic");
    const ps = await prisma.patient.findMany({ where: { tenantId }, orderBy: { mrn: "asc" } });
    assert.equal(ps.length, 2);
    assert.deepEqual(ps.map((p) => p.mrn), ["MRN-10001", "MRN-10002"]);
    assert.equal(ps[1].firstNameAr, "محمد");
    const r2 = await svc.importRecords(client, batchId, { orgId, entity: "patients", items });
    assert.equal(r2.replayed, 3);
    assert.equal(r2.created, 0);
    assert.deepEqual(r2.results, r1.results);
    assert.equal(await prisma.patient.count({ where: { tenantId } }), 2);
  });

  it("imports documents through the storage adapter, plus appointments, visits and billing", async () => {
    const d = await svc.importRecords(client, batchId, { orgId, entity: "documents", items: [{ idempotencyKey: key("documents", "d1"), sourceKey: "d1", data: { patientTargetId: ids.p1, fileName: "scan.pdf", via: "id" }, file: { name: "scan.pdf", contentBase64: pdf } }] });
    const doc = await prisma.patientDocument.findFirstOrThrow({ where: { id: d.results[0].targetId } });
    assert.equal(doc.tenantId, tenantId);
    assert.ok(existsSync(path.join(root, "patients", doc.relativePath)));
    const a = await svc.importRecords(client, batchId, { orgId, entity: "appointments", items: [{ idempotencyKey: key("appointments", "a1"), sourceKey: "a1", data: { patientTargetId: ids.p1, startsAt: "2024-03-01T10:00:00Z", doctor: "Dr A" } }] });
    const v = await svc.importRecords(client, batchId, { orgId, entity: "visits", items: [{ idempotencyKey: key("visits", "v1"), sourceKey: "v1", data: { patientTargetId: ids.p1, visitedAt: "2024-03-01T10:00:00Z", diagnosis: "x" } }] });
    const b = await svc.importRecords(client, batchId, { orgId, entity: "billing", items: [{ idempotencyKey: key("billing", "i1"), sourceKey: "i1", data: { patientTargetId: ids.p1, issuedAt: "2024-03-01T10:00:00Z", amountMinor: 50000, paidMinor: 20000, currency: "EGP" } }] });
    assert.equal(a.created + v.created + b.created, 3);
    const inv = await prisma.invoice.findFirstOrThrow({ where: { id: b.results[0].targetId }, include: { lines: true } });
    assert.equal(Number(inv.lines[0].unitPrice), 500);
    ids.doc = doc.relativePath;
  });

  it("rejects cross-org patient references and unknown entities, atomically", async () => {
    await assert.rejects(svc.importRecords(client, batchId, { orgId, entity: "appointments", items: [{ idempotencyKey: key("appointments", "a2"), sourceKey: "a2", data: { patientTargetId: "nope", startsAt: "2024-03-01T10:00:00Z" } }] }), /PATIENT_NOT_IN_ORG|does not belong/);
    await assert.rejects(svc.importRecords(client, batchId, { orgId, entity: "nonsense", items: [] }), /entity/);
    // a second client cannot see or touch this org's rows through the same org ref
    const other = { id: `cli_other_${sfx}`, scopes: ["ONBOARDING_IMPORT"] } as unknown as PlatformIntegrationPrincipal;
    await assert.rejects(svc.importRecords(other, batchId, { orgId, entity: "appointments", items: [{ idempotencyKey: key("appointments", "a3"), sourceKey: "a3", data: { patientTargetId: ids.p1, startsAt: "2024-03-01T10:00:00Z" } }] }), /ORG_NAME_REQUIRED|orgName/);
  });

  it("audits chunks with counts only and never PHI", async () => {
    const logs = await prisma.auditLog.findMany({ where: { tenantId, action: { startsWith: "KIOREX_IMPORT" } } });
    assert.ok(logs.length >= 4);
    const text = JSON.stringify(logs.map((l) => l.metadata));
    for (const phi of ["Mona", "01012345678", "29001010100011", "scan.pdf", "محمد"]) assert.ok(!text.includes(phi), `audit leaked ${phi}`);
  });

  it("rolls the batch back: rows and blobs removed, closed to new chunks, replay is a no-op", async () => {
    const r = await svc.rollback(client, batchId, { orgId });
    assert.equal(r.removed, 6); // 2 patients + doc + appt + visit + invoice
    assert.equal(await prisma.patient.count({ where: { tenantId } }), 0);
    assert.ok(!existsSync(path.join(root, "patients", ids.doc)));
    assert.equal((await svc.rollback(client, batchId, { orgId })).removed, 0);
    await assert.rejects(svc.importRecords(client, batchId, { orgId, entity: "patients", items: [{ idempotencyKey: key("patients", "9"), sourceKey: "9", data: { fullName: "Late Patient", phone: "01099999999" } }] }), /rolled back|BATCH_NOT_OPEN/);
  });
});
