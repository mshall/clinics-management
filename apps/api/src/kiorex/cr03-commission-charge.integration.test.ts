import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  AppointmentStatus,
  BookingSource,
  CommissionChargeStatus,
  FeeType,
  Gender,
  PrismaClient,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { CreditWalletService } from "../credits/credit-wallet.service";
import { KiorexCommissionService } from "./kiorex-commission.service";
import { CommissionChargeService } from "./commission-charge.service";
import { COMMISSION_CHARGE_CREATED, COMMISSION_CHARGE_REVERSED } from "./commission-charge-topics";
import { isActiveCommissionChargeStatus } from "./commission-charge-status";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
const prismaSvc = prisma as unknown as PrismaService;

describe("CR-03 Kiorex commission charges", () => {
  const suffix = `cr03-${Date.now()}`;
  let tenantId: string;
  let clinicId: string;
  let patientId: string;
  let clinicianId: string;
  let appointmentId: string;
  let rateIdLow: string;
  let rateIdHigh: string;
  let marketId: string;
  let charges: CommissionChargeService;

  before(async () => {
    await prisma.$connect();
    charges = new CommissionChargeService(
      prismaSvc,
      new KiorexCommissionService(prismaSvc),
      new OutboxEventService(prismaSvc),
      new CreditWalletService(prismaSvc),
    );

    const market = await prisma.market.create({
      data: {
        code: `CR3${suffix}`.slice(0, 12),
        nameEn: `CR03 market ${suffix}`,
        hostCell: "frankfurt",
        defaultCurrency: "EGP",
        defaultLocale: "en",
        defaultTimezone: "Africa/Cairo",
        weekendDays: [5, 6],
        enabledLanguages: ["en", "ar"],
        defaultPhoneRegion: "EG",
      },
    });
    marketId = market.id;

    const tenant = await prisma.tenant.create({
      data: {
        name: `CR03 ${suffix}`,
        deploymentCell: "frankfurt",
        marketId: market.id,
        baseCurrency: "EGP",
      },
    });
    tenantId = tenant.id;

    const clinic = await prisma.clinic.create({
      data: {
        tenantId,
        nameEn: "Clinic",
        nameAr: "عيادة",
        country: "EG",
        city: "Cairo",
        addressEn: "St",
        addressAr: "شارع",
        locationUrl: "https://maps.example/c",
        phone: "+201000000030",
        email: `c3-${suffix}@test.com`,
        licenseNumber: "SELF-SERVE-PENDING",
        defaultCurrency: "EGP",
      },
    });
    clinicId = clinic.id;

    const user = await prisma.user.create({
      data: {
        tenantId,
        email: `doc3-${suffix}@test.com`,
        passwordHash: "x",
        displayName: "Doc Kiorex",
        role: "PHYSICIAN",
      },
    });
    clinicianId = user.id;

    const patient = await prisma.patient.create({
      data: {
        tenantId,
        mrn: `MRN3-${suffix}`,
        firstNameEn: "Sam",
        lastNameEn: "New",
        gender: Gender.UNKNOWN,
        phone: `+2011${String(Date.now()).slice(-8)}`,
        nationalId: `nat3-${suffix}`,
      },
    });
    patientId = patient.id;

    const low = await prisma.kiorexCommissionRate.create({
      data: {
        marketId,
        feeType: FeeType.FLAT,
        amount: 50,
        validFrom: new Date("2020-01-01"),
      },
    });
    rateIdLow = low.id;

    const high = await prisma.kiorexCommissionRate.create({
      data: {
        marketId,
        feeType: FeeType.FLAT,
        amount: 120,
        validFrom: new Date("2026-01-01"),
      },
    });
    rateIdHigh = high.id;

    const apt = await prisma.appointment.create({
      data: {
        tenantId,
        clinicId,
        patientId,
        clinicianId,
        startsAt: new Date(),
        feeAmount: 300,
        bookingSource: BookingSource.KIOREX_MARKETPLACE,
        isNewPatientAtBooking: true,
        status: AppointmentStatus.CONFIRMED,
      },
    });
    appointmentId = apt.id;
  });

  after(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.kiorexCommissionRate.deleteMany({ where: { id: { in: [rateIdLow, rateIdHigh] } } }).catch(() => undefined);
    await prisma.market.delete({ where: { id: marketId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  async function activeCount() {
    const rows = await prisma.kiorexCommissionCharge.findMany({ where: { appointmentId } });
    return rows.filter((r) => isActiveCommissionChargeStatus(r.status)).length;
  }

  it("check-in → revert → check-in yields one active charge with latest snapshot", async () => {
    const t1 = new Date("2026-06-01T10:00:00Z");
    await prisma.$transaction(async (tx) => {
      await tx.appointment.update({
        where: { id: appointmentId },
        data: { status: AppointmentStatus.CHECKED_IN, checkedInAt: t1 },
      });
      await charges.onCheckIn(tx, tenantId, appointmentId, t1);
    });

    let row = await prisma.kiorexCommissionCharge.findUniqueOrThrow({ where: { appointmentId } });
    assert.equal(row.status, CommissionChargeStatus.PENDING);
    assert.equal(row.amount.toFixed(2), "120.00");
    assert.equal(row.rateId, rateIdHigh);

  await prisma.kiorexCommissionRate.update({
      where: { id: rateIdHigh },
      data: { validTo: new Date("2025-01-01") },
    });

    await prisma.$transaction(async (tx) => {
      await charges.onRevert(tx, tenantId, appointmentId, "check_in_reverted");
      await tx.appointment.update({
        where: { id: appointmentId },
        data: { status: AppointmentStatus.CONFIRMED, checkedInAt: null, queueTicketNumber: null },
      });
    });

    row = await prisma.kiorexCommissionCharge.findUniqueOrThrow({ where: { appointmentId } });
    assert.equal(row.status, CommissionChargeStatus.REVERSED);
    assert.equal(await activeCount(), 0);

    const t2 = new Date("2026-06-02T11:00:00Z");
    await prisma.$transaction(async (tx) => {
      await tx.appointment.update({
        where: { id: appointmentId },
        data: { status: AppointmentStatus.CHECKED_IN, checkedInAt: t2 },
      });
      await charges.onCheckIn(tx, tenantId, appointmentId, t2);
    });

    row = await prisma.kiorexCommissionCharge.findUniqueOrThrow({ where: { appointmentId } });
    assert.equal(await activeCount(), 1);
    assert.equal(row.status, CommissionChargeStatus.PENDING);
    assert.equal(row.amount.toFixed(2), "50.00");
    assert.equal(row.rateId, rateIdLow);

    const createdEvents = await prisma.outboxEvent.count({
      where: { tenantId, type: COMMISSION_CHARGE_CREATED },
    });
    const reversedEvents = await prisma.outboxEvent.count({
      where: { tenantId, type: COMMISSION_CHARGE_REVERSED },
    });
    assert.ok(createdEvents >= 2);
    assert.ok(reversedEvents >= 1);
  });

  it("onComplete confirms a pending charge", async () => {
    await prisma.$transaction(async (tx) => {
      await charges.onComplete(tx, tenantId, appointmentId);
    });
    const row = await prisma.kiorexCommissionCharge.findUniqueOrThrow({ where: { appointmentId } });
    assert.equal(row.status, CommissionChargeStatus.CONFIRMED);
    assert.ok(row.confirmedAt);
  });
});