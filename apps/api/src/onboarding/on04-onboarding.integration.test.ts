import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { AppointmentStatus, PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { OnboardingService } from "./onboarding.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
const audit = new AuditService(prisma as unknown as PrismaService);
const onboarding = new OnboardingService(prisma as unknown as PrismaService, audit);

describe("ON-04 onboarding API service", () => {
  let tenantId: string;
  let userId: string;

  before(async () => {
    await prisma.$connect();
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const suffix = `${Date.now()}`;
    const tenant = await prisma.tenant.create({
      data: {
        name: `Onboarding ${suffix}`,
        deploymentCell: "frankfurt",
        marketId: market.id,
        clinics: {
          create: {
            nameEn: "Clinic",
            nameAr: "عيادة",
            country: "EG",
            city: "Cairo",
            addressEn: "Street",
            addressAr: "شارع",
            locationUrl: "https://maps.example/o",
            phone: "201000000001",
            email: `on04.${suffix}@example.com`,
            licenseNumber: "SELF-SERVE-PENDING",
            defaultCurrency: "EGP",
          },
        },
      },
      include: { clinics: true },
    });
    tenantId = tenant.id;
    const user = await prisma.user.create({
      data: {
        tenantId,
        email: `on04.${suffix}@example.com`,
        passwordHash: bcrypt.hashSync("demo", 10),
        displayName: "Dr On04",
        role: "PHYSICIAN",
        isTenantOwner: true,
      },
    });
    userId = user.id;
    await prisma.onboardingProgress.create({ data: { tenantId, stepsJson: {} } });
  });

  after(async () => {
    if (tenantId) {
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("GET progress returns required steps and blocks skip on required", async () => {
    const dto = await onboarding.getOrCreate(tenantId);
    assert.ok(dto.steps.length >= 6);
    assert.equal(dto.completedAt, null);
    await assert.rejects(() => onboarding.patchStep(tenantId, userId, "first_appointment", "skip"));
  });

  it("optional step can be skipped and appointment activates CR-01", async () => {
    await onboarding.patchStep(tenantId, userId, "invite_receptionist", "skip");
    const clinic = await prisma.clinic.findFirstOrThrow({ where: { tenantId } });
    await prisma.appointment.create({
      data: {
        tenantId,
        clinicId: clinic.id,
        patientId: (
          await prisma.patient.create({
            data: {
              tenantId,
              mrn: `MRN-${tenantId.slice(-8)}`,
              firstNameEn: "Test",
              lastNameEn: "Patient",
              gender: "UNKNOWN",
              phone: "201011111111",
            },
          })
        ).id,
        clinicianId: userId,
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 3_600_000),
        status: AppointmentStatus.CHECKED_IN,
      },
    });
    const dto = await onboarding.getOrCreate(tenantId);
    assert.ok(dto.activatedAt);
    assert.ok(dto.steps.find((s) => s.key === "first_check_in")?.status === "done");
  });

  it("a step is never ticked by hand; skipping needs a role that can do it and (per-clinic steps) a clinic of the organisation", async () => {
    await assert.rejects(() => onboarding.patchStep(tenantId, userId, "clinic_logo", "complete", undefined), /completes automatically/);
    const clinic = await prisma.clinic.findFirstOrThrow({ where: { tenantId } });
    await assert.rejects(() => onboarding.patchStep(tenantId, userId, "clinic_logo", "skip"), /entityId/);
    await assert.rejects(() => onboarding.patchStep(tenantId, userId, "clinic_logo", "skip", "not-a-clinic"), /Clinic not found/);
    await assert.rejects(
      () => onboarding.patchStep(tenantId, userId, "whatsapp_reminders", "skip", undefined, { isOwner: false, roles: ["receptionist"] }),
      /ask the owner/,
    );
    const dto = await onboarding.patchStep(tenantId, userId, "clinic_logo", "skip", clinic.id, { isOwner: true, roles: [] });
    const logo = dto.steps.find((x) => x.key === "clinic_logo")!;
    assert.equal(logo.status, "skipped");
    assert.equal(logo.entities?.[0]?.status, "skipped");
  });

  it("a second clinic reopens the per-clinic steps; dismissal needs everything done and is forgotten when new work appears", async () => {
    const first = await onboarding.getOrCreate(tenantId);
    const before = first.steps.find((x) => x.key === "working_hours")!;
    assert.equal(before.totalCount, 1);
    const base = await prisma.clinic.findFirstOrThrow({ where: { tenantId } });
    await prisma.clinic.create({
      data: { tenantId, nameEn: "Second", nameAr: "الثانية", country: "EG", city: "Cairo", addressEn: "x", addressAr: "x", locationUrl: base.locationUrl, phone: base.phone, email: `second.${Date.now()}@example.com`, licenseNumber: "L-2", defaultCurrency: "EGP" },
    });
    const after = await onboarding.getOrCreate(tenantId);
    const hours = after.steps.find((x) => x.key === "working_hours")!;
    assert.equal(hours.totalCount, 2);
    assert.equal(hours.entities?.length, 2);
    assert.equal(hours.status, "pending");
    assert.match(hours.href, /entity=/);
    await assert.rejects(() => onboarding.dismiss(tenantId, userId, { isOwner: true, roles: [] }), /once every step is done or skipped/);
  });
});
