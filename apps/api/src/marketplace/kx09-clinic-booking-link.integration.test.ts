import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  AppointmentStatus,
  BookingSource,
  FeeType,
  Gender,
  ListingStatus,
  PrismaClient,
  UserRole,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { AppointmentOutboxService } from "../messaging/appointment-outbox.service";
import { AuditService } from "../audit/audit.service";
import { AppointmentsService } from "../appointments/appointments.service";
import { ConsentPolicyService } from "../compliance/consent-policy.service";
import { SlotService } from "../scheduling/slot.service";
import { NewPatientService } from "../patients/new-patient.service";
import { CreditWalletService } from "../credits/credit-wallet.service";
import { KiorexCommissionService } from "../kiorex/kiorex-commission.service";
import { CommissionChargeService } from "../kiorex/commission-charge.service";
import type { JwtUser } from "../auth/jwt-user";
import { MarketplaceBookingService } from "./marketplace-booking.service";
import { MarketplacePatientIntakeService } from "./marketplace-patient-intake.service";
import { MarketplaceAccessService } from "./marketplace-access.service";
import { MarketplaceListingService } from "./marketplace-listing.service";
import { ClinicBookingPageService } from "./clinic-booking-page.service";
import type { PlatformIntegrationPrincipal } from "./platform-integration-client.service";

const prisma = new PrismaClient();
const prismaSvc = prisma as unknown as PrismaService;
const audit = new AuditService(prismaSvc);
const outbox = new OutboxEventService(prismaSvc);
const slots = new SlotService(prismaSvc, outbox);
const bookings = new MarketplaceBookingService(
  prismaSvc,
  new MarketplaceAccessService(prismaSvc),
  new MarketplacePatientIntakeService(prismaSvc),
  {} as AppointmentsService,
  new ConsentPolicyService(prismaSvc, audit),
  audit,
  outbox,
  new AppointmentOutboxService(outbox),
  slots,
  new NewPatientService(prismaSvc),
  { notifyKiorexBooking: async () => ({ queued: 0 }) } as never,
);
const pages = new ClinicBookingPageService(prismaSvc, {
  assertClinicManage(user: JwtUser, tenantId: string) {
    if (user.tenantId !== tenantId) throw new Error("forbidden");
  },
} as unknown as MarketplaceListingService, audit);
const charges = new CommissionChargeService(
  prismaSvc,
  new KiorexCommissionService(prismaSvc),
  outbox,
  new CreditWalletService(prismaSvc),
);

