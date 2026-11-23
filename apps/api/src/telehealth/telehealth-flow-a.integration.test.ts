import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { BillingInterval, ListingStatus, PlanKey, SubscriptionStatus, UserRole, VerificationStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { AppointmentsService } from "../appointments/appointments.service";
import { AuditService } from "../audit/audit.service";
import { ConsentPolicyService } from "../compliance/consent-policy.service";
import { AppointmentOutboxService } from "../messaging/appointment-outbox.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { MarketplaceAccessService } from "../marketplace/marketplace-access.service";
import { MarketplaceApiService } from "../marketplace/marketplace-api.service";
import { MarketplaceBookingService } from "../marketplace/marketplace-booking.service";
import { MarketplacePatientIntakeService } from "../marketplace/marketplace-patient-intake.service";
import type { PlatformIntegrationPrincipal } from "../marketplace/platform-integration-client.service";
import { SlotHoldService } from "../marketplace/slot-hold.service";
import { NewPatientService } from "../patients/new-patient.service";
import { createPrismaClient } from "../prisma/create-prisma-client";
import type { PrismaService } from "../prisma/prisma.service";
import { emptyAvailabilityWeek } from "../scheduling/availability-week-schema";
import { SlotService } from "../scheduling/slot.service";
import { verifyTelehealthToken } from "./telehealth-token";

process.env.JWT_SECRET ??= "integration-test-jwt-secret-0123456789abcdef";
const prisma = createPrismaClient();
const p = prisma as unknown as PrismaService;
const code = (e: unknown) => (e as { getResponse?: () => { code?: string } }).getResponse?.()?.code;

function nextMondayUtc(hour: number, plusDays = 0): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 7 + ((8 - d.getUTCDay()) % 7) + plusDays);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

