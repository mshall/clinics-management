import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { after, before, describe, it } from "node:test";
import { BookingSource, ImportEntity, ImportJobStatus, PatientAcquisitionChannel, PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { AuditService } from "../../audit/audit.service";
import { isCommissionChargeableBooking } from "../../appointments/booking-attribution";
import { NewPatientService } from "../../patients/new-patient.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { UploadBlobStorage } from "../../storage/upload-blob.storage";
import { ImportsService } from "./imports.service";
import { createPrismaClient } from "../../prisma/create-prisma-client";

const prisma = createPrismaClient();
const ps = prisma as unknown as PrismaService;
const blobs = new Map<string, Buffer>();
const storage: UploadBlobStorage = {
  put: async (kind, key, body) => void blobs.set(`${kind}/${key}`, body),
  assertExists: async () => undefined,
  getReadStream: async (kind, key) => Readable.from(blobs.get(`${kind}/${key}`) ?? Buffer.alloc(0)),
  deleteObject: async (kind, key) => void blobs.delete(`${kind}/${key}`),
};
const imports = new ImportsService(ps, new AuditService(ps), storage);
const newPatients = new NewPatientService(ps);

function csv(rows: string[][]): Buffer {
  return Buffer.from(rows.map((r) => r.join(",")).join("\n"), "utf8");
}

async function readStream(s: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of s) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks).toString("utf8");
}

