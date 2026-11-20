import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ClaimBatchStatus, ClaimLineStatus, Prisma, PrismaClient, RevenueStatus, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import type { PrismaService } from "../prisma/prisma.service";
import { ReportsService } from "./reports.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();

describe("RP-04 AR aging & branch P&L reconcile with billing", () => {
  const stamp = Date.now();
  let tenantId: string;
  let clinicId: string;
  let owner: JwtUser;
  let reports: ReportsService;

  before(async () => {
    await prisma.$connect();
    const base = await prisma.clinic.findFirstOrThrow({ orderBy: { createdAt: "asc" }, include: { tenant: true } });
    const tenant = await prisma.tenant.create({
      data: { name: `RP04 ${stamp}`, deploymentCell: base.tenant.deploymentCell, marketId: base.tenant.marketId },
    });
    tenantId = tenant.id;
    const clinic = await prisma.clinic.create({
      data: {
        tenantId,
        nameEn: `RP04 Branch ${stamp}`,
        nameAr: "فرع",
        country: base.country,
        city: base.city,
        addressEn: "St",
        addressAr: "ش",
        locationUrl: "https://maps.example/rp04",
        timezone: base.timezone,
        phone: base.phone,
        email: `rp04.${stamp}@example.com`,
        licenseNumber: `RP04-${stamp}`,
        defaultCurrency: base.defaultCurrency,
      },
    });
    clinicId = clinic.id;
    const u = await prisma.user.create({
      data: {
        tenantId,
        email: `rp04.owner.${stamp}@example.com`,
        passwordHash: "x",
        displayName: "Owner",
        role: UserRole.GROUP_ADMIN,
        isTenantOwner: true,
      },
    });
    owner = { userId: u.id, tenantId, email: u.email, role: UserRole.GROUP_ADMIN, additionalRoles: [], isTenantOwner: true } as unknown as JwtUser;

    const patient = await prisma.patient.create({
      data: { tenantId, mrn: `RP04-${stamp}`, firstNameEn: "P", lastNameEn: "A", gender: "M", phone: "+201055507107" },
    });
    const payer = await prisma.payerCompany.create({
      data: { tenantId, nameEn: `Payer ${stamp}`, nameAr: "جهة" },
    });
    const inv = await prisma.invoice.create({
      data: {
        tenantId,
        clinicId,
        patientId: patient.id,
        payerCompanyId: payer.id,
        invoiceNumber: `RP04-${stamp}`,
        issueDate: new Date("2026-10-01T00:00:00Z"),
        currency: "EGP",
        backgroundColor: "#fff",
        sectionsSnapshot: {},
        patientName: "P A",
        clinicNameEn: clinic.nameEn,
        clinicNameAr: clinic.nameAr,
        clinicAddressEn: "St",
        clinicAddressAr: "ش",
        clinicPhone: clinic.phone,
        clinicEmail: clinic.email,
        clinicLicenseNumber: clinic.licenseNumber,
        vatPercentSnapshot: new Prisma.Decimal(0),
        lines: { create: [{ purpose: "VISIT", amountPaid: new Prisma.Decimal(500), sortOrder: 0 }] },
      },
    });
    const batch = await prisma.claimBatch.create({
      data: {
        tenantId,
        payerCompanyId: payer.id,
        periodFrom: new Date("2026-10-01"),
        periodTo: new Date("2026-10-31"),
        status: ClaimBatchStatus.SUBMITTED,
        currency: "EGP",
        submittedAt: new Date(),
      },
    });
    await prisma.claimLine.create({
      data: {
        tenantId,
        batchId: batch.id,
        invoiceId: inv.id,
        patientId: patient.id,
        externalRef: inv.invoiceNumber,
        amountClaimed: new Prisma.Decimal(500),
        amountCopay: new Prisma.Decimal(0),
        status: ClaimLineStatus.SUBMITTED,
      },
    });

    await prisma.revenueEntry.create({
      data: {
        tenantId,
        clinicId,
        category: "VISIT",
        status: RevenueStatus.POSTED,
        grossAmount: new Prisma.Decimal(200),
        taxAmount: new Prisma.Decimal(0),
        netAmount: new Prisma.Decimal(200),
        currency: "EGP",
        postedAt: new Date("2026-11-10T12:00:00Z"),
      },
    });

    reports = new ReportsService(prisma as unknown as PrismaService, { ensureForRange: async () => undefined } as never);
  });

  after(async () => {
    await prisma.claimLine.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.claimBatch.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.revenueEntry.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("AR aging totals reconcile with open claim lines", async () => {
    const aging = await reports.arAging(tenantId, "2026-11-19", owner);
    assert.equal(aging.reconcilesWithClaimLines, true);
    assert.equal(aging.grandTotal, 500);
    assert.equal(aging.openClaimLineTotal, 500);
    assert.ok(aging.rows[0]!.buckets.b31_60 === 500 || aging.rows[0]!.total === 500);
  });

  it("branch P&L reconciles with revenue tables", async () => {
    const pl = await reports.branchPl(tenantId, "2026-11-01", "2026-11-30", owner);
    assert.equal(pl.reconcilesWithBilling, true);
    assert.equal(pl.totals.revenue, 200);
    assert.equal(pl.billingTotals.revenue, 200);
  });
});
