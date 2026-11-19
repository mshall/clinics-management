import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { AppointmentStatus, Prisma, PrismaClient, RevenueStatus, TransferVerificationStatus, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { postRevenue } from "../compliance/post-revenue";
import { resolveMarketForTenant } from "../markets/market-resolver";
import type { PrismaService } from "../prisma/prisma.service";
import { periodRange } from "./revenue-share-engine";
import { RevenueShareService } from "./revenue-share.service";

const prisma = new PrismaClient();
const svc = prisma as unknown as PrismaService;
const share = new RevenueShareService(svc);

describe("MN-02 doctor revenue-share engine & statements", () => {
  const stamp = Date.now();
  const period = "2026-03";
  let tenantId: string;
  let clinicId: string;
  let patientId: string;
  let typeId: string;
  let owner: JwtUser;
  let drA: JwtUser;
  let drB: JwtUser;
  let drC: JwtUser;
  let inPeriod: Date;
  let afterPeriod: Date;

  async function visit(doctor: JwtUser, opts: { typed?: boolean } = {}) {
    return prisma.appointment.create({
      data: {
        tenantId,
        clinicId,
        clinicianId: doctor.userId,
        patientId,
        startsAt: inPeriod,
        endsAt: new Date(inPeriod.getTime() + 30 * 60_000),
        feeAmount: new Prisma.Decimal("500"),
        status: AppointmentStatus.COMPLETED,
        appointmentTypeId: opts.typed ? typeId : null,
      },
    });
  }

  const revenue = (amount: number, appointmentId: string | null, extra: Partial<Parameters<typeof postRevenue>[1]> = {}) =>
    prisma.$transaction((tx) =>
      postRevenue(tx, {
        tenantId,
        clinicId,
        category: amount < 0 ? "REFUND" : "VISIT_FEE",
        grossAmount: amount,
        taxAmount: 0,
        netAmount: amount,
        currency: "EGP",
        patientId,
        appointmentId,
        postedAt: inPeriod,
        ...extra,
      }),
    );

  before(async () => {
    await prisma.$connect();
    const base = await prisma.clinic.findFirstOrThrow({ orderBy: { createdAt: "asc" }, include: { tenant: true } });
    tenantId = (
      await prisma.tenant.create({ data: { name: `MN02 ${stamp}`, deploymentCell: base.tenant.deploymentCell, marketId: base.tenant.marketId } })
    ).id;
    const market = await resolveMarketForTenant(svc, tenantId);
    const range = periodRange(period, market.timezone);
    inPeriod = new Date(range.start.getTime() + 5 * 86_400_000);
    afterPeriod = new Date(range.end.getTime() + 3_600_000);
    clinicId = (
      await prisma.clinic.create({
        data: {
          tenantId,
          nameEn: `MN02 Branch ${stamp}`,
          nameAr: "فرع",
          country: base.country,
          city: base.city,
          addressEn: "Street",
          addressAr: "شارع",
          locationUrl: "https://maps.example/mn02",
          timezone: base.timezone,
          phone: base.phone,
          email: `mn02.${stamp}@example.com`,
          licenseNumber: `MN02-${stamp}`,
          defaultCurrency: base.defaultCurrency,
        },
      })
    ).id;
    const mk = async (role: UserRole, tag: string) => {
      const u = await prisma.user.create({
        data: { tenantId, email: `mn02.${tag}.${stamp}@example.com`, passwordHash: "x", displayName: `Dr ${tag}`, role },
      });
      return { userId: u.id, tenantId, email: u.email, role, additionalRoles: [] } as unknown as JwtUser;
    };
    owner = await mk(UserRole.GROUP_ADMIN, "owner");
    drA = await mk(UserRole.PHYSICIAN, "A");
    drB = await mk(UserRole.PHYSICIAN, "B");
    drC = await mk(UserRole.PHYSICIAN, "C");
    patientId = (
      await prisma.patient.create({ data: { tenantId, mrn: `MN02-${stamp}`, firstNameEn: "Rev", lastNameEn: "Share", gender: "UNKNOWN", phone: "+201055502001" } })
    ).id;
    typeId = (await prisma.appointmentType.create({ data: { tenantId, clinicId, nameEn: "Procedure" } })).id;

    // Rules: A 40 % (50 % on procedures), B room rental 2000, C 150 per visit.
    await share.createRule(tenantId, owner, { clinicianId: drA.userId, ruleType: "PERCENT", percent: 40 });
    await share.createRule(tenantId, owner, { clinicianId: drA.userId, appointmentTypeId: typeId, ruleType: "PERCENT", percent: 50 });
    await share.createRule(tenantId, owner, { clinicianId: drB.userId, ruleType: "ROOM_RENTAL", fixedAmount: 2000 });
    await share.createRule(tenantId, owner, { clinicianId: drC.userId, ruleType: "FIXED_PER_VISIT", fixedAmount: 150 });

    const a1 = await visit(drA);
    const a2 = await visit(drA, { typed: true });
    await revenue(500, a1.id);
    await revenue(-100, a1.id);
    await revenue(1000, a2.id);
    await revenue(300, a1.id, { status: RevenueStatus.RECEIVABLE });
    await revenue(250, a1.id, { transferVerificationStatus: TransferVerificationStatus.REJECTED });
    await revenue(999, a1.id, { postedAt: afterPeriod });
    const b1 = await visit(drB);
    await revenue(3000, b1.id);
    const c1 = await visit(drC);
    const c2 = await visit(drC);
    await revenue(400, c1.id);
    await revenue(400, c2.id);
    await revenue(-400, c2.id);
    await revenue(77, null);
  });

  after(async () => {
    await prisma.doctorStatement.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  const find = async (user: JwtUser, doctor: JwtUser) =>
    (await share.statements(tenantId, user, period)).statements.find((s) => s.clinicianId === doctor.userId)!;

  it("percent rules use collected (not billed) revenue and the most specific rule wins", async () => {
    const a = await find(owner, drA);
    assert.equal(a.totals.collectedNet, 1400, "500 − 100 refund + 1000; receivable, rejected and next-month rows excluded");
    assert.equal(a.totals.doctorShare, 660, "40 % of 400 + 50 % of 1000 (procedure rule)");
    assert.equal(a.totals.clinicShare, 740);
    assert.equal(a.totals.visits, 2);
    assert.equal(a.status, "DRAFT");
  });

  it("room rental: doctor keeps collections and pays the rental; fixed per visit only for visits that stayed paid", async () => {
    const b = await find(owner, drB);
    assert.equal(b.totals.collectedNet, 3000);
    assert.equal(b.totals.roomRental, 2000);
    assert.equal(b.totals.doctorShare, 1000);
    assert.equal(b.totals.clinicShare, 2000);
    const c = await find(owner, drC);
    assert.equal(c.totals.collectedNet, 400);
    assert.equal(c.totals.visits, 1, "the fully refunded visit does not count");
    assert.equal(c.totals.doctorShare, 150);
  });

  it("totals reconcile with revenue entries for the period", async () => {
    const all = await share.statements(tenantId, owner, period);
    const rec = await share.reconciliation(tenantId, owner, period);
    const market = await resolveMarketForTenant(svc, tenantId);
    const range = periodRange(period, market.timezone);
    const agg = await prisma.revenueEntry.aggregate({
      where: {
        tenantId,
        status: RevenueStatus.POSTED,
        postedAt: { gte: range.start, lt: range.end },
        NOT: { transferVerificationStatus: TransferVerificationStatus.REJECTED },
      },
      _sum: { netAmount: true },
    });
    const statementsNet = all.statements.reduce((s, x) => s + x.totals.collectedNet, 0);
    assert.equal(rec.revenueNet, Number(agg._sum.netAmount));
    assert.equal(Math.round((statementsNet + rec.unattributedNet) * 100) / 100, rec.revenueNet);
    assert.equal(rec.unattributedNet, 77);
    assert.equal(rec.balanced, true);
    for (const s of all.statements) {
      assert.equal(Math.round((s.totals.doctorShare + s.totals.clinicShare) * 100) / 100, s.totals.collectedNet);
    }
  });

  it("a doctor sees only their own statement and cannot approve", async () => {
    const mine = await share.statements(tenantId, drA, period);
    assert.deepEqual(mine.statements.map((s) => s.clinicianId), [drA.userId]);
    assert.equal(mine.canManage, false);
    await assert.rejects(share.approve(tenantId, drA, mine.statements[0]!.id), /Only owners/);
    await assert.rejects(share.reconciliation(tenantId, drA, period), /Only owners/);
  });

  it("adjust → approve locks totals → mark paid records the payout; order is enforced", async () => {
    const a = await find(owner, drA);
    await assert.rejects(share.markPaid(tenantId, owner, a.id, {}), (e: { response?: { code?: string } }) => e.response?.code === "STATEMENT_NOT_APPROVED");
    await share.addAdjustment(tenantId, owner, a.id, { amount: -60, note: "Consumables" });
    const approved = await share.approve(tenantId, owner, a.id);
    assert.equal(approved.status, "APPROVED");
    assert.equal(approved.totals.netPayable, 600);
    assert.equal(approved.approvedBy, owner.userId);

    const late = await visit(drA);
    await revenue(1000, late.id);
    const locked = await find(owner, drA);
    assert.equal(locked.totals.collectedNet, 1400, "approved statements do not move");
    await assert.rejects(share.addAdjustment(tenantId, owner, a.id, { amount: 10, note: "x" }), (e: { response?: { code?: string } }) => e.response?.code === "STATEMENT_LOCKED");

    const paid = await share.markPaid(tenantId, owner, a.id, { method: "TRANSFER", reference: "BANK-1" });
    assert.equal(paid.status, "PAID");
    assert.equal(paid.totals.payouts, 600);
    assert.equal(paid.totals.netPayable, 0);
    assert.equal(paid.payouts.length, 1);
    const audits = await prisma.auditLog.findMany({ where: { tenantId, resourceId: a.id }, select: { action: true } });
    assert.deepEqual(new Set(audits.map((x) => x.action)), new Set(["DOCTOR_STATEMENT_ADJUSTED", "DOCTOR_STATEMENT_APPROVED", "DOCTOR_STATEMENT_PAID"]));
  });

  it("bilingual PDF", async () => {
    const b = await find(owner, drB);
    const { pdf, filename } = await share.pdf(tenantId, owner, b.id);
    assert.ok(pdf.subarray(0, 5).toString() === "%PDF-");
    assert.equal(filename, `doctor-statement-${period}.pdf`);
    await assert.rejects(share.pdf(tenantId, drA, b.id), /not found/);
  });
});
