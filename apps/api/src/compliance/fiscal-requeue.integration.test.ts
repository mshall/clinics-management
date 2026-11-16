import assert from "node:assert/strict";
import { config } from "dotenv";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  FiscalDeviceKind,
  FiscalDeviceStatus,
  FiscalSubmissionStatus,
  Prisma,
  PrismaClient,
  RevenueStatus,
  VisitCollectionMode,
} from "@prisma/client";
import { queueFiscalDocument } from "./fiscal-queue";
import { reducePostedRevenueNetWithFiscal } from "./void-revenue-fiscal-returns";

config({ path: resolve(process.cwd(), ".env") });

const isCi = process.env.CI === "true";

function failInCi(message: string): never {
  assert.fail(`CI requires a real database: ${message}`);
}

const ACTIVE: FiscalSubmissionStatus[] = [
  FiscalSubmissionStatus.PENDING,
  FiscalSubmissionStatus.SUBMITTING,
  FiscalSubmissionStatus.SUBMITTED,
  FiscalSubmissionStatus.ACCEPTED,
];

async function ensureEtaFlag(prisma: PrismaClient, tenantId: string): Promise<void> {
  await prisma.featureFlag.upsert({
    where: { key: "eta_receipts" },
    create: { key: "eta_receipts", enabled: true, description: "ETA receipts" },
    update: { enabled: true },
  });
  await prisma.tenantFeatureFlag.upsert({
    where: { tenantId_key: { tenantId, key: "eta_receipts" } },
    create: { tenantId, key: "eta_receipts", enabled: true },
    update: { enabled: true },
  });
}

