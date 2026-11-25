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
import { NewPatientService } from "../patients/new-patient.service";
import { MarketplacePatientIntakeService } from "./marketplace-patient-intake.service";
import { SlotHoldService } from "./slot-hold.service";
import { MarketplaceAccessService } from "./marketplace-access.service";
import { SLOT_CHANNEL } from "../scheduling/slot-channel";
import { emptyAvailabilityWeek } from "../scheduling/availability-week-schema";
import type { PlatformIntegrationPrincipal } from "./platform-integration-client.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();

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
    new NewPatientService(prismaSvc),
    { notifyKiorexBooking: async () => ({ queued: 0 }) } as never,
  );
  return { bookings, holds, slots };
}

describe("Marketplace daily cap on holds, bookings and reschedules (GAP)", () => {
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
      data: { name: `Cap ${suffix}`, clientKey: `plt_cap_${suffix}`, secretHash: "x", scopes: ["MARKETPLACE"] },
    });
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const plan = await prisma.plan.findFirstOrThrow({ where: { key: PlanKey.PRO } });
    const tenant = await prisma.tenant.create({
      data: { name: `Cap ${suffix}`, deploymentCell: "frankfurt", marketId: market.id },
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
        locationUrl: "https://maps.example/cap",
        timezone: "Africa/Cairo",
        phone: "201000000040",
        email: `cap.${suffix}@example.com`,
        licenseNumber: "EG-CAP",
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
        email: `cap.dr.${suffix}@example.com`,
        passwordHash: bcrypt.hashSync("demo", 10),
        displayName: "Dr Cap",
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
        syndicateNumber: "SYND-CAP",
        documentKeys: [],
      },
    });
    const week = emptyAvailabilityWeek("Africa/Cairo");
    week.days[1]!.slots.push({ start: "09:00", end: "17:00" });
    await prisma.clinicianAvailabilityTemplate.create({
      data: { tenantId, clinicId, clinicianId: physicianId, weekJson: week, marketplaceDailyCap: 2 },
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

  const patient = { phone: "+201011111111", firstNameEn: "Ali", lastNameEn: "Test", gender: Gender.M };
  // Mondays well ahead (the template opens Mondays 09:00-17:00 Cairo); `at(week, n)` = the n-th half hour from 08:00Z of that Monday
  const firstMonday = (() => {
    const d = new Date(Date.now() + 14 * 86_400_000);
    while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(8, 0, 0, 0);
    return d;
  })();
  const at = (week: number, n: number) => ({
    start: new Date(firstMonday.getTime() + week * 7 * 86_400_000 + n * 30 * 60_000).toISOString(),
    end: new Date(firstMonday.getTime() + week * 7 * 86_400_000 + (n + 1) * 30 * 60_000).toISOString(),
  });
  const book = (week: number, n: number, tag: string, extra: Record<string, unknown> = {}) => {
    const { start, end } = at(week, n);
    return bookingStack().bookings.createBooking(client, `KIOREX-${suffix}-${tag}`, { clinicId, clinicianId: physicianId, typeId, startsAt: start, endsAt: end, patient: { ...patient, phone: `+2010${String(week * 100 + n).padStart(8, "0")}` }, marketplaceConsentGranted: true, remindersConsentGranted: true, ...extra });
  };
  const hold = (week: number, n: number, ref: string) => {
    const { start, end } = at(week, n);
    return bookingStack().holds.createHold(client, { clinicId, clinicianId: physicianId, typeId, startsAt: start, endsAt: end, externalRef: `HOLD-${suffix}-${ref}` });
  };
  const codeOf = (e: unknown) => JSON.stringify((e as { getResponse?: () => unknown }).getResponse?.() ?? String(e));
  const capReached = (e: unknown) => /MARKETPLACE_DAILY_CAP_REACHED/.test(codeOf(e));

  it("bookings WITHOUT a hold stop at the cap (that path never consulted the slot list)", async () => {
    await book(0, 0, "b1");
    await book(0, 1, "b2");
    await assert.rejects(() => book(0, 2, "b3"), capReached);
    assert.equal(await prisma.appointment.count({ where: { tenantId, clinicianId: physicianId, status: { not: AppointmentStatus.CANCELLED } } }), 2);
  });

  /** First free start of a Monday as the slot list offers it (the list hands out the earliest starts first). */
  const firstOffered = async (week: number) => {
    const day = new Date(firstMonday.getTime() + week * 7 * 86_400_000);
    const from = new Date(day.getTime() - 4 * 3_600_000);
    const { slots } = await bookingStack().slots.getSlots({ tenantId, clinicId, clinicianId: physicianId, typeId, from, to: new Date(from.getTime() + 24 * 3_600_000), channel: SLOT_CHANNEL.MARKETPLACE });
    assert.ok(slots[0], "the list offers a slot");
    return slots[0];
  };
  const holdAt = (s: { startsAt: string; endsAt: string }, ref: string) => bookingStack().holds.createHold(client, { clinicId, clinicianId: physicianId, typeId, startsAt: s.startsAt, endsAt: s.endsAt, externalRef: `HOLD-${suffix}-${ref}` });

  it("holds count towards the cap: a further hold or booking is refused, the holder's own booking passes", async () => {
    await book(1, 0, "h-b1");
    const a = await holdAt(await firstOffered(1), "a");
    // the slot list does not count holds, so without the write-path check this third place would be handed out
    await assert.rejects(async () => holdAt(await firstOffered(1), "b"), capReached);
    await assert.rejects(() => book(1, 3, "h-other"), capReached);
    const mine = await book(1, 0, "h-mine", { holdId: a.id, startsAt: a.startsAt, endsAt: a.endsAt });
    assert.ok(mine.appointmentId);
  });

  it("a cancelled booking frees its place again", async () => {
    await prisma.appointment.updateMany({ where: { tenantId, externalReference: `KIOREX-${suffix}-b2` }, data: { status: AppointmentStatus.CANCELLED } });
    const again = await book(0, 1, "b2-again");
    assert.ok(again.appointmentId);
  });

  it("a reschedule onto a full day is refused; moving inside its own day is not counted against itself", async () => {
    const { bookings } = bookingStack();
    await book(2, 0, "r-a");
    await book(2, 1, "r-b");
    await book(3, 0, "r-x");
    await assert.rejects(() => bookings.rescheduleByPatient(client, `KIOREX-${suffix}-r-x`, { startsAt: at(2, 2).start, endsAt: at(2, 2).end }), capReached);
    const moved = await bookings.rescheduleByPatient(client, `KIOREX-${suffix}-r-x`, { startsAt: at(3, 1).start, endsAt: at(3, 1).end });
    assert.ok(moved);
  });
});