describe("ON-05 data import", () => {
  let tenantId: string;
  let userId: string;
  const suffix = `${Date.now()}`;

  before(async () => {
    await prisma.$connect();
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const tenant = await prisma.tenant.create({
      data: {
        name: `Import ${suffix}`,
        deploymentCell: "frankfurt",
        marketId: market.id,
        clinics: {
          create: {
            nameEn: "Main",
            nameAr: "الرئيسي",
            country: "EG",
            city: "Cairo",
            addressEn: "Street",
            addressAr: "شارع",
            locationUrl: "https://maps.example/i",
            phone: "201000000002",
            email: `on05.${suffix}@example.com`,
            licenseNumber: "L-1",
            defaultCurrency: "EGP",
          },
        },
      },
    });
    tenantId = tenant.id;
    const user = await prisma.user.create({
      data: {
        tenantId,
        email: `dr.on05.${suffix}@example.com`,
        passwordHash: bcrypt.hashSync("demo", 4),
        displayName: "Dr Import",
        role: "PHYSICIAN",
        isTenantOwner: true,
      },
    });
    userId = user.id;
  });

  after(async () => {
    if (tenantId) await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("10,000-row patient file imports in under 2 minutes without blocking the API", async () => {
    const rows: string[][] = [["الاسم الأول (عربي)", "First name (English)", "Mobile", "Date of birth (dd/mm/yyyy)", "Gender (M/F)"]];
    for (let i = 0; i < 10_000; i++) {
      rows.push(["منى", "Mona", `0100${String(1_000_000 + i).slice(-7)}`, "01/02/1985", i % 2 ? "M" : "F"]);
    }
    const started = Date.now();
    const job = await imports.upload({ tenantId, userId }, ImportEntity.PATIENTS, {
      originalname: "patients.csv",
      buffer: csv(rows),
      mimetype: "text/csv",
    });
    assert.equal(job.status, ImportJobStatus.READY);
    assert.equal(job.okRows, 10_000);
    assert.equal(job.errorRows, 0);

    const commitStarted = Date.now();
    const committing = await imports.commit({ tenantId, userId }, job.id);
    assert.equal(committing.status, ImportJobStatus.COMMITTING);
    assert.ok(Date.now() - commitStarted < 2_000, "commit request returns before the write finishes");

    const probeStarted = Date.now();
    await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    assert.ok(Date.now() - probeStarted < 2_000, "other API queries are served while the import runs");

    await imports.running.get(job.id);
    const done = await imports.get(tenantId, job.id);
    assert.equal(done.status, ImportJobStatus.DONE, done.failureMessage ?? "");
    assert.equal(done.createdRows, 10_000);
    assert.ok(Date.now() - started < 120_000, `took ${Date.now() - started}ms`);
    assert.ok(done.canUndo);
  });

  it("imported patients get acquisition IMPORT and never count as new Kiorex patients", async () => {
    const count = await prisma.patient.count({ where: { tenantId, acquisitionChannel: PatientAcquisitionChannel.IMPORT } });
    assert.equal(count, 10_000);
    const p = await prisma.patient.findFirstOrThrow({ where: { tenantId }, orderBy: { mrn: "asc" } });
    assert.equal(await newPatients.isNewToTenant(tenantId, p.phone, null), false);
    const stamp = await newPatients.stampNewPatientAtBooking(tenantId, p.id, new Date());
    assert.equal(stamp.isNewPatientAtBooking, false);
    assert.equal(isCommissionChargeableBooking(BookingSource.KIOREX_MARKETPLACE, stamp.isNewPatientAtBooking), false);
    assert.equal(await newPatients.hadPriorAttendedVisit(tenantId, p.id, new Date()), true);
  });

  it("dedupes against existing patients (SKIP) and exposes row errors + downloadable report", async () => {
    const existing = await prisma.patient.findFirstOrThrow({ where: { tenantId }, orderBy: { mrn: "asc" } });
    const job = await imports.upload({ tenantId, userId }, ImportEntity.PATIENTS, {
      originalname: "p2.csv",
      buffer: csv([
        ["firstNameEn", "phone", "dob"],
        ["Again", existing.phone, ""],
        ["Bad", "123", "32/01/2000"],
      ]),
      mimetype: "text/csv",
    });
    assert.equal(job.duplicateRows, 1);
    assert.equal(job.errorRows, 1);
    assert.ok(job.hasErrorReport);
    const report = await readStream((await imports.errorReport(tenantId, job.id)).stream);
    assert.match(report, /PHONE_INVALID/);
    assert.match(report, /DATE_INVALID/);
    await imports.commit({ tenantId, userId }, job.id);
    await imports.running.get(job.id);
    const done = await imports.get(tenantId, job.id);
    assert.equal(done.createdRows, 0);
  });

  it("appointments import with bookingSource IMPORT, and undo keeps touched patients", async () => {
    const pJob = await imports.upload({ tenantId, userId }, ImportEntity.PATIENTS, {
      originalname: "p3.csv",
      buffer: csv([
        ["firstNameEn", "phone"],
        ["Keep", "01201234567"],
        ["Drop", "01201234568"],
      ]),
      mimetype: "text/csv",
    });
    await imports.commit({ tenantId, userId }, pJob.id);
    await imports.running.get(pJob.id);

    const aJob = await imports.upload({ tenantId, userId }, ImportEntity.APPOINTMENTS, {
      originalname: "a.csv",
      buffer: csv([
        ["patientPhone", "clinicianEmail", "date", "time", "status"],
        ["01201234567", `dr.on05.${suffix}@example.com`, "05/01/2025", "17:30", "COMPLETED"],
      ]),
      mimetype: "text/csv",
    });
    assert.equal(aJob.okRows, 1, JSON.stringify(aJob.errors));
    await imports.commit({ tenantId, userId }, aJob.id);
    await imports.running.get(aJob.id);
    const appt = await prisma.appointment.findFirstOrThrow({ where: { tenantId } });
    assert.equal(appt.bookingSource, BookingSource.IMPORT);
    assert.equal(appt.isNewPatientAtBooking, false);

    const undone = await imports.undo({ tenantId, userId }, pJob.id);
    assert.equal(undone.status, ImportJobStatus.UNDONE);
    assert.deepEqual(undone.undo, { deleted: 1, kept: 1 });
    await assert.rejects(() => imports.undo({ tenantId, userId }, pJob.id), /UNDONE/);
  });

  it("undo is refused after the 24h window", async () => {
    const job = await imports.upload({ tenantId, userId }, ImportEntity.PRICE_LIST, {
      originalname: "prices.csv",
      buffer: csv([
        ["code", "nameEn", "nameAr", "price"],
        ["CONS", "Consultation", "كشف", "400"],
      ]),
      mimetype: "text/csv",
    });
    await imports.commit({ tenantId, userId }, job.id);
    await imports.running.get(job.id);
    const price = await prisma.servicePrice.findFirstOrThrow({ where: { tenantId } });
    assert.equal(price.amount.toString(), "400");
    await prisma.importJob.update({ where: { id: job.id }, data: { undoUntil: new Date(Date.now() - 1000) } });
    await assert.rejects(() => imports.undo({ tenantId, userId }, job.id), /24h/);
  });
});
