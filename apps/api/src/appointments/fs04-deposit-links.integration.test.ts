import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { AppointmentStatus, PaymentMethod, Prisma, PrismaClient, RevenueStatus, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { DepositSettlementService } from "../billing/deposit-settlement.service";
import { KiorexDepositsService } from "../billing/kiorex-deposits.service";
import { PatientMoneyService } from "../billing/patient-money.service";
import { AppointmentOutboxService } from "../messaging/appointment-outbox.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import type { PrismaService } from "../prisma/prisma.service";
import { AppointmentsService } from "./appointments.service";
import { DEPOSIT_LINK_TEMPLATE_KEY, DepositLinkService } from "./deposit-link.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
const svc = prisma as unknown as PrismaService;
const money = new PatientMoneyService(svc);
const settlement = new DepositSettlementService(svc, money);
const kiorex = new KiorexDepositsService(svc, money, settlement);
const sent: { templateKey?: string; variables?: Record<string, string>; toPhone: string }[] = [];
const messaging = {
  queueMessage: async (_tenantId: string, body: { templateKey?: string; variables?: Record<string, string>; toPhone: string }) => {
    sent.push(body);
    return { id: `msg-${sent.length}` };
  },
};
const appointments = new AppointmentsService(
  svc,
  { recordFreedSlot: async () => null } as never,
  {} as never,
  { isEnabled: async () => false } as never,
  {} as never,
  {} as never,
  { onCancelOrNoShow: async () => null, applyCreditIntents: async () => undefined } as never,
  { invalidateAndNotify: async () => undefined } as never,
  new AppointmentOutboxService(new OutboxEventService(svc)),
  { isEntitled: async () => true } as never,
  settlement,
);
const links = new DepositLinkService(svc, money, messaging as never, { isEnabled: async () => true } as never, appointments);

describe("FS-04 deposits & payment links for high-risk bookings", () => {
  const stamp = Date.now();
  let tenantId: string;
  let clinicId: string;
  let flaggedPatientId: string;
  let plainPatientId: string;
  let doctorId: string;
  let typeId: string;
  let desk: JwtUser;
  let finance: JwtUser;
  let n = 0;

  async function booking(patientId: string, opts: { fee?: number; typed?: boolean; hoursAhead?: number } = {}) {
    n += 1;
    const startsAt = new Date(Date.now() + (opts.hoursAhead ?? 72 + n) * 3_600_000);
    return prisma.appointment.create({
      data: {
        tenantId,
        clinicId,
        clinicianId: doctorId,
        patientId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        feeAmount: new Prisma.Decimal(String(opts.fee ?? 500)),
        status: AppointmentStatus.CONFIRMED,
        appointmentTypeId: opts.typed ? typeId : null,
      },
    });
  }

  const settle = (appointmentId: string) =>
    prisma.$transaction((tx) => settlement.settleAppointmentDepositsTx(tx, tenantId, appointmentId, finance.userId));
  const tokenOf = (url: string) => decodeURIComponent(url.split("/").pop()!);

  before(async () => {
    await prisma.$connect();
    const base = await prisma.clinic.findFirstOrThrow({ orderBy: { createdAt: "asc" }, include: { tenant: true } });
    tenantId = (
      await prisma.tenant.create({ data: { name: `FS04 ${stamp}`, deploymentCell: base.tenant.deploymentCell, marketId: base.tenant.marketId } })
    ).id;
    clinicId = (
      await prisma.clinic.create({
        data: {
          tenantId,
          nameEn: `FS04 Branch ${stamp}`,
          nameAr: "فرع",
          country: base.country,
          city: base.city,
          addressEn: "Street",
          addressAr: "شارع",
          locationUrl: "https://maps.example/fs04",
          timezone: base.timezone,
          phone: base.phone,
          email: `fs04.${stamp}@example.com`,
          licenseNumber: `FS04-${stamp}`,
          defaultCurrency: base.defaultCurrency,
        },
      })
    ).id;
    const mk = async (role: UserRole, tag: string) => {
      const u = await prisma.user.create({
        data: { tenantId, email: `fs04.${tag}.${stamp}@example.com`, passwordHash: "x", displayName: tag, role },
      });
      return { userId: u.id, tenantId, email: u.email, role, additionalRoles: [] } as unknown as JwtUser;
    };
    desk = await mk(UserRole.RECEPTIONIST, "desk");
    finance = await mk(UserRole.FINANCE_OFFICER, "fin");
    doctorId = (await mk(UserRole.PHYSICIAN, "dr")).userId;
    flaggedPatientId = (
      await prisma.patient.create({
        data: {
          tenantId,
          mrn: `FS04-F-${stamp}`,
          firstNameEn: "Flag",
          lastNameEn: "Patient",
          gender: "UNKNOWN",
          phone: "+201055504001",
          requiresAppointmentDeposit: true,
        },
      })
    ).id;
    plainPatientId = (
      await prisma.patient.create({
        data: { tenantId, mrn: `FS04-P-${stamp}`, firstNameEn: "Plain", lastNameEn: "Patient", gender: "UNKNOWN", phone: "+201055504002" },
      })
    ).id;
    typeId = (
      await prisma.appointmentType.create({
        data: { tenantId, clinicId, nameEn: "Procedure", depositAmount: new Prisma.Decimal("200"), feeAmount: new Prisma.Decimal("500") },
      })
    ).id;
  });

  after(async () => {
    delete process.env.KIOREX_PAY_LINK_BASE_URL;
    for (const m of ["billingRefund", "cashMovement", "patientDeposit", "creditNote"] as const) {
      await (prisma[m] as unknown as { deleteMany: (a: unknown) => Promise<unknown> }).deleteMany({ where: { tenantId } }).catch(() => undefined);
    }
    await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("rules: patient flag, no-shows, risk score and appointment type decide the requirement and amount", async () => {
    const typed = await booking(flaggedPatientId, { typed: true });
    const r1 = await links.requirement(tenantId, typed.id);
    assert.equal(r1.required, true);
    assert.deepEqual(r1.reasons, ["PATIENT_FLAG", "APPOINTMENT_TYPE"]);
    assert.equal(r1.amount, 200, "the appointment type's deposit wins");

    const plain = await booking(plainPatientId, { fee: 400 });
    const r2 = await links.requirement(tenantId, plain.id);
    assert.equal(r2.required, false);

    await prisma.patient.update({ where: { id: plainPatientId }, data: { noShowCount: 2 } });
    await prisma.appointment.update({ where: { id: plain.id }, data: { noShowRiskScore: new Prisma.Decimal("75") } });
    const r3 = await links.requirement(tenantId, plain.id);
    assert.deepEqual(r3.reasons, ["NO_SHOWS", "RISK_SCORE"]);
    assert.equal(r3.amount, 120, "default 30% of the fee");

    await links.updatePolicy(tenantId, finance, clinicId, { policy: { noShowThreshold: 5, riskScoreThreshold: 90, defaultPercentOfFee: 50 } });
    const r4 = await links.requirement(tenantId, plain.id);
    assert.equal(r4.required, false, "clinic override raises the thresholds");
    await assert.rejects(links.updatePolicy(tenantId, desk, clinicId, { policy: null }), /Only owners/);
    await links.updatePolicy(tenantId, finance, clinicId, { policy: null });
    await prisma.patient.update({ where: { id: plainPatientId }, data: { noShowCount: 0 } });
  });

  it("a payment link is a pending deposit (no money, no revenue) sent on WhatsApp; a new link replaces the old one", async () => {
    const apt = await booking(flaggedPatientId, { typed: true });
    const before = sent.length;
    const link = await links.createLink(tenantId, desk, apt.id, {});
    assert.equal(link.status, "PENDING");
    assert.equal(link.amount, 200);
    assert.equal(link.sent, true);
    assert.ok(link.url.includes("/pay/"));
    assert.equal(sent.length, before + 1);
    assert.equal(sent.at(-1)!.templateKey, DEPOSIT_LINK_TEMPLATE_KEY);
    assert.equal(sent.at(-1)!.variables!.link, link.url);
    assert.equal(await prisma.cashMovement.count({ where: { tenantId, sourceId: link.depositId } }), 0);
    assert.equal(await prisma.revenueEntry.count({ where: { tenantId, appointmentId: apt.id } }), 0);

    const page = await links.publicSummary(tokenOf(link.url));
    assert.equal(page.amount, 200);
    assert.equal(page.status, "PENDING");
    assert.ok(!JSON.stringify(page).includes("Flag"), "the public page never shows the patient name");

    const again = await links.createLink(tenantId, desk, apt.id, { amount: 150, send: false });
    assert.equal((await prisma.patientDeposit.findUniqueOrThrow({ where: { id: link.depositId } })).status, "CANCELLED");
    await assert.rejects(links.publicSummary(tokenOf(link.url)), /not found/);
    assert.equal(again.amount, 150);
    await assert.rejects(
      links.createLink(tenantId, desk, apt.id, { amount: 9999 }),
      (e: { response?: { code?: string } }) => e.response?.code === "DEPOSIT_EXCEEDS_FEE",
    );
  });

  it("paid link → held; at check-in it is applied via postRevenue; a refund reverses the revenue", async () => {
    const apt = await booking(flaggedPatientId, { typed: true });
    const link = await links.createLink(tenantId, desk, apt.id, { send: false });
    const held = await settlement.markLinkPaid(tenantId, desk.userId, link.depositId, { method: PaymentMethod.TRANSFER, externalRef: `IPN${stamp}` });
    assert.equal(held.status, "HELD");
    assert.equal(await prisma.cashMovement.count({ where: { tenantId, sourceId: link.depositId, direction: "IN" } }), 1);
    await assert.rejects(
      settlement.markLinkPaid(tenantId, desk.userId, link.depositId, { method: PaymentMethod.TRANSFER, externalRef: "OTHER" }),
      (e: { response?: { code?: string } }) => e.response?.code === "DEPOSIT_NOT_PENDING",
    );

    // regression: re-using a payment reference on another deposit is a 409, not a 500 from the unique index
    const apt2 = await booking(flaggedPatientId, { typed: true });
    const link2 = await links.createLink(tenantId, desk, apt2.id, { send: false });
    await assert.rejects(
      settlement.markLinkPaid(tenantId, desk.userId, link2.depositId, { method: PaymentMethod.TRANSFER, externalRef: `IPN${stamp}` }),
      (e: { status?: number; response?: { code?: string } }) => e.status === 409 && e.response?.code === "DEPOSIT_REFERENCE_DUPLICATE",
    );
    assert.equal((await prisma.patientDeposit.findUniqueOrThrow({ where: { id: link2.depositId } })).status, "PENDING");

    await prisma.appointment.update({ where: { id: apt.id }, data: { status: AppointmentStatus.CHECKED_IN, checkedInAt: new Date() } });
    await settle(apt.id);
    const applied = await prisma.patientDeposit.findUniqueOrThrow({ where: { id: link.depositId } });
    assert.equal(applied.status, "APPLIED");
    const revs = await prisma.revenueEntry.findMany({ where: { tenantId, appointmentId: apt.id, status: RevenueStatus.POSTED } });
    assert.equal(revs.length, 1);
    assert.equal(Number(revs[0]!.grossAmount), 200);

    await money.createRefund(tenantId, finance, { paymentId: applied.paymentId!, amount: 200, reason: "Visit cancelled by doctor" });
    const after = await prisma.revenueEntry.findMany({ where: { tenantId, appointmentId: apt.id, status: RevenueStatus.POSTED } });
    assert.equal(after.length, 2);
    assert.equal(after.reduce((s, r) => s + Number(r.grossAmount), 0), 0, "refund nets the deposit revenue to zero");
  });

  it("policy: a late patient cancellation forfeits (revenue); an early one refunds (no revenue)", async () => {
    const late = await booking(flaggedPatientId);
    const early = await booking(flaggedPatientId);
    for (const apt of [late, early]) {
      const link = await links.createLink(tenantId, desk, apt.id, { amount: 100, send: false });
      await settlement.markLinkPaid(tenantId, desk.userId, link.depositId, { method: PaymentMethod.CASH, externalRef: null });
    }
    await prisma.appointment.update({
      where: { id: late.id },
      data: { status: AppointmentStatus.CANCELLED, cancelledBy: "PATIENT", cancelledAt: new Date(), depositRefundable: false },
    });
    await prisma.appointment.update({
      where: { id: early.id },
      data: { status: AppointmentStatus.CANCELLED, cancelledBy: "PATIENT", cancelledAt: new Date(), depositRefundable: true },
    });
    await settle(late.id);
    await settle(early.id);
    const lateDep = await prisma.patientDeposit.findFirstOrThrow({ where: { tenantId, appointmentId: late.id, status: { not: "CANCELLED" } } });
    const earlyDep = await prisma.patientDeposit.findFirstOrThrow({ where: { tenantId, appointmentId: early.id, status: { not: "CANCELLED" } } });
    assert.equal(lateDep.status, "FORFEITED");
    assert.equal(earlyDep.status, "RELEASED");
    const lateRev = await prisma.revenueEntry.findMany({ where: { tenantId, appointmentId: late.id } });
    assert.deepEqual(lateRev.map((r) => [r.category, Number(r.grossAmount)]), [["DEPOSIT_FORFEIT", 100]]);
    assert.equal(await prisma.revenueEntry.count({ where: { tenantId, appointmentId: early.id } }), 0);
    assert.equal(
      await prisma.cashMovement.count({ where: { tenantId, sourceId: earlyDep.id, direction: "OUT", sourceType: "DEPOSIT_RELEASE" } }),
      1,
      "the refund pays the cash back",
    );
  });

  it("unpaid links expire; the booking is auto-cancelled only when the clinic policy says so", async () => {
    const keep = await booking(flaggedPatientId);
    const keepLink = await links.createLink(tenantId, desk, keep.id, { amount: 80, send: false });
    await prisma.patientDeposit.update({ where: { id: keepLink.depositId }, data: { linkExpiresAt: new Date(Date.now() - 60_000) } });
    await links.expireDue();
    assert.equal((await prisma.patientDeposit.findUniqueOrThrow({ where: { id: keepLink.depositId } })).status, "EXPIRED");
    assert.equal((await prisma.appointment.findUniqueOrThrow({ where: { id: keep.id } })).status, AppointmentStatus.CONFIRMED);

    await links.updatePolicy(tenantId, finance, clinicId, { policy: { autoCancelUnpaid: true } });
    const drop = await booking(flaggedPatientId);
    const dropLink = await links.createLink(tenantId, desk, drop.id, { amount: 80, send: false });
    await prisma.patientDeposit.update({ where: { id: dropLink.depositId }, data: { linkExpiresAt: new Date(Date.now() - 60_000) } });
    await links.expireDue();
    const cancelled = await prisma.appointment.findUniqueOrThrow({ where: { id: drop.id } });
    assert.equal(cancelled.status, AppointmentStatus.CANCELLED);
    assert.equal(cancelled.cancelledBy, "SYSTEM");
    assert.equal(await prisma.revenueEntry.count({ where: { tenantId, appointmentId: drop.id } }), 0);
    await links.updatePolicy(tenantId, finance, clinicId, { policy: null });
  });

  it("an unpaid link is voided when the patient turns up anyway", async () => {
    const apt = await booking(flaggedPatientId);
    const link = await links.createLink(tenantId, desk, apt.id, { amount: 90, send: false });
    await prisma.appointment.update({ where: { id: apt.id }, data: { status: AppointmentStatus.CHECKED_IN, checkedInAt: new Date() } });
    await settle(apt.id);
    assert.equal((await prisma.patientDeposit.findUniqueOrThrow({ where: { id: link.depositId } })).status, "CANCELLED");
  });

  it("Kiorex Pay links: Kiorex confirms payment once; amount must match", async () => {
    const apt = await booking(flaggedPatientId);
    await assert.rejects(
      links.createLink(tenantId, desk, apt.id, { amount: 100, provider: "KIOREX_PAY", send: false }),
      (e: { response?: { code?: string } }) => e.response?.code === "KIOREX_PAY_NOT_CONFIGURED",
    );
    process.env.KIOREX_PAY_LINK_BASE_URL = "https://pay.kiorex.example";
    const link = await links.createLink(tenantId, desk, apt.id, { amount: 100, provider: "KIOREX_PAY", send: false });
    assert.ok(link.url.startsWith("https://pay.kiorex.example/deposit/"));
    const token = tokenOf(link.url);
    await assert.rejects(
      kiorex.depositLinkPaid(token, { amount: 99, paymentRef: `kp-${stamp}` }),
      (e: { response?: { code?: string } }) => e.response?.code === "DEPOSIT_AMOUNT_MISMATCH",
    );
    const paid = await kiorex.depositLinkPaid(token, { amount: 100, paymentRef: `kp-${stamp}` });
    const replay = await kiorex.depositLinkPaid(token, { amount: 100, paymentRef: `kp-${stamp}` });
    assert.equal(paid.id, replay.id);
    assert.equal(paid.status, "HELD");
    assert.equal(paid.method, PaymentMethod.KIOREX_PAY);
    assert.ok(!("linkTokenHash" in paid));
  });
});