test("pending sale 400→300 re-queues; submitted 300→200 queues two distinct returns", async (t) => {
  if (!process.env.DATABASE_URL?.trim()) {
    if (isCi) failInCi("DATABASE_URL is not set");
    t.skip("DATABASE_URL not set");
    return;
  }

  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
  } catch (err) {
    if (isCi) failInCi(`PostgreSQL unavailable (${err instanceof Error ? err.message : String(err)})`);
    t.skip("PostgreSQL unavailable");
    await prisma.$disconnect();
    return;
  }

  const clinicRow = await prisma.clinic.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, tenantId: true, taxRegistrationNumber: true, invoiceVatPercent: true },
  });
  if (!clinicRow) {
    if (isCi) failInCi("database has no clinic — run migrations and seed");
    t.skip("No clinic in database — run db:setup");
    await prisma.$disconnect();
    return;
  }

  const tag = `fiscal-int-${Date.now()}`;
  let device = await prisma.fiscalDevice.findFirst({
    where: {
      tenantId: clinicRow.tenantId,
      clinicId: clinicRow.id,
      providerKey: "eta-egypt",
      status: FiscalDeviceStatus.ACTIVE,
      credentialId: { not: null },
    },
    include: { credential: true },
  });

  let testDeviceId: string | null = null;
  let testCredentialId: string | null = null;
  if (!device) {
    const cred = await prisma.providerCredential.create({
      data: {
        tenantId: clinicRow.tenantId,
        clinicId: clinicRow.id,
        providerKey: "eta-egypt",
        secretRef: `local:test/${tag}`,
        label: tag,
      },
    });
    testCredentialId = cred.id;
    device = await prisma.fiscalDevice.create({
      data: {
        tenantId: clinicRow.tenantId,
        clinicId: clinicRow.id,
        providerKey: "eta-egypt",
        kind: FiscalDeviceKind.VIRTUAL,
        serialNumber: `KIORLY-TEST-${tag}`,
        status: FiscalDeviceStatus.ACTIVE,
        isDefault: true,
        credentialId: cred.id,
      },
      include: { credential: true },
    });
    testDeviceId = device.id;
  }

  const { tenantId, clinicId } = device;
  const clinic = clinicRow;
  const patient = await prisma.patient.findFirst({
    where: { tenantId, homeBranchId: clinicId },
    orderBy: { createdAt: "asc" },
  });
  if (!patient) {
    if (isCi) failInCi("database has no patient for clinic — run seed");
    t.skip("No patient for clinic");
    await prisma.$disconnect();
    return;
  }

  await ensureEtaFlag(prisma, tenantId);

  let revenueId = "";

  try {
    await prisma.$transaction(async (tx) => {
      const revenue = await tx.revenueEntry.create({
        data: {
          tenantId,
          clinicId,
          category: "VISIT_FEE",
          description: tag,
          grossAmount: new Prisma.Decimal("400"),
          taxAmount: new Prisma.Decimal("0"),
          netAmount: new Prisma.Decimal("400"),
          currency: "EGP",
          postedAt: new Date(),
          status: RevenueStatus.POSTED,
          collectionMode: VisitCollectionMode.CASH_ON_VISIT,
        },
      });
      revenueId = revenue.id;

      await queueFiscalDocument(tx, {
        tenantId,
        clinicId,
        patientId: patient.id,
        revenueEntryId: revenue.id,
        totalAmount: 400,
        currency: "EGP",
        description: `${tag} sale 400`,
        clinicTaxRin: clinic.taxRegistrationNumber,
        vatPercent: Number(clinic.invoiceVatPercent ?? 0),
        collectionMode: VisitCollectionMode.CASH_ON_VISIT,
        buyerName: "Integration Patient",
      });

      const afterFirstSale = await tx.revenueEntry.findUniqueOrThrow({ where: { id: revenue.id } });
      assert.equal(afterFirstSale.fiscalSaleSeq, 1);

      const pendingSub = await tx.fiscalSubmission.findFirst({
        where: {
          fiscalDocument: { revenueEntryId: revenue.id },
          status: FiscalSubmissionStatus.PENDING,
        },
      });
      assert.ok(pendingSub?.idempotencyKey?.includes(":1"), "first sale idempotency ends with :1");

      await reducePostedRevenueNetWithFiscal(
        tx,
        tenantId,
        revenue.id,
        300,
        {
          tenantId,
          clinicId,
          patientId: patient.id,
          description: `${tag} sale 300`,
          currency: "EGP",
          collectionMode: VisitCollectionMode.CASH_ON_VISIT,
          transferChannel: null,
          transferReference: null,
        },
        "Fee adjustment",
      );

      const cancelled = await tx.fiscalSubmission.findFirst({
        where: { id: pendingSub!.id, status: FiscalSubmissionStatus.CANCELLED },
      });
      assert.ok(cancelled, "original pending sale cancelled");

      const activeSales = await tx.fiscalSubmission.findMany({
        where: {
          fiscalDocument: { revenueEntryId: revenue.id },
          status: { in: ACTIVE },
        },
        include: { fiscalDocument: true },
      });
      assert.equal(activeSales.length, 1, "exactly one active sale after 400→300");
      assert.equal(Number(activeSales[0]!.fiscalDocument.totalAmount), 300);
      assert.ok(activeSales[0]!.idempotencyKey?.includes(":2"), "re-queued sale uses seq 2");

      await tx.fiscalSubmission.update({
        where: { id: activeSales[0]!.id },
        data: { status: FiscalSubmissionStatus.ACCEPTED, submittedAt: new Date() },
      });

      await reducePostedRevenueNetWithFiscal(
        tx,
        tenantId,
        revenue.id,
        200,
        {
          tenantId,
          clinicId,
          patientId: patient.id,
          description: `${tag} sale 200`,
          currency: "EGP",
          collectionMode: VisitCollectionMode.CASH_ON_VISIT,
          transferChannel: null,
          transferReference: null,
        },
        "Fee adjustment",
      );

      const afterReduce = await tx.revenueEntry.findUniqueOrThrow({ where: { id: revenue.id } });
      assert.equal(afterReduce.fiscalReturnSeq, 1);

      const returns = await tx.fiscalSubmission.findMany({
        where: {
          idempotencyKey: { contains: `return:${revenue.id}:` },
          status: { in: ACTIVE },
        },
        orderBy: { createdAt: "asc" },
        include: { fiscalDocument: true },
      });
      assert.equal(returns.length, 1);
      assert.equal(Number(returns[0]!.fiscalDocument.totalAmount), 100);
      assert.ok(returns[0]!.idempotencyKey?.endsWith(":1"), "first return uses return seq 1");

      await reducePostedRevenueNetWithFiscal(
        tx,
        tenantId,
        revenue.id,
        100,
        {
          tenantId,
          clinicId,
          patientId: patient.id,
          description: `${tag} sale 100`,
          currency: "EGP",
          collectionMode: VisitCollectionMode.CASH_ON_VISIT,
          transferChannel: null,
          transferReference: null,
        },
        "Fee adjustment",
      );

      const returnsAfter = await tx.fiscalSubmission.findMany({
        where: {
          idempotencyKey: { contains: `return:${revenue.id}:` },
          status: { in: ACTIVE },
        },
        orderBy: { createdAt: "asc" },
      });
      assert.equal(returnsAfter.length, 2, "second partial return queued");
      const keys = new Set(returnsAfter.map((r) => r.idempotencyKey));
      assert.equal(keys.size, 2, "distinct return idempotency keys");
    });
  } finally {
    if (revenueId) {
      const subs = await prisma.fiscalSubmission.findMany({
        where: {
          OR: [
            { idempotencyKey: { contains: revenueId } },
            { fiscalDocument: { revenueEntryId: revenueId } },
          ],
        },
        select: { fiscalDocumentId: true },
      });
      const docIds = [...new Set(subs.map((s) => s.fiscalDocumentId))];
      if (docIds.length) {
        await prisma.fiscalSubmission.deleteMany({ where: { fiscalDocumentId: { in: docIds } } });
        await prisma.fiscalDocument.deleteMany({ where: { id: { in: docIds } } });
      }
      await prisma.revenueEntry.delete({ where: { id: revenueId } }).catch(() => undefined);
    }
    if (testDeviceId) {
      await prisma.fiscalDevice.delete({ where: { id: testDeviceId } }).catch(() => undefined);
    }
    if (testCredentialId) {
      await prisma.providerCredential.delete({ where: { id: testCredentialId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
});