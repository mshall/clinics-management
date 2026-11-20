import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Prisma, PrismaClient, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import type { PrismaService } from "../prisma/prisma.service";
import { SHIFT_CLOSED_TOPIC } from "./cashier-shift";
import { CashierShiftService } from "./cashier-shift.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
const svc = prisma as unknown as PrismaService;
const shifts = new CashierShiftService(svc);

const code = (c: string) => (e: { response?: { code?: string } }) => e.response?.code === c;

describe("MN-03 cash drawer shifts", () => {
  const stamp = Date.now();
  let tenantId: string;
  let clinicId: string;
  let patientId: string;
  let owner: JwtUser;
  let desk: JwtUser;

  before(async () => {
    await prisma.$connect();
    const base = await prisma.clinic.findFirstOrThrow({ orderBy: { createdAt: "asc" }, include: { tenant: true } });
    tenantId = (
      await prisma.tenant.create({ data: { name: `MN03 ${stamp}`, deploymentCell: base.tenant.deploymentCell, marketId: base.tenant.marketId } })
    ).id;
    clinicId = (
      await prisma.clinic.create({
        data: {
          tenantId,
          nameEn: `MN03 Branch ${stamp}`,
          nameAr: "فرع",
          country: base.country,
          city: base.city,
          addressEn: "Street",
          addressAr: "شارع",
          locationUrl: "https://maps.example/mn03",
          timezone: base.timezone,
          phone: base.phone,
          email: `mn03.${stamp}@example.com`,
          licenseNumber: `MN03-${stamp}`,
          defaultCurrency: base.defaultCurrency,
        },
      })
    ).id;
    const o = await prisma.user.create({
      data: { tenantId, email: `mn03.owner.${stamp}@example.com`, passwordHash: "x", displayName: "Owner", role: UserRole.GROUP_ADMIN, isTenantOwner: true },
    });
    await prisma.employee.create({
      data: {
        tenantId,
        clinicId,
        userId: o.id,
        firstNameEn: "Owner",
        lastNameEn: "MN03",
        email: o.email,
        phone: "+201055503001",
        employeeNumber: `MN03-O-${stamp}`,
        jobTitle: "Owner",
        employmentType: "FULL_TIME",
        hireDate: new Date(),
        salaryBase: new Prisma.Decimal("0"),
      },
    });
    owner = { userId: o.id, tenantId, email: o.email, role: UserRole.GROUP_ADMIN, additionalRoles: [], isTenantOwner: true } as unknown as JwtUser;
    const d = await prisma.user.create({
      data: { tenantId, email: `mn03.desk.${stamp}@example.com`, passwordHash: "x", displayName: "Desk", role: UserRole.RECEPTIONIST },
    });
    desk = { userId: d.id, tenantId, email: d.email, role: UserRole.RECEPTIONIST, additionalRoles: [] } as unknown as JwtUser;
    patientId = (
      await prisma.patient.create({ data: { tenantId, mrn: `MN03-${stamp}`, firstNameEn: "Cash", lastNameEn: "Drawer", gender: "UNKNOWN", phone: "+201055503002" } })
    ).id;
  });

  after(async () => {
    await prisma.outboxEvent.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  const pay = (allocations: { method: "CASH" | "CARD"; amount: number }[]) =>
    prisma.billingPayment.create({
      data: {
        tenantId,
        clinicId,
        patientId,
        currency: "EGP",
        totalAmount: new Prisma.Decimal(String(allocations.reduce((s, a) => s + a.amount, 0))),
        allocations: { create: allocations.map((a) => ({ method: a.method, amount: new Prisma.Decimal(String(a.amount)) })) },
      },
    });

  it("open with a float; one open shift per clinic; current() is blind", async () => {
    const s = await shifts.open(tenantId, desk, { clinicId, openingFloat: 500 });
    assert.equal(s.zNumber, 1);
    assert.equal(s.openingFloat, 500);
    await assert.rejects(shifts.open(tenantId, owner, { clinicId, openingFloat: 0 }), code("SHIFT_ALREADY_OPEN"));
    const cur = await shifts.current(tenantId, desk, clinicId);
    assert.equal(cur.open?.id, s.id);
    assert.equal("expectedCash" in (cur.open as object), false, "blind count: no expected amount before close");
  });

  it("matching count closes clean, without a note", async () => {
    const { open } = await shifts.current(tenantId, desk, clinicId);
    await pay([
      { method: "CASH", amount: 300 },
      { method: "CARD", amount: 200 },
    ]);
    await prisma.cashMovement.create({
      data: { tenantId, clinicId, patientId, direction: "OUT", method: "CASH", amount: new Prisma.Decimal("50"), currency: "EGP", sourceType: "REFUND", sourceId: "r1" },
    });
    const closed = await shifts.close(tenantId, desk, open!.id, { countedCash: 750, countedCard: 200 });
    assert.equal(closed.expectedCash, 750);
    assert.equal(closed.cashVariance, 0);
    assert.equal(closed.needsReview, false);
    assert.equal(closed.summary?.paymentCount, 1);
    await assert.rejects(shifts.close(tenantId, desk, open!.id, { countedCash: 750 }), code("SHIFT_NOT_OPEN"));
  });

  it("any variance requires a note; a small one does not flag review", async () => {
    const s = await shifts.open(tenantId, desk, { clinicId, openingFloat: 100 });
    assert.equal(s.zNumber, 2);
    await assert.rejects(shifts.close(tenantId, desk, s.id, { countedCash: 90 }), code("VARIANCE_NOTE_REQUIRED"));
    const closed = await shifts.close(tenantId, desk, s.id, { countedCash: 90, note: "Change given twice" });
    assert.equal(closed.cashVariance, -10);
    assert.equal(closed.needsReview, false);
    assert.equal(closed.varianceNote, "Change given twice");
  });

  it("variance over the market threshold flags the shift for review; owner (not the cashier) reviews it", async () => {
    const s = await shifts.open(tenantId, desk, { clinicId, openingFloat: 100 });
    const closed = await shifts.close(tenantId, desk, s.id, { countedCash: 0, note: "Float missing" });
    assert.equal(closed.cashVariance, -100);
    assert.equal(closed.needsReview, true);
    assert.ok((closed.reviewThreshold ?? 0) < 100);
    const flagged = await shifts.list(tenantId, owner, { clinicId, needsReview: true });
    assert.deepEqual(flagged.map((x) => x.id), [s.id]);
    await assert.rejects(shifts.review(tenantId, desk, s.id, { note: "ok" }), /Only owners/);
    await assert.rejects(shifts.review(tenantId, owner, s.id, {}), code("REVIEW_NOTE_REQUIRED"));
    const reviewed = await shifts.review(tenantId, owner, s.id, { note: "Found in the safe" });
    assert.equal(reviewed.reviewedBy, owner.userId);
    await assert.rejects(shifts.review(tenantId, owner, s.id, { note: "again" }), code("SHIFT_ALREADY_REVIEWED"));
    assert.equal((await shifts.list(tenantId, owner, { clinicId, needsReview: true })).length, 0);
    const actions = (await prisma.auditLog.findMany({ where: { tenantId, resource: "CashierShift", resourceId: s.id }, select: { action: true } })).map((a) => a.action);
    assert.deepEqual(new Set(actions), new Set(["CASHIER_SHIFT_OPENED", "CASHIER_SHIFT_CLOSED", "CASHIER_SHIFT_REVIEWED"]));
  });

  it("each close emits an INTERNAL outbox event for the owner summary", async () => {
    const events = await prisma.outboxEvent.findMany({ where: { tenantId, type: SHIFT_CLOSED_TOPIC }, orderBy: { createdAt: "asc" } });
    assert.equal(events.length, 3);
    assert.ok(events.every((e) => e.target === "INTERNAL" && e.aggregateType === "CashierShift"));
    assert.deepEqual(
      events.map((e) => (e.payload as { needsReview: boolean }).needsReview),
      [false, false, true],
    );
  });

  it("Z-report prints on A4 and on an 80 mm thermal roll", async () => {
    const [last] = await shifts.list(tenantId, desk, { clinicId, limit: 1 });
    const a4 = await shifts.zReport(tenantId, desk, last!.id, "a4");
    const thermal = await shifts.zReport(tenantId, desk, last!.id, "thermal");
    assert.equal(a4.pdf.subarray(0, 5).toString(), "%PDF-");
    assert.match(a4.pdf.toString("latin1"), /MediaBox \[0 0 595\.28 841\.89\]/);
    assert.match(thermal.pdf.toString("latin1"), /MediaBox \[0 0 226\.77 \d+\]/);
    assert.equal(thermal.filename, `z-report-${last!.zNumber}-thermal.pdf`);
    const open = await shifts.open(tenantId, desk, { clinicId, openingFloat: 0 });
    await assert.rejects(shifts.zReport(tenantId, desk, open.id, "a4"), code("SHIFT_NOT_CLOSED"));
  });
});
