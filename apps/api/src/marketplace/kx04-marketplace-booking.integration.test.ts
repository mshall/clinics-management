import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  AppointmentStatus,
  BillingInterval,
  Gender,
  ListingStatus,
  PlanKey,
  PrismaClient,
  SubscriptionStatus,
  UserRole,
  VerificationStatus,
} from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { AppointmentOutboxService } from "../messaging/appointment-outbox.service";
import { AuditService } from "../audit/audit.service";
import { AppointmentsService } from "../appointments/appointments.service";
import { ConsentPolicyService } from "../compliance/consent-policy.service";
import { SlotService } from "../scheduling/slot.service";
import { MarketplaceBookingService } from "./marketplace-booking.service";
import { MarketplacePatientIntakeService } from "./marketplace-patient-intake.service";
import { SlotHoldService } from "./slot-hold.service";
import { MarketplaceAccessService } from "./marketplace-access.service";
import { emptyAvailabilityWeek } from "../scheduling/availability-week-schema";
import type { PlatformIntegrationPrincipal } from "./platform-integration-client.service";

const prisma = new PrismaClient();

function bookingStack() {
  const prismaSvc = prisma as unknown as PrismaService;
  const audit = new AuditService(prismaSvc);
  const outbox = new OutboxEventService(prismaSvc);
  const appointmentOutbox = new AppointmentOutboxService(outbox);
  const slots = new SlotService(prismaSvc, outbox);
  const access = new MarketplaceAccessService(prismaSvc);
  const holds = new SlotHoldService(prismaSvc, slots, access);
  const patients = new MarketplacePatientIntakeService(prismaSvc);
  const consent = new ConsentPolicyService(prismaSvc, audit);
  const bookings = new MarketplaceBookingService(
    prismaSvc,
    access,
    patients,
    {} as AppointmentsService,
    consent,
    audit,
    outbox,
    appointmentOutbox,
    slots,
  );
  return { bookings, holds, slots };
}

describe("KX-04 marketplace booking", () => {
  let tenantId: string;
  let clinicId: string;
  let physicianId: string;
  let typeId: string;
  let client: PlatformIntegrationPrincipal;
  let slotStart: string;
  let slotEnd: string;
  const suffix = `${Date.now()}`;

  before(async () => {
    await prisma.$connect();
    client = await prisma.platformIntegrationClient.create({
      data: { name: `Kx04 ${suffix}`, clientKey: `plt_kx04_${suffix}`, secretHash: "x", scopes: ["MARKETPLACE"] },
    });
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const plan = await prisma.plan.findFirstOrThrow({ where: { key: PlanKey.PRO } });
    const tenant = await prisma.tenant.create({
      data: { name: `Kx04 ${suffix}`, deploymentCell: "frankfurt", marketId: market.id },
    });
    tenantId = tenant.id;
    const clinic = await prisma.clinic.create({
      data: {
        tenantId,
        nameEn: "Branch",
        nameAr: "فرع",
        country: "EG",
        city: "Cairo",
        addressEn: "Street",
        addressAr: "شارع",
        locationUrl: "https://maps.example/kx04",
        timezone: "Africa/Cairo",
        phone: "201000000040",
        email: `kx04.${suffix}@example.com`,
        licenseNumber: "EG-KX04",
        defaultCurrency: "EGP",
        marketplaceBookingAutoConfirm: true,
      },
    });
    clinicId = clinic.id;
    await prisma.subscription.create({
      data: {
        tenantId,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        interval: BillingInterval.MONTHLY,
        clinicianSeats: 1,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    const physician = await prisma.user.create({
      data: {
        tenantId,
        email: `kx04.dr.${suffix}@example.com`,
        passwordHash: bcrypt.hashSync("demo", 10),
        displayName: "Dr Kx04",
        role: UserRole.PHYSICIAN,
      },
    });
    physicianId = physician.id;
    await prisma.clinicianVerification.create({
      data: {
        userId: physicianId,
        tenantId,
        status: VerificationStatus.VERIFIED,
        specialty: "GENERAL_MEDICINE",
        verifiedSpecialty: "GENERAL_MEDICINE",
        syndicateNumber: "SYND-KX04",
        documentKeys: [],
      },
    });
    const week = emptyAvailabilityWeek("Africa/Cairo");
    week.days[1]!.slots.push({ start: "09:00", end: "17:00" });
    await prisma.clinicianAvailabilityTemplate.create({
      data: { tenantId, clinicId, clinicianId: physicianId, weekJson: week },
    });
    const type = await prisma.appointmentType.create({
      data: {
        tenantId,
        clinicId,
        nameEn: "Visit",
        nameAr: "كشف",
        durationMinutes: 30,
        feeAmount: 300,
        colorHex: "#3b82f6",
        marketplaceBookable: true,
        minNoticeMinutes: 0,
        maxDaysAhead: 60,
        isActive: true,
      },
    });
    typeId = type.id;
    await prisma.marketplaceListing.create({
      data: { tenantId, clinicId, clinicianId: physicianId, status: ListingStatus.LIVE, profileJson: {} },
    });
    slotStart = "2026-08-03T06:00:00.000Z";
    slotEnd = "2026-08-03T06:30:00.000Z";
  });

  after(async () => {
    await prisma.slotHold.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.appointment.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.marketplaceListing.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.clinicianAvailabilityTemplate.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.appointmentType.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.clinicianVerification.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.subscription.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.clinic.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.platformIntegrationClient.delete({ where: { id: client.id } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  const patient = {
    phone: "+201011111111",
    firstNameEn: "Ali",
    lastNameEn: "Test",
    gender: Gender.M,
  };

  const body = () => ({
    clinicId,
    clinicianId: physicianId,
    typeId,
    startsAt: slotStart,
    endsAt: slotEnd,
    patient,
    marketplaceConsentGranted: true,
    remindersConsentGranted: true,
  });

  it("two parallel bookings for one slot: exactly one succeeds", async () => {
    const { bookings } = bookingStack();
    const parallelStart = "2026-08-10T06:00:00.000Z";
    const parallelEnd = "2026-08-10T06:30:00.000Z";
    const slotBody = () => ({ ...body(), startsAt: parallelStart, endsAt: parallelEnd });
    const results = await Promise.allSettled([
      bookings.createBooking(client, `KIOREX-${suffix}-p1`, slotBody()),
      bookings.createBooking(client, `KIOREX-${suffix}-p2`, slotBody()),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    assert.equal(ok.length, 1);
    assert.equal(failed.length, 1);
    const count = await prisma.appointment.count({
      where: {
        tenantId,
        clinicianId: physicianId,
        startsAt: new Date(parallelStart),
        status: { not: AppointmentStatus.CANCELLED },
      },
    });
    assert.equal(count, 1);
  });

  it("retrying the same booking returns the same appointment", async () => {
    const { bookings } = bookingStack();
    const key = `KIOREX-${suffix}-1`;
    const first = await bookings.createBooking(client, key, body());
    const second = await bookings.createBooking(client, key, body());
    assert.equal(first.appointmentId, second.appointmentId);
  });
});