import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Prisma, PrismaClient, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import type { PrismaService } from "../prisma/prisma.service";
import { ClaimsService } from "./claims.service";
import { PAYER_B2B_INVOICE_TOPIC } from "./claims";

const prisma = new PrismaClient();
const claims = new ClaimsService(prisma as unknown as PrismaService);

describe("MN-05 company contracts & TPA claims", () => {
  const stamp = Date.now();
  let tenantId: string;
  let clinicId: string;
  let patientId: string;
  let payerId: string;
  let finance: JwtUser;

  before(async () => {
    await prisma.$connect();
    const base = await prisma.clinic.findFirstOrThrow({ orderBy: { createdAt: "asc" }, include: { tenant: true } });
    const tenant = await prisma.tenant.create({
      data: { name: `MN05 ${stamp}`, deploymentCell: base.tenant.deploymentCell, marketId: base.tenant.marketId },
    });
    tenantId = tenant.id;
    const clinic = await prisma.clinic.create({
      data: {
        tenantId,
        nameEn: `MN05 Branch ${stamp}`,
        nameAr: "فرع",
        country: base.country,
        city: base.city,
        addressEn: "Street",
        addressAr: "شارع",
        locationUrl: "https://maps.example/mn05",
        timezone: base.timezone,
        phone: base.phone,
        email: `mn05.${stamp}@example.com`,
        licenseNumber: `MN05-${stamp}`,
        defaultCurrency: base.defaultCurrency,
      },
    });
    clinicId = clinic.id;
    const u = await prisma.user.create({
      data: {
        tenantId,
        email: `mn05.finance.${stamp}@example.com`,
        passwordHash: "x",
        displayName: "Finance",
        role: UserRole.FINANCE_OFFICER,
      },
    });
    finance = { userId: u.id, tenantId, email: u.email, role: UserRole.FINANCE_OFFICER, additionalRoles: [] } as unknown as JwtUser;
    const p = await prisma.patient.create({
      data: {
        tenantId,
        mrn: `MN05-${stamp}`,
        firstNameEn: "Sara",
        lastNameEn: "Corp",
        gender: "F",
        phone: "+201055505001",
      },
    });
    patientId = p.id;
    const payer = await prisma.payerCompany.create({
      data: { tenantId, nameEn: `Acme TPA ${stamp}`, nameAr: "أكمي", contractRef: `TPA-${stamp}` },
    });
    payerId = payer.id;

    for (let i = 1; i <= 10; i++) {
      const inv = await prisma.invoice.create({
        data: {
          tenantId,
          clinicId,
          patientId,
          payerCompanyId: payerId,
          invoiceNumber: `MN05-${stamp}-${String(i).padStart(3, "0")}`,
          issueDate: new Date("2026-11-10T10:00:00Z"),
          currency: "EGP",
          backgroundColor: "#fff",
          sectionsSnapshot: {},
          patientName: "Sara Corp",
          clinicNameEn: clinic.nameEn,
          clinicNameAr: clinic.nameAr,
          clinicAddressEn: "Street",
          clinicAddressAr: "شارع",
          clinicPhone: clinic.phone,
          clinicEmail: clinic.email,
          clinicLicenseNumber: clinic.licenseNumber,
          vatPercentSnapshot: new Prisma.Decimal(0),
          lines: {
            create: [{ purpose: "VISIT", amountPaid: new Prisma.Decimal(100 + i * 10), sortOrder: 0 }],
          },
        },
      });
    }
  });

  after(async () => {
    await prisma.claimRemittance.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.claimLine.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.claimBatch.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.outboxEvent.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("builds a batch from payer invoices, submits B2B e-invoice, remittance matches ≥ 90%", async () => {
    const batch = await claims.createBatch(tenantId, finance, {
      payerCompanyId: payerId,
      periodFrom: "2026-11-01",
      periodTo: "2026-11-30",
    });
    assert.equal(batch.lines.length, 10);
    assert.equal(batch.status, "DRAFT");

    const submitted = await claims.submitBatch(tenantId, finance, batch.id);
    assert.equal(submitted.status, "SUBMITTED");
    assert.ok(submitted.b2bInvoiceNumber?.startsWith("B2B-"));
    const outbox = await prisma.outboxEvent.findFirst({
      where: { tenantId, type: PAYER_B2B_INVOICE_TOPIC },
    });
    assert.ok(outbox);
    assert.equal(outbox!.target, "INTERNAL");

    const remittanceRows = batch.lines.slice(0, 9).map((l) => ({
      externalRef: l.externalRef,
      amount: Number(l.amountClaimed),
    }));
    remittanceRows.push({ externalRef: "GHOST-REF", amount: 1 });

    const rem = await claims.importRemittance(tenantId, finance, {
      payerCompanyId: payerId,
      batchId: batch.id,
      reference: `REM-${stamp}`,
      lines: remittanceRows,
    });
    assert.ok(rem.matchedRatio >= 0.9, `expected ≥0.9 got ${rem.matchedRatio}`);
    assert.equal(rem.matchedCount, 9);
    assert.equal(rem.unmatchedCount, 1);

    const refreshed = await claims.getBatch(tenantId, batch.id);
    assert.equal(refreshed.status, "PARTIALLY_PAID");
    assert.equal(refreshed.lines.filter((l) => l.status === "PAID").length, 9);
  });

  it("rejects a line with a reason and allows resubmission", async () => {
    const inv = await prisma.invoice.create({
      data: {
        tenantId,
        clinicId,
        patientId,
        payerCompanyId: payerId,
        invoiceNumber: `MN05-R-${stamp}`,
        issueDate: new Date("2026-11-15T10:00:00Z"),
        currency: "EGP",
        backgroundColor: "#fff",
        sectionsSnapshot: {},
        patientName: "Sara Corp",
        clinicNameEn: "Branch",
        clinicNameAr: "فرع",
        clinicAddressEn: "Street",
        clinicAddressAr: "شارع",
        clinicPhone: "+20100000000",
        clinicEmail: `mn05.r.${stamp}@example.com`,
        clinicLicenseNumber: `MN05-R-${stamp}`,
        vatPercentSnapshot: new Prisma.Decimal(0),
        lines: { create: [{ purpose: "VISIT", amountPaid: new Prisma.Decimal(500), sortOrder: 0 }] },
      },
    });
    const b2 = await claims.createBatch(tenantId, finance, {
      payerCompanyId: payerId,
      periodFrom: "2026-11-01",
      periodTo: "2026-11-30",
      invoiceIds: [inv.id],
    });
    assert.equal(b2.lines.length, 1);
    await claims.submitBatch(tenantId, finance, b2.id);
    const lineId = b2.lines[0]!.id;
    const rejected = await claims.rejectLine(tenantId, finance, lineId, "Missing pre-auth");
    assert.equal(rejected.status, "REJECTED");
    assert.equal(rejected.rejectionReason, "Missing pre-auth");
    const resub = await claims.resubmitLine(tenantId, finance, lineId);
    assert.equal(resub.status, "RESUBMITTED");
    assert.equal(resub.resubmissionOfId, lineId);
    assert.ok(resub.externalRef.endsWith("-R"));
  });
});