describe("ADR-039 Flow A: Kiorex books telehealth (hold -> confirm -> reschedule -> cancel)", () => {
  const suffix = `${Date.now()}`;
  const state = { flagOn: true };
  let tenantId: string;
  let clinicId: string;
  let doctorId: string;
  let typeId: string;
  let client: PlatformIntegrationPrincipal;
  let marketId: string;
  const flags = { evaluate: async () => ({ effective: state.flagOn, source: "global", scope: "global" }) } as never;
  const entitlements = { isEntitled: async () => true, requireEntitlement: async () => undefined } as never;
  const audit = new AuditService(p);
  const outbox = new OutboxEventService(p);
  const slots = new SlotService(p, outbox);
  const access = new MarketplaceAccessService(p);
  const holds = new SlotHoldService(p, slots, access, undefined, flags, entitlements);
  const bookings = new MarketplaceBookingService(p, access, new MarketplacePatientIntakeService(p), {} as AppointmentsService, new ConsentPolicyService(p, audit), audit, outbox, new AppointmentOutboxService(outbox), slots, new NewPatientService(p), { notifyKiorexBooking: async () => ({ queued: 0 }) } as never, undefined, flags, entitlements);
  const api = new MarketplaceApiService({} as never, access, {} as never, p, slots, undefined, flags, entitlements);

  before(async () => {
    await prisma.$connect();
    client = await prisma.platformIntegrationClient.create({ data: { name: `thA ${suffix}`, clientKey: `plt_tha_${suffix}`, secretHash: "x", scopes: ["MARKETPLACE"] } });
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    marketId = market.id;
    const plan = await prisma.plan.findFirstOrThrow({ where: { key: PlanKey.PRO } });
    tenantId = (await prisma.tenant.create({ data: { name: `ThA ${suffix}`, deploymentCell: "frankfurt", marketId: market.id } })).id;
    clinicId = (await prisma.clinic.create({ data: { tenantId, nameEn: "Branch", nameAr: "فرع", country: "EG", city: "Cairo", addressEn: "Street", addressAr: "شارع", locationUrl: "https://maps.example/tha", timezone: "Africa/Cairo", phone: "201000000044", email: `tha.${suffix}@example.com`, licenseNumber: "EG-THA", defaultCurrency: "EGP", marketplaceBookingAutoConfirm: true } })).id;
    await prisma.subscription.create({ data: { tenantId, planId: plan.id, status: SubscriptionStatus.ACTIVE, interval: BillingInterval.MONTHLY, clinicianSeats: 1, currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000) } });
    doctorId = (await prisma.user.create({ data: { tenantId, email: `tha.dr.${suffix}@example.com`, passwordHash: bcrypt.hashSync("demo", 10), displayName: "Dr ThA", role: UserRole.PHYSICIAN } })).id;
    await prisma.clinicianVerification.create({ data: { userId: doctorId, tenantId, status: VerificationStatus.VERIFIED, specialty: "GENERAL_MEDICINE", verifiedSpecialty: "GENERAL_MEDICINE", syndicateNumber: "SYND-THA", documentKeys: [] } });
    const week = emptyAvailabilityWeek("Africa/Cairo");
    week.days[1]!.slots.push({ start: "09:00", end: "17:00" });
    await prisma.clinicianAvailabilityTemplate.create({ data: { tenantId, clinicId, clinicianId: doctorId, weekJson: week } });
    typeId = (await prisma.appointmentType.create({ data: { tenantId, clinicId, nameEn: "Video", nameAr: "فيديو", durationMinutes: 30, feeAmount: 300, serviceLocation: "VIDEO", marketplaceBookable: true, minNoticeMinutes: 0, maxDaysAhead: 60, isActive: true } })).id;
    await prisma.marketplaceListing.create({ data: { tenantId, clinicId, clinicianId: doctorId, status: ListingStatus.LIVE, profileJson: {} } });
  });
  after(async () => {
    await prisma.slotHold.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.platformIntegrationClient.delete({ where: { id: client.id } }).catch(() => undefined);
    void marketId;
    await prisma.$disconnect();
  });

  const body = (start: Date, ref: string) => ({
    clinicId, clinicianId: doctorId, typeId, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 30 * 60_000).toISOString(), holdExternalRef: ref,
    patient: { firstNameEn: "Mona", lastNameEn: "Kiorex", phone: `+2012${suffix.slice(-8)}`, email: "mona@example.com" } as never,
  });

  it("slots/holds exist only while the doctor offers telehealth AND the flag is on", async () => {
    const start = nextMondayUtc(8);
    const from = new Date(start.getTime() - 3600_000).toISOString();
    const to = new Date(start.getTime() + 4 * 3600_000).toISOString();
    const slotsOff = await api.listSlots(client, clinicId, doctorId, typeId, from, to);
    assert.equal(slotsOff.slots.length, 0, "doctor has not switched on 'Offers telehealth'");
    await assert.rejects(holds.createHold(client, { clinicId, clinicianId: doctorId, typeId, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 1800_000).toISOString(), externalRef: `h0-${suffix}` }), (e) => code(e) === "TELEHEALTH_NOT_OFFERED");
    await prisma.clinicianTelehealthSetting.create({ data: { tenantId, clinicianId: doctorId, offersTelehealth: true } });
    const slotsOn = await api.listSlots(client, clinicId, doctorId, typeId, from, to);
    assert.ok(slotsOn.slots.length > 0);
    assert.ok(slotsOn.slots.every((s) => (s as { serviceLocation: string }).serviceLocation === "VIDEO"));
    state.flagOn = false;
    assert.equal((await api.listSlots(client, clinicId, doctorId, typeId, from, to)).slots.length, 0, "flag OFF hides telehealth slots from Kiorex");
    await assert.rejects(holds.createHold(client, { clinicId, clinicianId: doctorId, typeId, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 1800_000).toISOString(), externalRef: `h1-${suffix}` }), (e) => (e as { getStatus?: () => number }).getStatus?.() === 403);
    state.flagOn = true;
    // telehealth-only windows narrow the slots (09:00-10:00 Cairo only)
    await prisma.clinicianTelehealthSetting.update({ where: { clinicianId: doctorId }, data: { windowsJson: { mon: [{ start: "10:00", end: "11:00" }] } } });
    const narrowed = await api.listSlots(client, clinicId, doctorId, typeId, from, to);
    assert.ok(narrowed.slots.length > 0 && narrowed.slots.length < slotsOn.slots.length);
    await prisma.clinicianTelehealthSetting.update({ where: { clinicianId: doctorId }, data: { windowsJson: null as never } }).catch(() => undefined);
  });

  it("hold -> confirm creates Appointment + session in ONE transaction; CONFIRMED event and booking response carry the telehealth block; replays are idempotent", async () => {
    await prisma.clinicianTelehealthSetting.update({ where: { clinicianId: doctorId }, data: { windowsJson: { sun: [] } } });
    const start = nextMondayUtc(8, 7);
    const ref = `kx_th_${suffix}`;
    await holds.createHold(client, { clinicId, clinicianId: doctorId, typeId, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 1800_000).toISOString(), externalRef: ref });
    const booked = (await bookings.createBooking(client, ref, body(start, ref))) as { appointmentId: string; serviceLocation: string; visitType?: string; telehealth?: { sessionId: string; joinUrl: string } };
    assert.equal(booked.serviceLocation, "VIDEO");
    assert.equal(booked.visitType, "TELEHEALTH");
    assert.ok(booked.telehealth?.sessionId);
    const claims = verifyTelehealthToken(booked.telehealth!.joinUrl.split("/v/")[1]!);
    assert.equal(claims?.s, booked.telehealth!.sessionId);
    const sessions = await prisma.telehealthSession.findMany({ where: { appointmentId: booked.appointmentId } });
    assert.equal(sessions.length, 1);
    const confirmed = await prisma.outboxEvent.findFirstOrThrow({ where: { tenantId, type: "APPOINTMENT_CONFIRMED", aggregateId: booked.appointmentId } });
    assert.equal((confirmed.payload as { telehealth?: { sessionId: string } }).telehealth?.sessionId, sessions[0]!.id);
    const created = await prisma.outboxEvent.findMany({ where: { tenantId, type: "telehealth.session.created", aggregateId: sessions[0]!.id } });
    assert.equal(created.length, 1);
    assert.equal(created[0]!.target, "KIOREX");
    const again = (await bookings.createBooking(client, ref, body(start, ref))) as { telehealth?: { sessionId: string } };
    assert.equal(again.telehealth?.sessionId, sessions[0]!.id);
    assert.equal(await prisma.telehealthSession.count({ where: { appointmentId: booked.appointmentId } }), 1);

    // reschedule: link unchanged, RESCHEDULED event keeps the telehealth block, window follows the new time
    const moved = new Date(start.getTime() + 60 * 60_000);
    const r = (await bookings.rescheduleByPatient(client, ref, { startsAt: moved.toISOString() })) as { telehealth?: { joinUrl: string; opensAt: string } };
    assert.equal(r.telehealth?.joinUrl, booked.telehealth!.joinUrl, "link unchanged after reschedule");
    assert.equal(new Date(r.telehealth!.opensAt).getTime(), moved.getTime() - 10 * 60_000);
    const ev = await prisma.outboxEvent.findFirstOrThrow({ where: { tenantId, type: "RESCHEDULED", aggregateId: booked.appointmentId } });
    assert.equal((ev.payload as { telehealth?: { joinUrl: string } }).telehealth?.joinUrl, booked.telehealth!.joinUrl);

    // cancel: session CANCELLED, event keeps the block
    await bookings.cancelByPatient(client, ref, { reason: "changed my mind" });
    assert.equal((await prisma.telehealthSession.findUniqueOrThrow({ where: { id: sessions[0]!.id } })).status, "CANCELLED");
    const cancelled = await prisma.outboxEvent.findFirstOrThrow({ where: { tenantId, type: "CANCELLED_BY_PATIENT", aggregateId: booked.appointmentId } });
    assert.equal((cancelled.payload as { telehealth?: { status: string } }).telehealth?.status, "CANCELLED");
  });

  it("flag OFF: a new telehealth booking is refused (403)", async () => {
    state.flagOn = false;
    try {
      const start = nextMondayUtc(8, 14);
      await assert.rejects(bookings.createBooking(client, `kx_th_off_${suffix}`, body(start, `kx_th_off_${suffix}`)), (e) => (e as { getStatus?: () => number }).getStatus?.() === 403);
    } finally {
      state.flagOn = true;
    }
  });
});
