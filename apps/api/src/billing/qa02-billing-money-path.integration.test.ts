import assert from "node:assert/strict";
import { config } from "dotenv";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { PaymentMethod, UserRole, type PrismaClient } from "@prisma/client";
import { createPrismaClient } from "../prisma/create-prisma-client";
import { PrismaService } from "../prisma/prisma.service";
import { BillingService } from "./billing.service";

config({ path: resolve(process.cwd(), ".env") });

const isCi = process.env.CI === "true";

describe("QA-02 patient billing money path", () => {
  const prisma = createPrismaClient();
  let billing: BillingService;
  let tenantId: string;
  let clinicId: string;
  let patientId: string;
  let financeUserId: string;
  let adminUserId: string;

  before(async () => {
    if (!process.env.DATABASE_URL?.trim()) {
      if (isCi) assert.fail("CI requires DATABASE_URL for QA-02 billing integration");
      return;
    }
    await prisma.$connect();
    billing = new BillingService(prisma as unknown as PrismaService);

    const tenant = await prisma.tenant.findFirst({
      where: { name: { contains: "Dr Ahmed" } },
      orderBy: { createdAt: "asc" },
    });
    assert.ok(tenant, "seed tenant required");
    tenantId = tenant.id;

    const clinic = await prisma.clinic.findFirst({
      where: { tenantId, nameEn: { contains: "Heliopolis", mode: "insensitive" } },
    });
    assert.ok(clinic);
    clinicId = clinic.id;

    const patient = await prisma.patient.findFirst({ where: { tenantId, homeBranchId: clinicId } });
    assert.ok(patient);
    patientId = patient.id;

    const finance = await prisma.user.findFirst({
      where: { tenantId, email: "finance@drahmedshall.com" },
    });
    assert.ok(finance);
    financeUserId = finance.id;

    const admin = await prisma.user.findFirst({
      where: { tenantId, email: "admin@drahmedshall.com" },
    });
    assert.ok(admin);
    adminUserId = admin.id;
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it("catalog create + resolve price (list)", async (t) => {
    if (!process.env.DATABASE_URL?.trim()) {
      t.skip("DATABASE_URL not set");
      return;
    }
    const code = `QA02${Date.now().toString(36).toUpperCase()}`;
    const item = await billing.createCatalogItem(tenantId, { userId: adminUserId, role: UserRole.GROUP_ADMIN } as never, {
      code,
      nameEn: "QA02 service",
      nameAr: "خدمة",
      amount: 420,
      currency: "EGP",
    });
    const priced = await billing.resolvePrice(tenantId, item.id, new Date());
    assert.equal(priced.source, "LIST");
    assert.equal(priced.amount, 420);
    const listed = await billing.listCatalog(tenantId, code.slice(0, 4));
    assert.ok(listed.items.some((i) => i.id === item.id));
  });

  it("recordPayment with split allocations persists cashier payment", async (t) => {
    if (!process.env.DATABASE_URL?.trim()) {
      t.skip("DATABASE_URL not set");
      return;
    }
    const payment = await billing.recordPayment(tenantId, { userId: financeUserId, role: UserRole.FINANCE_OFFICER } as never, {
      clinicId,
      patientId,
      currency: "EGP",
      allocations: [
        { method: PaymentMethod.CASH, amount: 80 },
        { method: PaymentMethod.CARD, amount: 70 },
      ],
      submitEta: false,
    });
    assert.equal(Number(payment.totalAmount), 150);
    assert.equal(payment.allocations.length, 2);
  });

  it("cash close matches expected cash and card for shift day", async (t) => {
    if (!process.env.DATABASE_URL?.trim()) {
      t.skip("DATABASE_URL not set");
      return;
    }
    const shiftDate = new Date().toISOString().slice(0, 10);
    const close = await billing.closeCashierShift(tenantId, { userId: financeUserId, role: UserRole.FINANCE_OFFICER } as never, {
      clinicId,
      shiftDate,
      countedCash: 80,
      countedCard: 70,
      notes: "QA-02 close",
    });
    assert.equal(Number(close.countedCash), 80);
    assert.equal(Number(close.countedCard), 70);
    assert.ok(Number(close.expectedCash) >= 80);
    assert.ok(Number(close.expectedCard) >= 70);
  });
});