describe("KX-09 clinic-branded booking link (commission-free)", () => {
  const suffix = `${Date.now()}`;
  let marketId: string;
  let rateId: string;
  let tenantId: string;
  let clinicId: string;
  let otherClinicId: string;
  let physicianId: string;
  let typeId: string;
  let client: PlatformIntegrationPrincipal;
  let admin: JwtUser;

  before(async () => {
    await prisma.$connect();
    const market = await prisma.market.create({
      data: {
        code: `KX9${suffix}`.slice(0, 12),
        nameEn: `KX09 market ${suffix}`,
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
    rateId = (
      await prisma.kiorexCommissionRate.create({
        data: { marketId, feeType: FeeType.FLAT, amount: 75, validFrom: new Date("2020-01-01") },
      })
    ).id;
    client = await prisma.platformIntegrationClient.create({
      data: { name: `Kx09 ${suffix}`, clientKey: `plt_kx09_${suffix}`, secretHash: "x", scopes: ["MARKETPLACE"] },
    });
    const tenant = await prisma.tenant.create({
      data: { name: `Kx09 ${suffix}`, deploymentCell: "frankfurt", marketId, baseCurrency: "EGP" },
    });
    tenantId = tenant.id;
    const clinicData = (n: string) => ({
      tenantId,
      nameEn: `Nile Smile ${n} ${suffix}`,
      nameAr: "عيادة",
      country: "EG",
      city: "Cairo",
      addressEn: "Street",
      addressAr: "شارع",
      locationUrl: "https://maps.example/kx09",
      timezone: "Africa/Cairo",
      phone: "201000000090",
      email: `kx09.${n}.${suffix}@example.com`,
      licenseNumber: "EG-KX09",
      defaultCurrency: "EGP",
      marketplaceBookingAutoConfirm: true,
      logoUrl: "https://cdn.example/logo.png",
    });
    clinicId = (await prisma.clinic.create({ data: clinicData("a") })).id;
    otherClinicId = (await prisma.clinic.create({ data: clinicData("b") })).id;
    const physician = await prisma.user.create({
      data: {
        tenantId,
        email: `kx09.dr.${suffix}@example.com`,
        passwordHash: "x",
        displayName: "Dr Kx09",
        role: UserRole.PHYSICIAN,
      },
    });
    physicianId = physician.id;
    admin = { userId: physicianId, tenantId, role: UserRole.CLINIC_ADMIN, roles: [UserRole.CLINIC_ADMIN] } as unknown as JwtUser;
    typeId = (
      await prisma.appointmentType.create({
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
      })
    ).id;
    await prisma.marketplaceListing.create({
      data: {
        tenantId,
        clinicId,
        clinicianId: physicianId,
        status: ListingStatus.LIVE,
        profileJson: { displayNameEn: "Dr Ahmed Kx", displayNameAr: "د. أحمد" },
      },
    });
  });

  after(async () => {
    await prisma.kiorexCommissionCharge.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.appointment.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.kiorexCommissionRate.delete({ where: { id: rateId } }).catch(() => undefined);
    await prisma.market.delete({ where: { id: marketId } }).catch(() => undefined);
    await prisma.platformIntegrationClient.delete({ where: { id: client.id } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  const book = (key: string, startsAt: string, phone: string, extra: Record<string, unknown> = {}) =>
    bookings.createBooking(client, key, {
      clinicId,
      clinicianId: physicianId,
      typeId,
      startsAt,
      patient: { phone, firstNameEn: "New", lastNameEn: "Patient", gender: Gender.M },
      marketplaceConsentGranted: true,
      ...extra,
    });

  async function checkIn(appointmentId: string, at: Date) {
    await prisma.$transaction(async (tx) => {
      await tx.appointment.update({
        where: { id: appointmentId },
        data: { status: AppointmentStatus.CHECKED_IN, checkedInAt: at },
      });
      await charges.onCheckIn(tx, tenantId, appointmentId, at);
    });
  }

  it("every clinic and LIVE doctor gets a slug and a shareable link", async () => {
    const link = await pages.getForClinic(admin, clinicId);
    assert.match(link.slug, /^nile-smile-a-/);
    assert.ok(link.url.endsWith(`/${link.slug}`));
    assert.equal(link.commissionFree, true);
    assert.equal(link.doctors.length, 1);
    assert.match(link.doctors[0]!.slug, /^dr-ahmed-kx/);
    const again = await pages.getForClinic(admin, clinicId);
    assert.equal(again.slug, link.slug);
  });

  it("public page returns branding, LIVE doctors and bookable types (no auth)", async () => {
    const link = await pages.getForClinic(admin, clinicId);
    const page = await pages.publicPage(link.slug);
    assert.equal(page.channel, "CLINIC_LINK");
    assert.equal(page.clinic.id, clinicId);
    assert.equal(page.clinic.logoUrl, "https://cdn.example/logo.png");
    assert.equal(page.doctors.length, 1);
    assert.equal(page.doctors[0]!.nameAr, "د. أحمد");
    assert.deepEqual(page.appointmentTypes.map((t) => t.id), [typeId]);

    const doctorPage = await pages.publicPage(link.doctors[0]!.slug);
    assert.equal(doctorPage.doctors.length, 1);
    assert.equal(doctorPage.doctors[0]!.clinicianId, physicianId);

    await assert.rejects(pages.publicPage("no-such-page-kx09"), { status: 404 });
  });

  it("custom slug: validated, unique across clinics and doctors, audited", async () => {
    const custom = `smile-${suffix}`;
    const updated = await pages.updateSlug(admin, { clinicId, slug: custom });
    assert.equal(updated.slug, custom);
    await assert.rejects(pages.updateSlug(admin, { clinicId: otherClinicId, slug: custom }), { status: 409 });
    await assert.rejects(pages.updateSlug(admin, { clinicId, slug: "Bad Slug!" }), { status: 400 });
    const auditRow = await prisma.auditLog.findFirst({
      where: { tenantId, action: "kiorex.booking_link.slug_updated", resourceId: clinicId },
    });
    assert.ok(auditRow);
  });

  it("bookings via the link never create commission charges; marketplace control does", async () => {
    const link = await pages.getForClinic(admin, clinicId);
    const viaLink = await book(`KX09-${suffix}-link`, "2026-08-03T06:00:00.000Z", `+2010${suffix.slice(-8)}`, {
      channel: "CLINIC_LINK",
      bookingPageSlug: link.slug,
    });
    const viaMarketplace = await book(`KX09-${suffix}-mkt`, "2026-08-03T07:00:00.000Z", `+2012${suffix.slice(-8)}`);

    const linkRow = await prisma.appointment.findUniqueOrThrow({ where: { id: viaLink.appointmentId } });
    const mktRow = await prisma.appointment.findUniqueOrThrow({ where: { id: viaMarketplace.appointmentId } });
    assert.equal(linkRow.bookingSource, BookingSource.CLINIC_LINK);
    assert.equal(mktRow.bookingSource, BookingSource.KIOREX_MARKETPLACE);
    assert.equal(linkRow.isNewPatientAtBooking, true);
    assert.equal(mktRow.isNewPatientAtBooking, true);
    assert.equal((linkRow.attributionJson as { bookingPageSlug?: string }).bookingPageSlug, link.slug);

    await checkIn(linkRow.id, new Date("2026-08-03T06:05:00.000Z"));
    await checkIn(mktRow.id, new Date("2026-08-03T07:05:00.000Z"));

    assert.equal(await prisma.kiorexCommissionCharge.count({ where: { appointmentId: linkRow.id } }), 0);
    const control = await prisma.kiorexCommissionCharge.findUnique({ where: { appointmentId: mktRow.id } });
    assert.ok(control, "marketplace control booking should be commissioned");
    assert.equal(control.amount.toFixed(2), "75.00");
  });

  it("a CLINIC_LINK booking naming another clinic's page is rejected", async () => {
    const other = await pages.getForClinic(admin, otherClinicId);
    await assert.rejects(
      book(`KX09-${suffix}-bad`, "2026-08-03T08:00:00.000Z", `+2015${suffix.slice(-8)}`, {
        channel: "CLINIC_LINK",
        bookingPageSlug: other.slug,
      }),
      (e: { response?: { code?: string } }) => e.response?.code === "BOOKING_PAGE_MISMATCH",
    );
  });
});
