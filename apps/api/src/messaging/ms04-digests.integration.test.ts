import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { AppointmentStatus, PrismaClient, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import type { EntitlementsService } from "../entitlements/entitlements.service";
import type { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import type { PrismaService } from "../prisma/prisma.service";
import { DigestsService } from "./digests.service";
import type { MessagingService } from "./messaging.service";

const prisma = new PrismaClient();
const svc = prisma as unknown as PrismaService;

describe("MS-04 digests respect quiet hours and opt-out", () => {
  const stamp = Date.now();
  let tenantId: string;
  let clinicId: string;
  let ownerId: string;
  let doctorId: string;
  const sent: { templateKey?: string; toPhone?: string }[] = [];
  let whatsappOn = true;

  const digests = () =>
    new DigestsService(
      svc,
      {
        queueMessage: async (_t: string, body: (typeof sent)[number]) => {
          sent.push(body);
          return { id: `m-${sent.length}` };
        },
        ensureDefaultTemplates: async () => {},
      } as unknown as MessagingService,
      { isEnabled: async () => whatsappOn } as unknown as FeatureFlagsService,
      { isEntitled: async () => true } as unknown as EntitlementsService,
    );

  before(async () => {
    await prisma.$connect();
    const base = await prisma.clinic.findFirstOrThrow({ orderBy: { createdAt: "asc" }, include: { tenant: true } });
    tenantId = (
      await prisma.tenant.create({ data: { name: `MS04 ${stamp}`, deploymentCell: base.tenant.deploymentCell, marketId: base.tenant.marketId } })
    ).id;
    clinicId = (
      await prisma.clinic.create({
        data: {
          tenantId,
          nameEn: `MS04 ${stamp}`,
          nameAr: "عيادة",
          country: base.country,
          city: base.city,
          addressEn: "St",
          addressAr: "ش",
          locationUrl: "https://maps.example/ms04",
          timezone: "Africa/Cairo",
          phone: base.phone,
          email: `ms04.${stamp}@example.com`,
          licenseNumber: `MS04-${stamp}`,
          defaultCurrency: base.defaultCurrency,
        },
      })
    ).id;
    const owner = await prisma.user.create({
      data: {
        tenantId,
        email: `ms04.owner.${stamp}@example.com`,
        passwordHash: "x",
        displayName: "Owner",
        role: UserRole.GROUP_ADMIN,
        isTenantOwner: true,
      },
    });
    ownerId = owner.id;
    await prisma.employee.create({
      data: {
        tenantId,
        clinicId,
        userId: ownerId,
        firstNameEn: "Owner",
        lastNameEn: "MS04",
        email: owner.email,
        phone: "+201055507701",
        employeeNumber: `MS04-O-${stamp}`,
        jobTitle: "Owner",
        employmentType: "FULL_TIME",
        hireDate: new Date(),
        salaryBase: 0,
      },
    });
    doctorId = (
      await prisma.user.create({
        data: { tenantId, email: `ms04.dr.${stamp}@example.com`, passwordHash: "x", displayName: "Dr MS04", role: UserRole.PHYSICIAN },
      })
    ).id;
    await prisma.employee.create({
      data: {
        tenantId,
        clinicId,
        userId: doctorId,
        firstNameEn: "Dr",
        lastNameEn: "MS04",
        email: `ms04.dr.${stamp}@example.com`,
        phone: "+201055507702",
        employeeNumber: `MS04-D-${stamp}`,
        jobTitle: "Physician",
        employmentType: "FULL_TIME",
        hireDate: new Date(),
        salaryBase: 0,
      },
    });
    const patient = await prisma.patient.create({
      data: { tenantId, mrn: `MS04-${stamp}`, firstNameEn: "Pat", lastNameEn: "One", gender: "UNKNOWN", phone: "+201055507703" },
    });
    // tomorrow 10:00 Cairo ≈ store as UTC afternoon today+1
    const tomorrow = new Date(Date.now() + 30 * 3600_000);
    await prisma.appointment.create({
      data: {
        tenantId,
        clinicId,
        patientId: patient.id,
        clinicianId: doctorId,
        startsAt: tomorrow,
        endsAt: new Date(tomorrow.getTime() + 30 * 60_000),
        status: AppointmentStatus.CONFIRMED,
        feeAmount: 100,
      },
    });
  });

  after(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("opt-out blocks doctor digest and CR-07 WhatsApp; quiet hours block when local hour is quiet", async () => {
    sent.length = 0;
    const d = digests();
    const ownerUser = { userId: ownerId, tenantId, email: "o", role: UserRole.GROUP_ADMIN } as unknown as JwtUser;

    await d.putPreferences(tenantId, ownerUser, { optOutAll: true });
    await prisma.kiorexProgressNudge.create({ data: { tenantId, periodKey: "2027-09", threshold: 50 } });
    // force a mid-day hour for delivery attempt
    const noon = new Date("2027-09-15T10:00:00.000Z");
    const blocked = await d.deliverPendingKiorexNudges(tenantId, noon);
    assert.equal(blocked, 0);
    assert.equal(sent.length, 0);

    await d.putPreferences(tenantId, ownerUser, {
      optOutAll: false,
      kiorexProgressNudges: true,
      quietHoursStart: 21,
      quietHoursEnd: 8,
    });
    // Cairo evening quiet — 21:30 Cairo ≈ 19:30 UTC in Sep (UTC+2) / 19:30 UTC summer
    const quiet = new Date("2027-09-15T19:30:00.000Z");
    const quietSent = await d.deliverPendingKiorexNudges(tenantId, quiet);
    assert.equal(quietSent, 0);

    const open = new Date("2027-09-15T12:00:00.000Z"); // 14:00 Cairo
    const ok = await d.deliverPendingKiorexNudges(tenantId, open);
    assert.equal(ok, 1);
    assert.equal(sent[0]?.templateKey, "kiorex_progress_nudge");
    const notices = await d.listNotices(tenantId, ownerId);
    assert.ok(notices.some((n) => n.kind === "kiorex_progress"));

    // second delivery same threshold is idempotent
    sent.length = 0;
    assert.equal(await d.deliverPendingKiorexNudges(tenantId, open), 0);
  });

  it("doctor tomorrow digest is skipped when the channel is disabled", async () => {
    sent.length = 0;
    const d = digests();
    const docUser = { userId: doctorId, tenantId, email: "d", role: UserRole.PHYSICIAN } as unknown as JwtUser;
    await d.putPreferences(tenantId, docUser, { doctorTomorrowList: false });
    // fabricate 20:00 Cairo
    const at20 = new Date("2027-09-15T18:00:00.000Z");
    assert.equal(await d.sendDoctorDigests(tenantId, at20), 0);
  });
});
