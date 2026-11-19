import { DateTime } from "luxon";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PaymentMethod, Prisma, PrismaClient, RevenueStatus, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { postRevenue } from "../compliance/post-revenue";
import type { PrismaService } from "../prisma/prisma.service";
import { BillingService } from "./billing.service";
import { PatientMoneyService } from "./patient-money.service";

const prisma = new PrismaClient();
const money = new PatientMoneyService(prisma as unknown as PrismaService);
const billing = new BillingService(prisma as unknown as PrismaService);

describe("MN-01 refunds, credit notes, deposits & prepaid packages", () => {
  const stamp = Date.now();
  let tenantId: string;
  let clinicId: string;
  let patientId: string;
  let appointmentId: string;
  let owner: JwtUser;
  let desk: JwtUser;
  let finance: JwtUser;

  before(async () => {
    await prisma.$connect();
    const base = await prisma.clinic.findFirstOrThrow({ orderBy: { createdAt: "asc" }, include: { tenant: true } });
    const tenant = await prisma.tenant.create({
      data: { name: `MN01 ${stamp}`, deploymentCell: base.tenant.deploymentCell, marketId: base.tenant.marketId },
    });
    tenantId = tenant.id;
    const clinic = await prisma.clinic.create({
      data: {
        tenantId,
        nameEn: `MN01 Branch ${stamp}`,
        nameAr: "فرع",
        country: base.country,
        city: base.city,
        addressEn: "Street",
        addressAr: "شارع",
        locationUrl: "https://maps.example/mn01",
        timezone: base.timezone,
        phone: base.phone,
        email: `mn01.${stamp}@example.com`,
        licenseNumber: `MN01-${stamp}`,
        defaultCurrency: base.defaultCurrency,
      },
    });
    clinicId = clinic.id;
    const mk = async (role: UserRole, tag: string, isTenantOwner = false) => {
      const u = await prisma.user.create({
        data: { tenantId, email: `mn01.${tag}.${stamp}@example.com`, passwordHash: "x", displayName: tag, role, isTenantOwner },
      });
      return { userId: u.id, tenantId, email: u.email, role, additionalRoles: [], isTenantOwner } as unknown as JwtUser;
    };
    owner = await mk(UserRole.GROUP_ADMIN, "owner", true);
    desk = await mk(UserRole.RECEPTIONIST, "desk");
    finance = await mk(UserRole.FINANCE_OFFICER, "finance");
    const doc = await mk(UserRole.PHYSICIAN, "doc");
    const p = await prisma.patient.create({
      data: { tenantId, mrn: `MN01-${stamp}`, firstNameEn: "Mona", lastNameEn: "Refund", gender: "UNKNOWN", phone: "+201055501001" },
    });
    patientId = p.id;
    const startsAt = new Date(Date.now() - 2 * 3_600_000);
    const apt = await prisma.appointment.create({
      data: {
        tenantId,
        clinicId,
        clinicianId: doc.userId,
        patientId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        feeAmount: new Prisma.Decimal("600"),
      },
    });
    appointmentId = apt.id;
  });

  after(async () => {
    for (const m of ["billingRefund", "cashMovement", "patientDeposit", "creditNote", "patientPackageConsumption"] as const) {
      await (prisma[m] as unknown as { deleteMany: (a: unknown) => Promise<unknown> }).deleteMany({ where: { tenantId } }).catch(() => undefined);
    }
    await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  async function collectVisitFee(amount: number): Promise<string> {
    return prisma.$transaction(async (tx) => {
      const { revenueEntryId } = await postRevenue(tx, {
        tenantId,
        clinicId,
        category: "VISIT",
        grossAmount: amount,
        taxAmount: 0,
        netAmount: amount,
        appointmentId,
        collectionMode: "CASH_ON_VISIT",
      });
      return revenueEntryId;
    });
  }

  it("every refund creates exactly one revenue reversal and one cash movement", async () => {
    const revId = await collectVisitFee(600);
    const r1 = await money.createRefund(tenantId, desk, { revenueEntryId: revId, amount: 200, reason: "Overcharged" });
    const r2 = await money.createRefund(tenantId, finance, { revenueEntryId: revId, amount: 400, reason: "Visit cancelled" });
    for (const r of [r1, r2]) {
      assert.equal(r.status, "COMPLETED");
      const reversals = await prisma.revenueEntry.findMany({ where: { tenantId, category: "REFUND", id: r.reversalRevenueEntryId! } });
      assert.equal(reversals.length, 1);
      assert.equal(Number(reversals[0]!.grossAmount), -Number(r.amount));
      assert.equal(reversals[0]!.appointmentId, appointmentId, "reversal stays on the visit so per-visit totals net out");
      const moves = await prisma.cashMovement.findMany({ where: { tenantId, sourceType: "REFUND", sourceId: r.id } });
      assert.equal(moves.length, 1);
      assert.equal(moves[0]!.direction, "OUT");
      assert.equal(Number(moves[0]!.amount), Number(r.amount));
      assert.ok(r.creditNoteId, "a credit note documents the refund");
    }
    const net = await prisma.revenueEntry.aggregate({ where: { tenantId, appointmentId, status: RevenueStatus.POSTED }, _sum: { grossAmount: true } });
    assert.equal(Number(net._sum.grossAmount), 0, "fully refunded visit nets to zero revenue");
    await assert.rejects(
      money.createRefund(tenantId, finance, { revenueEntryId: revId, amount: 1, reason: "again" }),
      (e: { response?: { code?: string } }) => e.response?.code === "REFUND_EXCEEDS_BALANCE",
    );
  });

  it("refunds above the market threshold wait for approval and post nothing until approved", async () => {
    const revId = await collectVisitFee(5000);
    const pending = await money.createRefund(tenantId, desk, { revenueEntryId: revId, amount: 1500, reason: "Big refund" });
    assert.equal(pending.status, "PENDING_APPROVAL");
    assert.equal(await prisma.cashMovement.count({ where: { tenantId, sourceId: pending.id } }), 0);
    assert.equal(await prisma.revenueEntry.count({ where: { tenantId, category: "REFUND", description: "Refund: Big refund" } }), 0);
    await assert.rejects(money.decideRefund(tenantId, desk, pending.id, "approve"), /approve/i);
    const done = await money.decideRefund(tenantId, owner, pending.id, "approve");
    assert.equal(done.status, "COMPLETED");
    assert.equal(await prisma.cashMovement.count({ where: { tenantId, sourceType: "REFUND", sourceId: pending.id } }), 1);
    assert.equal(await prisma.revenueEntry.count({ where: { tenantId, category: "REFUND", id: done.reversalRevenueEntryId! } }), 1);
    await assert.rejects(money.decideRefund(tenantId, owner, pending.id, "approve"), (e: { response?: { code?: string } }) => e.response?.code === "REFUND_NOT_PENDING");
    const audits = await prisma.auditLog.count({ where: { tenantId, resourceId: pending.id, action: { in: ["REFUND_REQUESTED", "REFUND_APPROVED"] } } });
    assert.equal(audits, 2);
  });

  it("packages: sale is a liability, each session recognises revenue, sessions sum to the price", async () => {
    const pkg = await money.sellPackage(tenantId, desk, {
      clinicId,
      patientId,
      nameEn: "Physio x3",
      nameAr: "علاج طبيعي ×٣",
      totalSessions: 3,
      paidAmount: 1000,
      method: PaymentMethod.CARD,
      expiresOn: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    });
    assert.equal(await prisma.revenueEntry.count({ where: { tenantId, category: "PACKAGE_SESSION" } }), 0);
    const values: number[] = [];
    for (let i = 0; i < 3; i++) {
      const c = await money.consumePackage(tenantId, desk, pkg.id, { appointmentId: i === 0 ? appointmentId : null });
      values.push(c.consumption.amount);
    }
    assert.deepEqual(values, [333.33, 333.33, 333.34]);
    const rev = await prisma.revenueEntry.aggregate({ where: { tenantId, category: "PACKAGE_SESSION" }, _sum: { grossAmount: true } });
    assert.equal(Number(rev._sum.grossAmount), 1000);
    await assert.rejects(money.consumePackage(tenantId, desk, pkg.id, {}), (e: { response?: { code?: string } }) => e.response?.code === "PACKAGE_EXHAUSTED");
  });

  it("expired packages cannot be consumed; cancelled packages return only unused value", async () => {
    const expired = await money.sellPackage(tenantId, desk, {
      clinicId, patientId, nameEn: "Old", totalSessions: 2, paidAmount: 400, method: PaymentMethod.CASH, expiresOn: "2020-01-01",
    });
    await assert.rejects(money.consumePackage(tenantId, desk, expired.id, {}), (e: { response?: { code?: string } }) => e.response?.code === "PACKAGE_EXPIRED");
    const pkg = await money.sellPackage(tenantId, desk, { clinicId, patientId, nameEn: "Laser x4", totalSessions: 4, paidAmount: 800, method: PaymentMethod.CASH });
    await money.consumePackage(tenantId, desk, pkg.id, {});
    const cancelled = await money.cancelPackage(tenantId, finance, pkg.id, { reason: "Moved city" });
    assert.equal(cancelled.unusedReturned, 600);
    const out = await prisma.cashMovement.findFirstOrThrow({ where: { tenantId, sourceType: "PACKAGE_CANCEL", sourceId: pkg.id } });
    assert.equal(Number(out.amount), 600);
  });

  it("deposits are liabilities until applied; applied deposits post revenue once and can be refunded", async () => {
    const dep = await money.takeDeposit(tenantId, desk, { clinicId, patientId, appointmentId, amount: 250, method: PaymentMethod.TRANSFER });
    assert.equal(dep.status, "HELD");
    assert.equal(await prisma.revenueEntry.count({ where: { tenantId, category: "DEPOSIT_APPLIED" } }), 0);
    const bal = await money.patientBalances(tenantId, desk, patientId);
    assert.equal(bal.depositsHeld, 250);
    const applied = await money.applyDeposit(tenantId, desk, dep.id, {});
    assert.equal(applied.status, "APPLIED");
    await assert.rejects(money.applyDeposit(tenantId, desk, dep.id, {}), (e: { response?: { code?: string } }) => e.response?.code === "DEPOSIT_NOT_HELD");
    assert.equal(await prisma.revenueEntry.count({ where: { tenantId, category: "DEPOSIT_APPLIED" } }), 1);
    const refund = await money.createRefund(tenantId, finance, { revenueEntryId: applied.revenueEntryId!, amount: 250, reason: "Doctor unavailable" });
    assert.equal(refund.method, PaymentMethod.TRANSFER);
    const after = await money.patientBalances(tenantId, desk, patientId);
    assert.equal(after.depositsHeld, 0);
    assert.ok(after.refunds.some((r) => r.id === refund.id));
  });

  it("cash close subtracts refunds and adds deposits/package sales for the day", async () => {
    // the shift day is a calendar date in the clinic's timezone (CR: was the UTC date, flaky near local midnight)
    const tz = (await prisma.clinic.findUniqueOrThrow({ where: { id: clinicId } })).timezone ?? "Africa/Cairo";
    const shiftDate = DateTime.now().setZone(tz).toISODate()!;
    const close = await billing.closeCashierShift(tenantId, finance, { clinicId, shiftDate, countedCash: 0, countedCard: 0 });
    const moves = await prisma.cashMovement.findMany({ where: { tenantId, clinicId } });
    const cash = moves.filter((m) => m.method === "CASH").reduce((s, m) => s + (m.direction === "OUT" ? -1 : 1) * Number(m.amount), 0);
    assert.equal(Number(close.expectedCash), cash);
  });
});
