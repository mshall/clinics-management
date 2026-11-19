import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Prisma, PrismaClient, RevenueStatus, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { upsertEncounterVisitFeeRevenue } from "../common/visit-fee-ledger";
import { postRevenue } from "../compliance/post-revenue";
import type { PrismaService } from "../prisma/prisma.service";
import { SplitPaymentService } from "./split-payment.service";

const prisma = new PrismaClient();
const svc = prisma as unknown as PrismaService;
const split = new SplitPaymentService(svc);
const code = (c: string) => (e: { response?: { code?: string } }) => e.response?.code === c;

describe("MN-06 split payments & installments", () => {
  const stamp = Date.now();
  let tenantId: string;
  let clinicId: string;
  let patientId: string;
  let doctorId: string;
  let desk: JwtUser;

  async function encounterWithBalance(balance: number) {
    const enc = await prisma.encounter.create({ data: { tenantId, clinicId, patientId, clinicianId: doctorId, visitType: "CONSULTATION" } });
    await prisma.$transaction((tx) =>
      postRevenue(tx, {
        tenantId,
        clinicId,
        patientId,
        encounterId: enc.id,
        category: "VISIT_FEE",
        description: "Visit fee balance due",
        grossAmount: balance,
        taxAmount: 0,
        netAmount: balance,
        currency: "EGP",
        status: RevenueStatus.RECEIVABLE,
      }),
    );
    return enc.id;
  }

  const visitRows = (encounterId: string) =>
    prisma.revenueEntry.findMany({ where: { tenantId, encounterId, category: "VISIT_FEE" }, orderBy: { createdAt: "asc" } });

  async function assertEachAllocationPosted(paymentId: string) {
    const allocs = await prisma.billingPaymentAllocation.findMany({ where: { paymentId } });
    assert.ok(allocs.length > 0);
    for (const a of allocs) {
      assert.ok(a.revenueEntryId, "allocation is linked to its revenue row");
      const r = await prisma.revenueEntry.findUniqueOrThrow({ where: { id: a.revenueEntryId! } });
      assert.equal(r.status, RevenueStatus.POSTED);
      assert.equal(Number(r.grossAmount), Number(a.amount));
      assert.ok(r.collectionMode, "collected rows carry a collection mode");
    }
  }

  before(async () => {
    await prisma.$connect();
    const base = await prisma.clinic.findFirstOrThrow({ orderBy: { createdAt: "asc" }, include: { tenant: true } });
    tenantId = (
      await prisma.tenant.create({ data: { name: `MN06 ${stamp}`, deploymentCell: base.tenant.deploymentCell, marketId: base.tenant.marketId } })
    ).id;
    clinicId = (
      await prisma.clinic.create({
        data: {
          tenantId,
          nameEn: `MN06 Branch ${stamp}`,
          nameAr: "فرع",
          country: base.country,
          city: base.city,
          addressEn: "Street",
          addressAr: "شارع",
          locationUrl: "https://maps.example/mn06",
          timezone: base.timezone,
          phone: base.phone,
          email: `mn06.${stamp}@example.com`,
          licenseNumber: `MN06-${stamp}`,
          defaultCurrency: base.defaultCurrency,
        },
      })
    ).id;
    const d = await prisma.user.create({
      data: { tenantId, email: `mn06.desk.${stamp}@example.com`, passwordHash: "x", displayName: "Desk", role: UserRole.RECEPTIONIST },
    });
    desk = { userId: d.id, tenantId, email: d.email, role: UserRole.RECEPTIONIST, additionalRoles: [] } as unknown as JwtUser;
    doctorId = (
      await prisma.user.create({ data: { tenantId, email: `mn06.dr.${stamp}@example.com`, passwordHash: "x", displayName: "Dr", role: UserRole.PHYSICIAN } })
    ).id;
    patientId = (
      await prisma.patient.create({ data: { tenantId, mrn: `MN06-${stamp}`, firstNameEn: "Split", lastNameEn: "Pay", gender: "UNKNOWN", phone: "+201055506001" } })
    ).id;
  });

  after(async () => {
    await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("visit balance split cash + card: each allocation posts its own VISIT_FEE revenue; the balance clears", async () => {
    const encounterId = await encounterWithBalance(500);
    const r = await split.record(tenantId, desk, {
      clinicId,
      patientId,
      target: { kind: "VISIT", encounterId },
      allocations: [
        { method: "CASH", amount: 300 },
        { method: "CARD", amount: 200 },
      ],
    });
    assert.equal(r.total, 500);
    assert.equal(r.remainingBalance, 0);
    assert.equal(r.allocations.length, 2);
    await assertEachAllocationPosted(r.paymentId);
    const rows = await visitRows(encounterId);
    const posted = rows.filter((x) => x.status === RevenueStatus.POSTED);
    assert.deepEqual(posted.map((x) => Number(x.grossAmount)).sort(), [200, 300]);
    assert.equal(rows.filter((x) => x.status === RevenueStatus.RECEIVABLE).length, 0);
    const audit = await prisma.auditLog.findFirst({ where: { tenantId, action: "SPLIT_PAYMENT_RECORDED", resourceId: r.paymentId } });
    assert.ok(audit);
  });

  it("partial visit payment leaves the rest receivable; more than the balance is refused", async () => {
    const encounterId = await encounterWithBalance(500);
    await assert.rejects(
      split.record(tenantId, desk, { clinicId, patientId, target: { kind: "VISIT", encounterId }, allocations: [{ method: "CASH", amount: 600 }] }),
      code("VISIT_BALANCE_EXCEEDED"),
    );
    const r = await split.record(tenantId, desk, {
      clinicId,
      patientId,
      target: { kind: "VISIT", encounterId },
      allocations: [
        { method: "CASH", amount: 100 },
        { method: "WALLET", amount: 100, channel: "instapay", reference: "IP-1" },
      ],
    });
    assert.equal(r.remainingBalance, 300);
    const rows = await visitRows(encounterId);
    assert.equal(Number(rows.find((x) => x.status === RevenueStatus.RECEIVABLE)!.netAmount), 300);
    const wallet = rows.find((x) => x.transferChannel === "INSTAPAY");
    assert.equal(wallet?.collectionMode, "MONEY_TRANSFER");
    assert.equal(wallet?.transferReference, "IP-1");
  });

  it("a later fee reduction trims the newest split row (ledger sums every collected row)", async () => {
    const encounterId = await encounterWithBalance(500);
    await split.record(tenantId, desk, {
      clinicId,
      patientId,
      target: { kind: "VISIT", encounterId },
      allocations: [
        { method: "CASH", amount: 300 },
        { method: "CARD", amount: 200 },
      ],
    });
    await prisma.$transaction((tx) =>
      upsertEncounterVisitFeeRevenue(tx, { tenantId, clinicId, encounterId, appointmentId: null, amount: 400, patientId, currency: "EGP" }),
    );
    const posted = (await visitRows(encounterId)).filter((x) => x.status === RevenueStatus.POSTED);
    assert.equal(posted.reduce((s, x) => s + Number(x.netAmount), 0), 400);
    await prisma.$transaction((tx) =>
      upsertEncounterVisitFeeRevenue(tx, { tenantId, clinicId, encounterId, appointmentId: null, amount: 400, patientId, currency: "EGP" }),
    );
    const again = (await visitRows(encounterId)).filter((x) => x.status === RevenueStatus.POSTED);
    assert.equal(again.reduce((s, x) => s + Number(x.netAmount), 0), 400, "re-sync at the same fee is a no-op");
  });

  it("operation installments: schedule, split payment settles the oldest installment and posts OPERATION_PAYMENT per method", async () => {
    const op = await prisma.operation.create({
      data: { tenantId, clinicId, patientId, clinicianId: doctorId, operationDate: new Date(), totalCost: new Prisma.Decimal("3000"), feeCurrency: "EGP" },
    });
    const today = new Date().toISOString().slice(0, 10);
    const plus = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
    await assert.rejects(
      split.setSchedule(tenantId, desk, op.id, [{ dueOn: today, amount: 4000 }]),
      code("INSTALLMENTS_EXCEED_BALANCE"),
    );
    const sched = await split.setSchedule(tenantId, desk, op.id, [
      { dueOn: plus(-3), amount: 1000 },
      { dueOn: plus(1), amount: 1000 },
      { dueOn: plus(40), amount: 1000 },
    ]);
    assert.equal(sched.unscheduled, 0);
    const before = await split.listInstallments(tenantId, desk, { operationId: op.id });
    assert.deepEqual(before.map((i) => i.status), ["OVERDUE", "DUE_SOON", "UPCOMING"]);

    const r = await split.record(tenantId, desk, {
      clinicId,
      patientId,
      target: { kind: "OPERATION", operationId: op.id },
      allocations: [
        { method: "CASH", amount: 600 },
        { method: "TRANSFER", amount: 400, reference: "BANK-9" },
      ],
    });
    await assertEachAllocationPosted(r.paymentId);
    assert.equal(r.remainingBalance, 2000);
    assert.equal(r.installmentsPaid.length, 1);
    const fresh = await prisma.operation.findUniqueOrThrow({ where: { id: op.id } });
    assert.equal(Number(fresh.paidAmount), 1000);
    const rev = await prisma.revenueEntry.findMany({ where: { tenantId, operationId: op.id } });
    assert.ok(rev.every((x) => x.category === "OPERATION_PAYMENT"));
    assert.equal(rev.reduce((s, x) => s + Number(x.netAmount), 0), 1000);
    const after = await split.listInstallments(tenantId, desk, { operationId: op.id });
    assert.deepEqual(after.map((i) => i.status), ["PAID", "DUE_SOON", "UPCOMING"]);
    assert.equal(after[0]!.paymentId, r.paymentId);

    // partial payment does not settle the next installment; completing it does
    await split.record(tenantId, desk, { clinicId, patientId, target: { kind: "OPERATION", operationId: op.id }, allocations: [{ method: "CASH", amount: 500 }] });
    assert.equal((await split.listInstallments(tenantId, desk, { operationId: op.id }))[1]!.status, "DUE_SOON");
    await split.record(tenantId, desk, { clinicId, patientId, target: { kind: "OPERATION", operationId: op.id }, allocations: [{ method: "CARD", amount: 500 }] });
    assert.equal((await split.listInstallments(tenantId, desk, { operationId: op.id }))[1]!.status, "PAID");
    await assert.rejects(
      split.record(tenantId, desk, { clinicId, patientId, target: { kind: "OPERATION", operationId: op.id }, allocations: [{ method: "CASH", amount: 1500 }] }),
      code("OPERATION_BALANCE_EXCEEDED"),
    );
    await assert.rejects(
      split.setSchedule(tenantId, desk, op.id, [{ dueOn: plus(-10), amount: 500 }]),
      code("INSTALLMENT_BEFORE_PAID"),
    );
  });

  it("other service: description required; Kiorex Pay is never a desk method", async () => {
    await assert.rejects(
      split.record(tenantId, desk, { clinicId, patientId, target: { kind: "SERVICE", description: "" }, allocations: [{ method: "CASH", amount: 50 }] }),
      code("DESCRIPTION_REQUIRED"),
    );
    await assert.rejects(
      split.record(tenantId, desk, { clinicId, patientId, target: { kind: "SERVICE", description: "Dressing" }, allocations: [{ method: "KIOREX_PAY", amount: 50 }] }),
      code("METHOD_NOT_ALLOWED"),
    );
    const r = await split.record(tenantId, desk, {
      clinicId,
      patientId,
      target: { kind: "SERVICE", description: "Dressing" },
      allocations: [
        { method: "CASH", amount: 30 },
        { method: "CARD", amount: 20 },
      ],
    });
    await assertEachAllocationPosted(r.paymentId);
    const rows = await prisma.revenueEntry.findMany({ where: { id: { in: r.allocations.map((a) => a.revenueEntryId) } } });
    assert.ok(rows.every((x) => x.category === "SERVICE" && x.description?.startsWith("Dressing")));
  });
});
