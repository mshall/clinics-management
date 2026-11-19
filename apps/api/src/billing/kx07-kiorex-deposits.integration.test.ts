import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { AppointmentStatus, BookingSource, PaymentMethod, Prisma, PrismaClient, RevenueStatus, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import type { PrismaService } from "../prisma/prisma.service";
import { BillingService } from "./billing.service";
import { DepositSettlementService } from "./deposit-settlement.service";
import { KiorexDepositsService } from "./kiorex-deposits.service";
import { PatientMoneyService } from "./patient-money.service";

const prisma = new PrismaClient();
const svc = prisma as unknown as PrismaService;
const money = new PatientMoneyService(svc);
const settlement = new DepositSettlementService(svc, money);
const kiorex = new KiorexDepositsService(svc, money, settlement);
const billing = new BillingService(svc);

describe("KX-07 Kiorex deposits & prepayments into clinic billing", () => {
  const stamp = Date.now();
  let tenantId: string;
  let clinicId: string;
  let patientId: string;
  let doctorId: string;
  let clientId: string;
  let finance: JwtUser;
  let n = 0;

  async function kiorexBooking(fee = 400) {
    n += 1;
    const startsAt = new Date(Date.now() + (48 + n) * 3_600_000);
    const ref = `kx07-${stamp}-${n}`;
    const apt = await prisma.appointment.create({
      data: {
        tenantId,
        clinicId,
        clinicianId: doctorId,
        patientId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        feeAmount: new Prisma.Decimal(String(fee)),
        status: AppointmentStatus.CONFIRMED,
        bookingSource: BookingSource.KIOREX_MARKETPLACE,
        platformIntegrationClientId: clientId,
        externalReference: ref,
      },
    });
    return { apt, ref };
  }

  const settle = (appointmentId: string) =>
    prisma.$transaction((tx) => settlement.settleAppointmentDepositsTx(tx, tenantId, appointmentId, finance.userId));

  before(async () => {
    await prisma.$connect();
    const base = await prisma.clinic.findFirstOrThrow({ orderBy: { createdAt: "asc" }, include: { tenant: true } });
    clientId = (
      await prisma.platformIntegrationClient.create({
        data: { name: `KX07 ${stamp}`, clientKey: `plt_kx07_${stamp}`, secretHash: "x", scopes: ["MARKETPLACE"] },
      })
    ).id;
    tenantId = (
      await prisma.tenant.create({ data: { name: `KX07 ${stamp}`, deploymentCell: base.tenant.deploymentCell, marketId: base.tenant.marketId } })
    ).id;
    clinicId = (
      await prisma.clinic.create({
        data: {
          tenantId,
          nameEn: `KX07 Branch ${stamp}`,
          nameAr: "فرع",
          country: base.country,
          city: base.city,
          addressEn: "Street",
          addressAr: "شارع",
          locationUrl: "https://maps.example/kx07",
          timezone: base.timezone,
          phone: base.phone,
          email: `kx07.${stamp}@example.com`,
          licenseNumber: `KX07-${stamp}`,
          defaultCurrency: base.defaultCurrency,
        },
      })
    ).id;
    const fin = await prisma.user.create({
      data: { tenantId, email: `kx07.fin.${stamp}@example.com`, passwordHash: "x", displayName: "Fin", role: UserRole.FINANCE_OFFICER },
    });
    finance = { userId: fin.id, tenantId, email: fin.email, role: UserRole.FINANCE_OFFICER, additionalRoles: [] } as unknown as JwtUser;
    doctorId = (
      await prisma.user.create({
        data: { tenantId, email: `kx07.dr.${stamp}@example.com`, passwordHash: "x", displayName: "Dr", role: UserRole.PHYSICIAN },
      })
    ).id;
    patientId = (
      await prisma.patient.create({
        data: { tenantId, mrn: `KX07-${stamp}`, firstNameEn: "Kia", lastNameEn: "Deposit", gender: "UNKNOWN", phone: "+201055507001" },
      })
    ).id;
  });

  after(async () => {
    for (const m of ["billingRefund", "cashMovement", "patientDeposit", "creditNote", "kiorexPayout"] as const) {
      await (prisma[m] as unknown as { deleteMany: (a: unknown) => Promise<unknown> }).deleteMany({ where: { tenantId } }).catch(() => undefined);
    }
    await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.platformIntegrationClient.delete({ where: { id: clientId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("a Kiorex Pay deposit is held (no revenue) and the deposit-paid call is idempotent", async () => {
    const { apt, ref } = await kiorexBooking();
    const d1 = await kiorex.depositPaid(clientId, ref, { amount: 100, paymentRef: `kpay-${stamp}-1` });
    const d2 = await kiorex.depositPaid(clientId, ref, { amount: 100, paymentRef: `kpay-${stamp}-1` });
    assert.equal(d1.id, d2.id);
    assert.equal(d1.status, "HELD");
    assert.equal(d1.method, PaymentMethod.KIOREX_PAY);
    assert.equal(await prisma.revenueEntry.count({ where: { tenantId, appointmentId: apt.id } }), 0);
    const channel = await prisma.tenantPaymentChannel.findFirst({ where: { tenantId, channelKey: "KIOREX_PAY" } });
    assert.ok(channel, "Kiorex Pay channel is registered for the clinic");
    await assert.rejects(
      kiorex.depositPaid(clientId, ref, { amount: 9999, paymentRef: `kpay-${stamp}-big` }),
      (e: { response?: { code?: string } }) => e.response?.code === "DEPOSIT_EXCEEDS_FEE",
    );
  });

  it("at check-in the deposit becomes a BillingPayment whose revenue posts once through postRevenue", async () => {
    const { apt, ref } = await kiorexBooking();
    const dep = await kiorex.depositPaid(clientId, ref, { amount: 150, paymentRef: `kpay-${stamp}-2` });
    await prisma.appointment.update({ where: { id: apt.id }, data: { status: AppointmentStatus.CHECKED_IN, checkedInAt: new Date() } });
    await settle(apt.id);
    await settle(apt.id);
    const applied = await prisma.patientDeposit.findUniqueOrThrow({ where: { id: dep.id } });
    assert.equal(applied.status, "APPLIED");
    assert.ok(applied.paymentId && applied.revenueEntryId);
    const payment = await prisma.billingPayment.findUniqueOrThrow({ where: { id: applied.paymentId! }, include: { allocations: true } });
    assert.equal(payment.allocations.length, 1);
    assert.equal(payment.allocations[0]!.method, PaymentMethod.KIOREX_PAY);
    assert.equal(payment.allocations[0]!.revenueEntryId, applied.revenueEntryId);
    const revs = await prisma.revenueEntry.findMany({ where: { tenantId, appointmentId: apt.id, status: RevenueStatus.POSTED } });
    assert.equal(revs.length, 1, "settling twice never posts twice");
    assert.equal(revs[0]!.category, "DEPOSIT_APPLIED");
    assert.equal(Number(revs[0]!.grossAmount), 150);
  });

  it("a refunded deposit reverses revenue and cash correctly", async () => {
    const { apt, ref } = await kiorexBooking();
    const dep = await kiorex.depositPaid(clientId, ref, { amount: 120, paymentRef: `kpay-${stamp}-3` });
    await prisma.appointment.update({ where: { id: apt.id }, data: { status: AppointmentStatus.CHECKED_IN } });
    await settle(apt.id);
    const applied = await prisma.patientDeposit.findUniqueOrThrow({ where: { id: dep.id } });
    const refund = await money.createRefund(tenantId, finance, { revenueEntryId: applied.revenueEntryId!, amount: 120, reason: "Doctor sick" });
    assert.equal(refund.status, "COMPLETED");
    assert.equal(refund.paymentId, applied.paymentId, "refund is recorded against the payment the deposit became");
    assert.equal(refund.method, PaymentMethod.KIOREX_PAY);
    const net = await prisma.revenueEntry.aggregate({ where: { tenantId, appointmentId: apt.id, status: RevenueStatus.POSTED }, _sum: { grossAmount: true } });
    assert.equal(Number(net._sum.grossAmount), 0);
    const outs = await prisma.cashMovement.findMany({ where: { tenantId, sourceType: "REFUND", sourceId: refund.id } });
    assert.equal(outs.length, 1);
    assert.equal(outs[0]!.method, PaymentMethod.KIOREX_PAY);
    await assert.rejects(
      money.createRefund(tenantId, finance, { paymentId: applied.paymentId!, amount: 1, reason: "double" }),
      (e: { response?: { code?: string } }) => e.response?.code === "REFUND_EXCEEDS_BALANCE",
    );
  });

  it("cancellation follows the policy: refundable → returned without revenue, late → kept as revenue", async () => {
    const early = await kiorexBooking();
    const late = await kiorexBooking();
    const dEarly = await kiorex.depositPaid(clientId, early.ref, { amount: 80, paymentRef: `kpay-${stamp}-4` });
    const dLate = await kiorex.depositPaid(clientId, late.ref, { amount: 90, paymentRef: `kpay-${stamp}-5` });
    await prisma.appointment.update({ where: { id: early.apt.id }, data: { status: AppointmentStatus.CANCELLED, depositRefundable: true } });
    await prisma.appointment.update({ where: { id: late.apt.id }, data: { status: AppointmentStatus.CANCELLED, depositRefundable: false } });
    // the reconciler picks up cancellations made outside the front desk (a running dev server may get there first)
    await settlement.settleDue();
    const e = await prisma.patientDeposit.findUniqueOrThrow({ where: { id: dEarly.id } });
    const l = await prisma.patientDeposit.findUniqueOrThrow({ where: { id: dLate.id } });
    assert.equal(e.status, "RELEASED");
    assert.equal(l.status, "FORFEITED");
    assert.equal(await prisma.revenueEntry.count({ where: { tenantId, appointmentId: early.apt.id } }), 0);
    assert.equal(await prisma.cashMovement.count({ where: { tenantId, sourceType: "DEPOSIT_RELEASE", sourceId: dEarly.id } }), 1);
    const kept = await prisma.revenueEntry.findMany({ where: { tenantId, appointmentId: late.apt.id } });
    assert.equal(kept.length, 1);
    assert.equal(kept[0]!.category, "DEPOSIT_FORFEIT");
  });

  it("payout report reconciles deposits collected by Kiorex with payouts received", async () => {
    await kiorex.recordPayout({ payoutRef: `po-${stamp}`, clinicId, amount: 200, depositPaymentRefs: [`kpay-${stamp}-1`, `kpay-${stamp}-2`] });
    await kiorex.recordPayout({ payoutRef: `po-${stamp}`, clinicId, amount: 200 });
    const owner = { ...finance, isTenantOwner: true } as JwtUser;
    const report = await kiorex.payoutReport(tenantId, owner, { from: new Date(Date.now() - 86_400_000).toISOString() });
    // collected 100+150+120+80+90 = 540; refunded: released 80 + refund 120 = 200; due 340; paid 200
    assert.deepEqual(report.totals, { collected: 540, refunded: 200, netDue: 340, payoutsReceived: 200, outstanding: 140 });
    assert.equal(report.payouts.length, 1, "payout recording is idempotent");
    assert.equal(report.deposits.filter((d) => d.payoutRef === `po-${stamp}`).length, 2);
  });

  it("cash close does not count Kiorex Pay money as drawer cash", async () => {
    const close = await billing.closeCashierShift(tenantId, finance, {
      clinicId,
      shiftDate: new Date().toISOString().slice(0, 10),
      countedCash: 0,
      countedCard: 0,
    });
    assert.equal(Number(close.expectedCash), 0);
    assert.equal(Number(close.expectedCard), 0);
  });
});
