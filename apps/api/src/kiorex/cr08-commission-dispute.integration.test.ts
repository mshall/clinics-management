import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { after, before, describe, it } from "node:test";
import {
  AppointmentStatus,
  BookingSource,
  CommissionChargeStatus,
  CommissionDisputeReason,
  CommissionDisputeStatus,
  Gender,
  PrismaClient,
  UserRole,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { CreditWalletService } from "../credits/credit-wallet.service";
import { KiorexCommissionService } from "./kiorex-commission.service";
import { CommissionChargeService } from "./commission-charge.service";
import { CommissionDisputeService } from "./commission-dispute.service";
import { NewPatientService } from "../patients/new-patient.service";

const prisma = new PrismaClient();
const prismaSvc = prisma as unknown as PrismaService;

describe("CR-08 Commission disputes", () => {
  const suffix = `cr08-${Date.now()}`;
  let tenantId: string;
  let clinicId: string;
  let patientId: string;
  let clinicianId: string;
  let ownerUserId: string;
  let platformUserId: string;
  let appointmentId: string;
  let chargeId: string;
  let marketId: string;
  let disputes: CommissionDisputeService;
  let charges: CommissionChargeService;

  const ownerJwt = () => ({
    userId: ownerUserId,
    tenantId,
    email: `own-${suffix}@test.com`,
    role: UserRole.CLINIC_ADMIN,
    additionalRoles: [],
  });

  const platformJwt = () => ({
    userId: platformUserId,
    tenantId: "platform",
    email: process.env.PLATFORM_SUPER_ADMIN_EMAILS?.split(",")[0] ?? `plat-${suffix}@test.com`,
    role: UserRole.PLATFORM_SUPER_ADMIN,
    additionalRoles: [],
  });

  before(async () => {
    await prisma.$connect();
    charges = new CommissionChargeService(
      prismaSvc,
      new KiorexCommissionService(prismaSvc),
      new OutboxEventService(prismaSvc),
      new CreditWalletService(prismaSvc),
    );
    disputes = new CommissionDisputeService(prismaSvc, charges, new NewPatientService(prismaSvc));

    const market = await prisma.market.create({
      data: {
        code: `C8${suffix}`.slice(0, 12),
        nameEn: `CR08 ${suffix}`,
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
      data: { name: `CR08 ${suffix}`, deploymentCell: "frankfurt", marketId, baseCurrency: "EGP" },
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
        phone: "+201000000088",
        email: `c8-${suffix}@test.com`,
        licenseNumber: "SELF-SERVE-PENDING",
        defaultCurrency: "EGP",
      },
    });
    clinicId = clinic.id;

    const owner = await prisma.user.create({
      data: {
        tenantId,
        email: `own-${suffix}@test.com`,
        passwordHash: "x",
        displayName: "Owner",
        role: UserRole.CLINIC_ADMIN,
        isTenantOwner: true,
      },
    });
    ownerUserId = owner.id;

    const clinician = await prisma.user.create({
      data: {
        tenantId,
        email: `doc8-${suffix}@test.com`,
        passwordHash: "x",
        displayName: "Doc",
        role: UserRole.PHYSICIAN,
      },
    });
    clinicianId = clinician.id;

    platformUserId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `plat-${suffix}@kiorly.test`,
          passwordHash: "x",
          displayName: "Platform",
          role: UserRole.PLATFORM_SUPER_ADMIN,
        },
      })
    ).id;

    await prisma.kiorexCommissionRate.create({
      data: { marketId, feeType: "FLAT", amount: 40, validFrom: new Date("2020-01-01") },
    });

    const p1 = await prisma.patient.create({
      data: {
        tenantId,
        mrn: `MRN8A-${suffix}`,
        firstNameEn: "A",
        lastNameEn: "One",
        gender: Gender.UNKNOWN,
        phone: `+2010111${String(Date.now()).slice(-6)}`,
        nationalId: `nid-${suffix}`,
      },
    });
    patientId = p1.id;

    await prisma.appointment.create({
      data: {
        tenantId,
        clinicId,
        patientId,
        clinicianId,
        startsAt: new Date("2026-01-01"),
        checkedInAt: new Date("2026-01-01T10:00:00Z"),
        status: AppointmentStatus.CHECKED_IN,
        feeAmount: 200,
        bookingSource: BookingSource.FRONT_DESK,
      },
    });

    const apt = await prisma.appointment.create({
      data: {
        tenantId,
        clinicId,
        patientId,
        clinicianId,
        startsAt: new Date("2026-06-15"),
        feeAmount: 300,
        bookingSource: BookingSource.KIOREX_MARKETPLACE,
        isNewPatientAtBooking: true,
        status: AppointmentStatus.CONFIRMED,
      },
    });
    appointmentId = apt.id;

    const attendedAt = new Date("2026-06-15T12:00:00Z");
    await prisma.$transaction(async (tx) => {
      await charges.onCheckIn(tx, tenantId, appointmentId, attendedAt);
      await charges.onComplete(tx, tenantId, appointmentId);
    });

    const charge = await prisma.kiorexCommissionCharge.findUniqueOrThrow({ where: { appointmentId } });
    chargeId = charge.id;
  });

  after(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.market.delete({ where: { id: marketId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("refuses disputes after the dispute window", async () => {
    await prisma.kiorexCommissionCharge.update({
      where: { id: chargeId },
      data: { disputeDeadline: new Date("2020-01-01"), status: CommissionChargeStatus.CONFIRMED },
    });
    await assert.rejects(
      () => disputes.openDispute(ownerJwt(), tenantId, chargeId, CommissionDisputeReason.OTHER, "late"),
      (e: unknown) => {
        assert.ok(e instanceof BadRequestException);
        const body = e.getResponse() as { code?: string };
        assert.equal(body.code, "KIOREX_DISPUTE_WINDOW_CLOSED");
        return true;
      },
    );
    await prisma.kiorexCommissionCharge.update({
      where: { id: chargeId },
      data: { disputeDeadline: new Date("2099-01-01"), status: CommissionChargeStatus.CONFIRMED },
    });
  });

  it("auto-approves EXISTING_PATIENT when prior visit exists on matching national ID", async () => {
    const opened = await disputes.openDispute(
      ownerJwt(),
      tenantId,
      chargeId,
      CommissionDisputeReason.EXISTING_PATIENT,
    );
    assert.equal(opened.dispute.status, CommissionDisputeStatus.AUTO_APPROVED);
    const charge = await prisma.kiorexCommissionCharge.findUniqueOrThrow({ where: { id: chargeId } });
    assert.equal(charge.status, CommissionChargeStatus.REVERSED);

    const audit = await prisma.auditLog.findFirst({
      where: { tenantId, action: "kiorex.commission_dispute.resolved", resourceId: opened.dispute.id },
    });
    assert.ok(audit);

    const outbox = await prisma.outboxEvent.findFirst({
      where: { tenantId, type: "billing.commission_dispute_resolved", aggregateId: opened.dispute.id },
    });
    assert.ok(outbox);
  });

  it("manual reject restores charge and notifies owner", async () => {
    const apt2 = await prisma.appointment.create({
      data: {
        tenantId,
        clinicId,
        patientId,
        clinicianId,
        startsAt: new Date("2026-07-01"),
        feeAmount: 300,
        bookingSource: BookingSource.KIOREX_MARKETPLACE,
        isNewPatientAtBooking: true,
        status: AppointmentStatus.CONFIRMED,
      },
    });
    const attendedAt = new Date("2026-07-01T12:00:00Z");
    await prisma.$transaction(async (tx) => {
      await charges.onCheckIn(tx, tenantId, apt2.id, attendedAt);
      await charges.onComplete(tx, tenantId, apt2.id);
    });
    const c2 = await prisma.kiorexCommissionCharge.findUniqueOrThrow({ where: { appointmentId: apt2.id } });
    await prisma.kiorexCommissionCharge.update({
      where: { id: c2.id },
      data: { disputeDeadline: new Date("2099-01-01") },
    });

    const opened = await disputes.openDispute(
      ownerJwt(),
      tenantId,
      c2.id,
      CommissionDisputeReason.DID_NOT_ATTEND,
      "Patient never came",
    );
    assert.equal(opened.dispute.status, CommissionDisputeStatus.OPEN);

    const resolved = await disputes.resolve(platformJwt(), opened.dispute.id, {
      decision: "REJECT",
      resolution: "Attendance verified on camera",
    });
    assert.equal(resolved.status, CommissionDisputeStatus.REJECTED);
    const chargeAfter = await prisma.kiorexCommissionCharge.findUniqueOrThrow({ where: { id: c2.id } });
    assert.equal(chargeAfter.status, CommissionChargeStatus.CONFIRMED);

    const notifyAudit = await prisma.auditLog.findFirst({
      where: { tenantId, action: "kiorex.commission_dispute.owner_notified", resourceId: opened.dispute.id },
    });
    assert.ok(notifyAudit);
  });
});