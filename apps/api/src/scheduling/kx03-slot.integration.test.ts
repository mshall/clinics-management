import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { AppointmentStatus, Gender, PrismaClient, UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { SlotService } from "./slot.service";
import { SLOT_CHANNEL, SLOTS_CHANGED_TOPIC } from "./slot-channel";
import { emptyAvailabilityWeek } from "./availability-week-schema";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
const outbox = new OutboxEventService(prisma as unknown as PrismaService);
const slots = new SlotService(prisma as unknown as PrismaService, outbox);

describe("KX-03 SlotService integration", () => {
  let tenantId: string;
  let clinicId: string;
  let physicianId: string;
  let typeId: string;
  const suffix = `${Date.now()}`;

  before(async () => {
    await prisma.$connect();
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const tenant = await prisma.tenant.create({
      data: {
        name: `Kx03 ${suffix}`,
        deploymentCell: "frankfurt",
        marketId: market.id,
      },
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
        locationUrl: "https://maps.example/kx03",
        timezone: "Africa/Cairo",
        phone: "201000000030",
        email: `kx03.${suffix}@example.com`,
        licenseNumber: "EG-KX03",
        defaultCurrency: "EGP",
      },
    });
    clinicId = clinic.id;
    const physician = await prisma.user.create({
      data: {
        tenantId,
        email: `kx03.dr.${suffix}@example.com`,
        passwordHash: bcrypt.hashSync("demo", 10),
        displayName: "Dr Kx03",
        role: UserRole.PHYSICIAN,
      },
    });
    physicianId = physician.id;
    const week = emptyAvailabilityWeek("Africa/Cairo");
    week.days[1]!.slots.push({ start: "09:00", end: "12:00" });
    await prisma.clinicianAvailabilityTemplate.create({
      data: {
        tenantId,
        clinicId,
        clinicianId: physicianId,
        weekJson: week,
        marketplaceDailyCap: 5,
      },
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
        maxDaysAhead: 30,
        isActive: true,
      },
    });
    typeId = type.id;
  });

  after(async () => {
    await prisma.outboxEvent.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.appointment.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.appointmentType.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.clinicianAvailabilityTemplate.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.clinic.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("returns bookable slots and excludes existing appointment", async () => {
    const from = new Date("2026-07-06T00:00:00.000Z");
    const to = new Date("2026-07-07T00:00:00.000Z");
    const before = await slots.getSlots({
      tenantId,
      clinicId,
      clinicianId: physicianId,
      typeId,
      from,
      to,
      channel: SLOT_CHANNEL.INTERNAL,
    });
    assert.ok(before.slots.length >= 2);
    const booked = before.slots[1]!;
    await prisma.appointment.create({
      data: {
        tenantId,
        clinicId,
        clinicianId: physicianId,
        patientId: (
          await prisma.patient.create({
            data: {
              tenantId,
              mrn: `MRN-${suffix}`,
              firstNameEn: "P",
              lastNameEn: "Test",
              gender: Gender.M,
              phone: "201000000031",
            },
          })
        ).id,
        appointmentTypeId: typeId,
        startsAt: new Date(booked.startsAt),
        endsAt: new Date(booked.endsAt),
        feeAmount: 300,
        status: AppointmentStatus.SCHEDULED,
      },
    });
    await slots.invalidateAndNotify(tenantId, clinicId, physicianId, "test");
    const after = await slots.getSlots({
      tenantId,
      clinicId,
      clinicianId: physicianId,
      typeId,
      from,
      to,
      channel: SLOT_CHANNEL.INTERNAL,
    });
    assert.ok(!after.slots.some((s) => s.startsAt === booked.startsAt));
    const evt = await prisma.outboxEvent.findFirst({
      where: { tenantId, type: SLOTS_CHANGED_TOPIC },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(evt);
  });
});