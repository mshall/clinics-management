import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  AppointmentStatus,
  BillingInterval,
  BookingSource,
  Gender,
  ListingStatus,
  PlanKey,
  PrismaClient,
  SubscriptionStatus,
  UserRole,
} from "@prisma/client";
import { BadRequestException, UnprocessableEntityException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import type { PrismaService } from "../prisma/prisma.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { AppointmentOutboxService } from "../messaging/appointment-outbox.service";
import { OUTBOX_EVENT } from "../messaging/outbox-event-types";
import { AuditService } from "../audit/audit.service";
import { AppointmentsService } from "../appointments/appointments.service";
import { ConsentPolicyService } from "../compliance/consent-policy.service";
import { SlotService } from "../scheduling/slot.service";
import type { JwtUser } from "../auth/jwt-user";
import { MarketplaceBookingService } from "./marketplace-booking.service";
import { NewPatientService } from "../patients/new-patient.service";
import { MarketplacePatientIntakeService } from "./marketplace-patient-intake.service";
import { MarketplaceAccessService } from "./marketplace-access.service";
import { MarketplaceListingService } from "./marketplace-listing.service";
import { KiorexSettingsService } from "./kiorex-settings.service";
import type { PlatformIntegrationPrincipal } from "./platform-integration-client.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
const prismaSvc = prisma as unknown as PrismaService;
const audit = new AuditService(prismaSvc);
const outbox = new OutboxEventService(prismaSvc);
const appointmentOutbox = new AppointmentOutboxService(outbox);
const slots = new SlotService(prismaSvc, outbox);
const access = new MarketplaceAccessService(prismaSvc);
const bookings = new MarketplaceBookingService(
  prismaSvc,
  access,
  new MarketplacePatientIntakeService(prismaSvc),
  {} as AppointmentsService,
  new ConsentPolicyService(prismaSvc, audit),
  audit,
  outbox,
  appointmentOutbox,
  slots,
  new NewPatientService(prismaSvc),
  { notifyKiorexBooking: async () => ({ queued: 0 }) } as never,
);
const appointments = new AppointmentsService(
  prismaSvc,
  { recordFreedSlot: async () => null } as never,
  {} as never,
  { isEnabled: async () => false } as never,
  {} as never,
  {} as never,
  { onCancelOrNoShow: async () => null, applyCreditIntents: async () => undefined } as never,
  slots,
  appointmentOutbox,
  { isEntitled: async () => false } as never,
  { settleAppointmentDepositsTx: async () => ({ outcome: "WAIT", settled: 0 }) } as never,
);
const settings = new KiorexSettingsService(prismaSvc, new MarketplaceListingService(prismaSvc, outbox), audit, slots);

const now = new Date("2027-03-01T08:00:00.000Z");
const at = (hours: number) => new Date(now.getTime() + hours * 3_600_000);

describe("KX-06 reschedule & cancellation policies", () => {
  const suffix = `${Date.now()}`;
  let tenantId: string;
  let clinicId: string;
  let physicianId: string;
  let patientId: string;
  let typeId: string;
  let owner: JwtUser;
  let client: PlatformIntegrationPrincipal;
  let seq = 0;

  async function booking(hoursAhead: number, extra: Record<string, unknown> = {}) {
    seq += 1;
    const startsAt = at(hoursAhead);
    const ref = `KX06-${suffix}-${seq}`;
    await prisma.appointment.create({
      data: {
        tenantId,
        clinicId,
        patientId,
        clinicianId: physicianId,
        appointmentTypeId: typeId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        status: AppointmentStatus.CONFIRMED,
        bookingSource: BookingSource.KIOREX_MARKETPLACE,
        platformIntegrationClientId: client.id,
        externalReference: ref,
        ...extra,
      },
    });
    return ref;
  }

  const byRef = (ref: string) => prisma.appointment.findFirstOrThrow({ where: { externalReference: ref } });
  const lastEvent = (appointmentId: string) =>
    prisma.outboxEvent.findFirst({ where: { tenantId, aggregateId: appointmentId }, orderBy: { createdAt: "desc" } });

  before(async () => {
    await prisma.$connect();
    client = await prisma.platformIntegrationClient.create({
      data: { name: `Kx06 ${suffix}`, clientKey: `plt_kx06_${suffix}`, secretHash: "x", scopes: ["MARKETPLACE"] },
    });
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const plan = await prisma.plan.findFirstOrThrow({ where: { key: PlanKey.PRO } });
    const tenant = await prisma.tenant.create({
      data: { name: `Kx06 ${suffix}`, deploymentCell: "frankfurt", marketId: market.id },
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
        locationUrl: "https://maps.example/kx06",
        timezone: "Africa/Cairo",
        phone: "201000000060",
        email: `kx06.${suffix}@example.com`,
        licenseNumber: "EG-KX06",
        defaultCurrency: "EGP",
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
        email: `kx06.dr.${suffix}@example.com`,
        passwordHash: bcrypt.hashSync("demo", 4),
        displayName: "Dr Kx06",
        role: UserRole.PHYSICIAN,
      },
    });
    physicianId = physician.id;
    const ownerRow = await prisma.user.create({
      data: {
        tenantId,
        email: `kx06.owner.${suffix}@example.com`,
        passwordHash: bcrypt.hashSync("demo", 4),
        displayName: "Owner Kx06",
        role: UserRole.GROUP_ADMIN,
      },
    });
    owner = { userId: ownerRow.id, tenantId, email: ownerRow.email, role: UserRole.GROUP_ADMIN };
    const patient = await prisma.patient.create({
      data: {
        tenantId,
        mrn: `KX06-${suffix}`,
        firstNameEn: "Sara",
        lastNameEn: "Test",
        gender: Gender.F,
        phone: `+2012${String(Date.now()).slice(-8)}`,
      },
    });
    patientId = patient.id;
    const type = await prisma.appointmentType.create({
      data: {
        tenantId,
        clinicId,
        nameEn: "Visit",
        nameAr: "كشف",
        durationMinutes: 30,
        feeAmount: 300,
        depositAmount: 100,
        marketplaceBookable: true,
        minNoticeMinutes: 0,
        maxDaysAhead: 60,
      },
    });
    typeId = type.id;
    await prisma.marketplaceListing.create({
      data: { tenantId, clinicId, clinicianId: physicianId, status: ListingStatus.LIVE, profileJson: {} },
    });
  });

  after(async () => {
    await prisma.outboxEvent.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.appointment.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.marketplaceListing.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.appointmentType.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.patient.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.subscription.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.clinic.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.platformIntegrationClient.delete({ where: { id: client.id } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("rejects a patient cancel inside the window and audits the rejection", async () => {
    const ref = await booking(6);
    await assert.rejects(
      () => bookings.cancelByPatient(client, ref, {}, now),
      (e: unknown) =>
        e instanceof UnprocessableEntityException &&
        (e.getResponse() as { code: string }).code === "CANCELLATION_WINDOW_CLOSED",
    );
    const row = await byRef(ref);
    assert.equal(row.status, AppointmentStatus.CONFIRMED);
    const rejected = await prisma.auditLog.count({
      where: { tenantId, resourceId: row.id, action: "marketplace.booking.cancel_rejected" },
    });
    assert.equal(rejected, 1);
  });

  it("patient cancel before the refund cutoff refunds the deposit and notifies Kiorex", async () => {
    const ref = await booking(48);
    const res = await bookings.cancelByPatient(client, ref, { reason: "Travelling" }, now);
    assert.equal(res.status, AppointmentStatus.CANCELLED);
    assert.equal(res.depositRefundable, true);
    const row = await byRef(ref);
    assert.equal(row.cancelledBy, "PATIENT");
    assert.equal(row.cancellationReason, "Travelling");
    const evt = await lastEvent(row.id);
    assert.equal(evt?.type, OUTBOX_EVENT.CANCELLED_BY_PATIENT);
    assert.equal((evt?.payload as { depositRefundable?: boolean }).depositRefundable, true);
    const audited = await prisma.auditLog.findFirst({
      where: { tenantId, resourceId: row.id, action: "marketplace.booking.cancelled_by_patient" },
    });
    assert.equal((audited?.metadata as { reason?: string }).reason, "Travelling");
  });

  it("patient cancel after the refund cutoff keeps the deposit", async () => {
    const ref = await booking(18);
    const res = await bookings.cancelByPatient(client, ref, {}, now);
    assert.equal(res.depositRefundable, false);
    assert.equal((await byRef(ref)).depositRefundable, false);
  });

  it("clinic policy override (Kiorex tab) is enforced server-side", async () => {
    const ref = await booking(5);
    await settings.put(owner, { clinicId, cancellationPolicy: { patientCancelMinHours: 2 } });
    const view = await settings.get(owner, clinicId);
    assert.equal(view.cancellationPolicy.effective.patientCancelMinHours, 2);
    const res = await bookings.cancelByPatient(client, ref, {}, now);
    assert.equal(res.status, AppointmentStatus.CANCELLED);
    await assert.rejects(
      () => settings.put(owner, { clinicId, cancellationPolicy: { patientCancelMinHours: -5 } }),
      BadRequestException,
    );
    await settings.put(owner, { clinicId, cancellationPolicy: null });
    assert.equal((await settings.get(owner, clinicId)).cancellationPolicy.override, null);
  });

  it("patient reschedule moves the booking, counts it and emits RESCHEDULED", async () => {
    const ref = await booking(30);
    const target = at(54);
    const res = await bookings.rescheduleByPatient(client, ref, { startsAt: target.toISOString() }, now);
    assert.equal(res.startsAt, target.toISOString());
    const row = await byRef(ref);
    assert.equal(row.rescheduleCount, 1);
    assert.equal((await lastEvent(row.id))?.type, OUTBOX_EVENT.APPOINTMENT_RESCHEDULED);
  });

  it("patient reschedule is refused inside the window or past the reschedule limit", async () => {
    const late = await booking(3);
    await assert.rejects(
      () => bookings.rescheduleByPatient(client, late, { startsAt: at(80).toISOString() }, now),
      (e: unknown) =>
        e instanceof UnprocessableEntityException &&
        (e.getResponse() as { code: string }).code === "RESCHEDULE_WINDOW_CLOSED",
    );
    const maxed = await booking(40, { rescheduleCount: 2 });
    await assert.rejects(
      () => bookings.rescheduleByPatient(client, maxed, { startsAt: at(90).toISOString() }, now),
      (e: unknown) =>
        e instanceof UnprocessableEntityException &&
        (e.getResponse() as { code: string }).code === "RESCHEDULE_LIMIT_REACHED",
    );
  });

  it("clinic cancel of a Kiorex booking requires a reason, refunds and tells the patient why", async () => {
    const ref = await booking(4);
    const row = await byRef(ref);
    await assert.rejects(
      () => appointments.updateStatus(tenantId, row.id, AppointmentStatus.CANCELLED, owner),
      BadRequestException,
    );
    assert.equal((await byRef(ref)).status, AppointmentStatus.CONFIRMED);
    const dto = await appointments.updateStatus(tenantId, row.id, AppointmentStatus.CANCELLED, owner, "Doctor is ill");
    assert.equal(dto.cancelledBy, "CLINIC");
    assert.equal(dto.cancellationReason, "Doctor is ill");
    const saved = await byRef(ref);
    assert.equal(saved.depositRefundable, true);
    const evt = await lastEvent(row.id);
    assert.equal(evt?.type, OUTBOX_EVENT.CANCELLED_BY_CLINIC);
    const payload = evt?.payload as { cancellationReason?: string; depositRefundable?: boolean };
    assert.equal(payload.cancellationReason, "Doctor is ill");
    assert.equal(payload.depositRefundable, true);
    const audited = await prisma.auditLog.findFirst({
      where: { tenantId, resourceId: row.id, action: "appointment.cancelled_by_clinic" },
    });
    assert.equal(audited?.actorId, owner.userId);
    assert.equal((audited?.metadata as { reason?: string }).reason, "Doctor is ill");
  });

  it("front-desk bookings can still be cancelled without a reason", async () => {
    seq += 1;
    const row = await prisma.appointment.create({
      data: {
        tenantId,
        clinicId,
        patientId,
        clinicianId: physicianId,
        startsAt: at(200),
        status: AppointmentStatus.SCHEDULED,
        bookingSource: BookingSource.FRONT_DESK,
      },
    });
    const dto = await appointments.update(tenantId, row.id, { status: AppointmentStatus.CANCELLED }, owner);
    assert.equal(dto.status, AppointmentStatus.CANCELLED);
  });
});
