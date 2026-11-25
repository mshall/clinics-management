import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { AppointmentStatus, BookingSource, CommissionChargeStatus, Gender } from "@prisma/client";
import { createPrismaClient } from "../prisma/create-prisma-client";
import type { PrismaService } from "../prisma/prisma.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { CreditWalletService } from "../credits/credit-wallet.service";
import { KiorexCommissionService } from "./kiorex-commission.service";
import { CommissionChargeService } from "./commission-charge.service";

const prisma = createPrismaClient();
const svcPrisma = prisma as unknown as PrismaService;
const sfx = `com2c-${Date.now()}`;

/** COM-2 on the Clinic engine: the rate Kiorex reports for the organisation prices the charge (default per type, or the organisation's own rate, effective-dated); with none, nothing is charged. Every rate is a TEST placeholder. */
describe("COM-2 Kiorex organisation rate prices the Clinic commission charge", () => {
  let marketId = ""; let charges: CommissionChargeService;
  const tenants: string[] = [];
  const spec = (o: object = {}) => ({ feeType: "PERCENT", percentBps: 1000, flatMinor: null, minMinor: null, maxMinor: null, mode: null, ...o });
  const row = (version: number, scope: "DEFAULT" | "ORG", from: string, s: object | null, extra: object = {}) => ({ version, scope, kind: s ? "RATE" : "INHERIT", effectiveFrom: from, reason: scope === "ORG" ? "negotiated" : null, spec: s, ...extra });

  async function org(tag: string, history: object[] | null) {
    const tenant = await prisma.tenant.create({ data: { name: `COM2C ${tag} ${sfx}`, deploymentCell: "frankfurt", marketId, baseCurrency: "EGP" } });
    tenants.push(tenant.id);
    const clinic = await prisma.clinic.create({ data: { tenantId: tenant.id, nameEn: "C", nameAr: "ع", country: "EG", city: "Cairo", addressEn: "S", addressAr: "ش", locationUrl: "https://m.example/c", phone: "+201000000098", email: `c-${tag}-${sfx}@t.com`, licenseNumber: "SELF-SERVE-PENDING", defaultCurrency: "EGP" } });
    const doc = await prisma.user.create({ data: { tenantId: tenant.id, email: `doc-${tag}-${sfx}@t.com`, passwordHash: "x", displayName: "Doc", role: "PHYSICIAN" } });
    const patient = await prisma.patient.create({ data: { tenantId: tenant.id, mrn: `M-${tag}-${sfx}`, firstNameEn: "Sam", lastNameEn: "New", gender: Gender.UNKNOWN, phone: `+2011${String(Math.random()).slice(2, 10)}`, nationalId: `n-${tag}-${sfx}` } });
    const apt = await prisma.appointment.create({ data: { tenantId: tenant.id, clinicId: clinic.id, patientId: patient.id, clinicianId: doc.id, startsAt: new Date(), feeAmount: 300, bookingSource: BookingSource.KIOREX_MARKETPLACE, isNewPatientAtBooking: true, status: AppointmentStatus.CONFIRMED } });
    if (history) await prisma.kiorexCommissionRateView.create({ data: { tenantId: tenant.id, product: "CLINIC", version: BigInt(Date.now()), view: { history, mode: null } as never } });
    return { tenantId: tenant.id, appointmentId: apt.id };
  }
  const checkIn = async (t: { tenantId: string; appointmentId: string }, at: Date) => prisma.$transaction(async (tx) => { await tx.appointment.update({ where: { id: t.appointmentId }, data: { status: AppointmentStatus.CHECKED_IN, checkedInAt: at } }); await charges.onCheckIn(tx, t.tenantId, t.appointmentId, at); });

  before(async () => {
    await prisma.$connect();
    charges = new CommissionChargeService(svcPrisma, new KiorexCommissionService(svcPrisma), new OutboxEventService(svcPrisma), new CreditWalletService(svcPrisma));
    marketId = (await prisma.market.create({ data: { code: `K${Date.now().toString(36)}`.toUpperCase().slice(0, 8), nameEn: `COM2C ${sfx}`, hostCell: "frankfurt", defaultCurrency: "EGP", defaultLocale: "en", defaultTimezone: "Africa/Cairo", weekendDays: [5, 6], enabledLanguages: ["en", "ar"], defaultPhoneRegion: "EG" } })).id;
  });
  after(async () => {
    for (const id of tenants) await prisma.tenant.delete({ where: { id } }).catch(() => undefined);
    await prisma.market.delete({ where: { id: marketId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("no Kiorex rate and no market row: NO charge, decision NO_RATE_CONFIGURED (nothing is invented)", async () => {
    const t = await org("none", null);
    await checkIn(t, new Date("2026-06-01T10:00:00Z"));
    assert.equal(await prisma.kiorexCommissionCharge.count({ where: { appointmentId: t.appointmentId } }), 0);
    const d = await prisma.kiorexCommissionDecision.findFirstOrThrow({ where: { appointmentId: t.appointmentId } });
    assert.equal(d.decision, "NO_CHARGE"); assert.deepEqual(d.reasonCodes, ["NO_RATE_CONFIGURED"]);
  });

  it("the type default prices the charge (percent of the fee, floor and cap) with no market row at all", async () => {
    const t = await org("def", [row(1, "DEFAULT", "2026-01-01T00:00:00.000Z", spec({ percentBps: 1000, minMinor: 500, maxMinor: 9000 }))]);
    await checkIn(t, new Date("2026-06-01T10:00:00Z"));
    const c = await prisma.kiorexCommissionCharge.findFirstOrThrow({ where: { appointmentId: t.appointmentId } });
    assert.equal(c.amount.toFixed(2), "30.00"); // 10 % of 300.00
    assert.equal(c.rateId, null); assert.equal(c.rateSource, "KIOREX_DEFAULT"); assert.equal(c.rateVersion, 1); assert.equal(c.status, CommissionChargeStatus.PENDING);
    const d = await prisma.kiorexCommissionDecision.findFirstOrThrow({ where: { appointmentId: t.appointmentId } });
    assert.equal(d.decision, "CHARGE"); assert.equal(d.amount?.toFixed(2), "30.00"); assert.match(d.policyVersion, /\+KIOREX_DEFAULT:v1$/); assert.equal(d.rateId, null);
    // the floor applies: a small visit fee
    await prisma.appointment.update({ where: { id: t.appointmentId }, data: { feeAmount: 20 } });
    const t2 = await org("def2", [row(1, "DEFAULT", "2026-01-01T00:00:00.000Z", spec({ minMinor: 500 }))]);
    await prisma.appointment.update({ where: { id: t2.appointmentId }, data: { feeAmount: 20 } });
    await checkIn(t2, new Date("2026-06-01T10:00:00Z"));
    assert.equal((await prisma.kiorexCommissionCharge.findFirstOrThrow({ where: { appointmentId: t2.appointmentId } })).amount.toFixed(2), "5.00");
  });

  it("the organisation's own rate wins from its start; an earlier visit keeps the default; INHERIT hands back", async () => {
    const history = [
      row(1, "DEFAULT", "2026-01-01T00:00:00.000Z", spec({ percentBps: 1000 })),
      row(1, "ORG", "2026-03-01T00:00:00.000Z", spec({ feeType: "FLAT", percentBps: null, flatMinor: 4000 })),
      row(2, "ORG", "2026-09-01T00:00:00.000Z", null),
    ];
    const early = await org("early", history); await checkIn(early, new Date("2026-02-01T10:00:00Z"));
    const mid = await org("mid", history); await checkIn(mid, new Date("2026-06-01T10:00:00Z"));
    const late = await org("late", history); await checkIn(late, new Date("2026-10-01T10:00:00Z"));
    const of = async (t: { appointmentId: string }) => prisma.kiorexCommissionCharge.findFirstOrThrow({ where: { appointmentId: t.appointmentId } });
    assert.deepEqual([(await of(early)).amount.toFixed(2), (await of(early)).rateSource], ["30.00", "KIOREX_DEFAULT"]);
    assert.deepEqual([(await of(mid)).amount.toFixed(2), (await of(mid)).rateSource], ["40.00", "KIOREX_OVERRIDE"]);
    assert.deepEqual([(await of(late)).amount.toFixed(2), (await of(late)).rateSource], ["30.00", "KIOREX_DEFAULT"]);
  });

  it("a charge keeps its price when Kiorex later changes the rate (frozen at check-in); the event still carries the amount", async () => {
    const t = await org("freeze", [row(1, "DEFAULT", "2026-01-01T00:00:00.000Z", spec({ percentBps: 1000 }))]);
    await checkIn(t, new Date("2026-06-01T10:00:00Z"));
    await prisma.kiorexCommissionRateView.update({ where: { tenantId: t.tenantId }, data: { version: BigInt(Date.now() + 5), view: { history: [row(1, "DEFAULT", "2026-01-01T00:00:00.000Z", spec({ percentBps: 2000 }))], mode: null } as never } });
    await checkIn(t, new Date("2026-06-01T11:00:00Z")); // a repeat check-in never re-prices an active charge
    assert.equal((await prisma.kiorexCommissionCharge.findFirstOrThrow({ where: { appointmentId: t.appointmentId } })).amount.toFixed(2), "30.00");
    const ev = await prisma.outboxEvent.findFirstOrThrow({ where: { tenantId: t.tenantId, type: "COMMISSION_CHARGE_CREATED" } });
    assert.equal((ev.payload as { amount: string }).amount, "30.00");
  });
});
