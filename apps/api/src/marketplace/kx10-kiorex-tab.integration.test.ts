import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  AppointmentStatus,
  BillingInterval,
  BookingSource,
  CommissionChargeStatus,
  FeeType,
  Gender,
  ListingStatus,
  PlanKey,
  PrismaClient,
  SubscriptionStatus,
  UserRole,
  VerificationStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { AuditService } from "../audit/audit.service";
import { SlotService } from "../scheduling/slot.service";
import { CreditWalletService } from "../credits/credit-wallet.service";
import { KiorexCommissionService } from "../kiorex/kiorex-commission.service";
import { CommissionChargeService } from "../kiorex/commission-charge.service";
import { KiorexProgressService } from "../billing-platform/kiorex-progress.service";
import { SettlementService } from "../billing-platform/settlement.service";
import { KiorlyInvoicesService } from "../billing-platform/kiorly-invoices.service";
import { PaymentGatewayRegistry } from "../billing-platform/payment-gateways/payment-gateway.registry";
import { KiorlyPaymentMethodsService } from "../billing-platform/kiorly-payment-methods.service";
import { KiorlyPaymentService } from "../billing-platform/kiorly-payment.service";
import { emptyAvailabilityWeek } from "../scheduling/availability-week-schema";
import type { JwtUser } from "../auth/jwt-user";
import { MarketplaceAccessService } from "./marketplace-access.service";
import { MarketplaceListingService } from "./marketplace-listing.service";
import { KiorexOverviewService } from "./kiorex-overview.service";
import { KiorexSettingsService } from "./kiorex-settings.service";
import type { PlatformIntegrationPrincipal } from "./platform-integration-client.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
const prismaSvc = prisma as unknown as PrismaService;
const audit = new AuditService(prismaSvc);
const outbox = new OutboxEventService(prismaSvc);
const slots = new SlotService(prismaSvc, outbox);
const listings = new MarketplaceListingService(prismaSvc, outbox);
const creditWallet = new CreditWalletService(prismaSvc);
const gateways = new PaymentGatewayRegistry();
const kiorlyPayments = new KiorlyPaymentService(
  prismaSvc,
  gateways,
  new KiorlyPaymentMethodsService(prismaSvc, gateways),
  { reconcileAfterPayment: async () => {} } as unknown as import("../subscriptions/dunning.service").DunningService,
  { tryOnInvoiceFullyPaid: async () => {} } as unknown as import("../growth/referral-reward.service").ReferralRewardService,
);
const settlement = new SettlementService(prismaSvc, new KiorlyInvoicesService(prismaSvc, creditWallet, kiorlyPayments));
const progress = new KiorexProgressService(prismaSvc, settlement);
const overview = new KiorexOverviewService(prismaSvc, new MarketplaceAccessService(prismaSvc), listings, progress);
const settings = new KiorexSettingsService(prismaSvc, listings, audit, slots);
const charges = new CommissionChargeService(prismaSvc, new KiorexCommissionService(prismaSvc), outbox, creditWallet);

describe("KX-10 Kiorex tab (settings + performance)", () => {
  const suffix = `${Date.now()}`;
  const period = "2026-07";
  let marketId: string;
  let rateId: string;
  let tenantId: string;
  let clinicId: string;
  let physicianId: string;
  let listingId: string;
  let typeId: string;
  let admin: JwtUser;
  let client: PlatformIntegrationPrincipal;

  before(async () => {
    await prisma.$connect();
    const market = await prisma.market.create({
      data: {
        code: `KXT${suffix}`.slice(0, 12),
        nameEn: `KX10 market ${suffix}`,
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
        data: { marketId, feeType: FeeType.FLAT, amount: 60, validFrom: new Date("2020-01-01") },
      })
    ).id;
    client = await prisma.platformIntegrationClient.create({
      data: { name: `Kx10 ${suffix}`, clientKey: `plt_kx10_${suffix}`, secretHash: "x", scopes: ["MARKETPLACE"] },
    });
    tenantId = (
      await prisma.tenant.create({ data: { name: `Kx10 ${suffix}`, deploymentCell: "frankfurt", marketId, baseCurrency: "EGP" } })
    ).id;
    const plan = await prisma.plan.findFirstOrThrow({ where: { key: PlanKey.PRO } });
    await prisma.subscription.create({
      data: {
        tenantId,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        interval: BillingInterval.MONTHLY,
        clinicianSeats: 1,
        currentPeriodStart: new Date("2026-07-01"),
        currentPeriodEnd: new Date("2026-08-01"),
      },
    });
    clinicId = (
      await prisma.clinic.create({
        data: {
          tenantId,
          nameEn: "Kx10 clinic",
          nameAr: "عيادة",
          country: "EG",
          city: "Cairo",
          addressEn: "Street",
          addressAr: "شارع",
          locationUrl: "https://maps.example/kx10",
          timezone: "Africa/Cairo",
          phone: "201000000100",
          email: `kx10.${suffix}@example.com`,
          licenseNumber: "EG-KX10",
          defaultCurrency: "EGP",
        },
      })
    ).id;
    physicianId = (
      await prisma.user.create({
        data: { tenantId, email: `kx10.dr.${suffix}@example.com`, passwordHash: "x", displayName: "Dr Kx10", role: UserRole.PHYSICIAN },
      })
    ).id;
    const owner = await prisma.user.create({
      data: { tenantId, email: `kx10.owner.${suffix}@example.com`, passwordHash: "x", displayName: "Owner", role: UserRole.CLINIC_ADMIN },
    });
    admin = { userId: owner.id, tenantId, email: owner.email, role: UserRole.CLINIC_ADMIN };
    await prisma.clinicianVerification.create({
      data: {
        userId: physicianId,
        tenantId,
        status: VerificationStatus.VERIFIED,
        specialty: "GENERAL_MEDICINE",
        verifiedSpecialty: "GENERAL_MEDICINE",
        syndicateNumber: "SYND-KX10",
        documentKeys: [],
      },
    });
    const week = emptyAvailabilityWeek("Africa/Cairo");
    week.days[1]!.slots.push({ start: "09:00", end: "17:00" });
    await prisma.clinicianAvailabilityTemplate.create({ data: { tenantId, clinicId, clinicianId: physicianId, weekJson: week } });
    typeId = (
      await prisma.appointmentType.create({
        data: { tenantId, clinicId, nameEn: "Visit", nameAr: "كشف", durationMinutes: 30, feeAmount: 300, marketplaceBookable: true },
      })
    ).id;
    listingId = (
      await prisma.marketplaceListing.create({
        data: { tenantId, clinicId, clinicianId: physicianId, status: ListingStatus.LIVE, profileJson: {} },
      })
    ).id;
  });

  after(async () => {
    await prisma.kiorexCommissionCharge.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.kiorexCommissionRate.delete({ where: { id: rateId } }).catch(() => undefined);
    await prisma.market.delete({ where: { id: marketId } }).catch(() => undefined);
    await prisma.platformIntegrationClient.delete({ where: { id: client.id } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  let patientSeq = 0;
  async function visit(source: BookingSource, status: AppointmentStatus, day: string, isNew: boolean) {
    patientSeq += 1;
    const patient = await prisma.patient.create({
      data: {
        tenantId,
        mrn: `KX10-${suffix}-${patientSeq}`,
        firstNameEn: "P",
        lastNameEn: `${patientSeq}`,
        gender: Gender.UNKNOWN,
        phone: `+2010${String(Number(suffix.slice(-6)) + patientSeq).padStart(8, "0")}`,
      },
    });
    const startsAt = new Date(`2026-07-${day}T08:00:00.000Z`);
    const appt = await prisma.appointment.create({
      data: {
        tenantId,
        clinicId,
        patientId: patient.id,
        clinicianId: physicianId,
        appointmentTypeId: typeId,
        startsAt,
        feeAmount: 300,
        bookingSource: source,
        isNewPatientAtBooking: isNew,
        status: AppointmentStatus.CONFIRMED,
      },
    });
    if (status === AppointmentStatus.CHECKED_IN || status === AppointmentStatus.COMPLETED) {
      const attendedAt = new Date(startsAt.getTime() + 5 * 60_000);
      await prisma.$transaction(async (tx) => {
        await tx.appointment.update({ where: { id: appt.id }, data: { status, checkedInAt: attendedAt } });
        await charges.onCheckIn(tx, tenantId, appt.id, attendedAt);
      });
    } else {
      await prisma.appointment.update({ where: { id: appt.id }, data: { status } });
    }
    return appt.id;
  }

  it("settings: per-doctor toggle, daily cap, visit-type rules and auto-confirm are saved and audited", async () => {
    const before = await settings.get(admin, clinicId);
    assert.equal(before.doctors.length, 1);
    assert.equal(before.doctors[0]!.verificationStatus, VerificationStatus.VERIFIED);
    assert.equal(before.doctors[0]!.dailyCap, 20);

    const after = await settings.put(admin, {
      clinicId,
      autoConfirm: false,
      doctors: [{ listingId, dailyCap: 8 }],
      appointmentTypes: [{ id: typeId, minNoticeMinutes: 240, maxDaysAhead: 45, depositAmount: 100 }],
    });
    assert.equal(after.autoConfirm, false);
    assert.equal(after.doctors[0]!.dailyCap, 8);
    const type = after.appointmentTypes.find((t) => t.id === typeId)!;
    assert.deepEqual(
      { n: type.minNoticeMinutes, h: type.maxDaysAhead, d: type.depositAmount },
      { n: 240, h: 45, d: 100 },
    );

    const paused = await settings.put(admin, { clinicId, doctors: [{ listingId, listed: false }] });
    assert.equal(paused.doctors[0]!.status, ListingStatus.PAUSED);
    assert.equal(paused.doctors[0]!.pausedReason, "owner");

    const actions = (
      await prisma.auditLog.findMany({ where: { tenantId, action: { startsWith: "kiorex.settings." } }, select: { action: true } })
    ).map((a) => a.action);
    for (const a of [
      "kiorex.settings.auto_confirm_updated",
      "kiorex.settings.daily_cap_updated",
      "kiorex.settings.appointment_type_updated",
      "kiorex.settings.listing_toggled",
    ]) {
      assert.ok(actions.includes(a), a);
    }

    await assert.rejects(settings.put(admin, { clinicId, appointmentTypes: [{ id: typeId, depositAmount: 500 }] }), { status: 400 });
    await assert.rejects(settings.put(admin, { clinicId, appointmentTypes: [{ id: typeId, maxDaysAhead: 0 }] }), { status: 400 });
    await assert.rejects(settings.put(admin, { clinicId, doctors: [{ listingId, dailyCap: -1 }] }), { status: 400 });
    await prisma.marketplaceListing.update({ where: { id: listingId }, data: { status: ListingStatus.LIVE, pausedReason: null } });
  });

  it("overview numbers reconcile with appointments, commission charges and settlement for the period", async () => {
    await visit(BookingSource.KIOREX_MARKETPLACE, AppointmentStatus.COMPLETED, "06", true);
    await visit(BookingSource.KIOREX_MARKETPLACE, AppointmentStatus.CHECKED_IN, "07", true);
    await visit(BookingSource.KIOREX_WHATSAPP, AppointmentStatus.COMPLETED, "08", true);
    await visit(BookingSource.KIOREX_MARKETPLACE, AppointmentStatus.COMPLETED, "08", false);
    await visit(BookingSource.CLINIC_LINK, AppointmentStatus.COMPLETED, "09", true);
    await visit(BookingSource.KIOREX_MARKETPLACE, AppointmentStatus.NO_SHOW, "10", true);
    await visit(BookingSource.KIOREX_MARKETPLACE, AppointmentStatus.CANCELLED, "11", true);
    await visit(BookingSource.FRONT_DESK, AppointmentStatus.COMPLETED, "12", true);
    await visit(BookingSource.KIOREX_MARKETPLACE, AppointmentStatus.COMPLETED, "13", true).then(async () => {
      const c = await prisma.kiorexCommissionCharge.findFirstOrThrow({ where: { tenantId }, orderBy: { attendedAt: "desc" } });
      await prisma.kiorexCommissionCharge.update({ where: { id: c.id }, data: { status: CommissionChargeStatus.REVERSED } });
    });
    await prisma.kiorexCommissionCharge.updateMany({
      where: { tenantId, status: CommissionChargeStatus.PENDING, attendedAt: { lt: new Date("2026-07-08T00:00:00.000Z") } },
      data: { status: CommissionChargeStatus.CONFIRMED, confirmedAt: new Date("2026-07-09T00:00:00.000Z") },
    });

    const views = await overview.syncProfileViews(client, {
      clinicId,
      items: [
        { clinicianId: physicianId, date: "2026-07-06", views: 40 },
        { clinicianId: physicianId, date: "2026-07-07", views: 25 },
        { clinicianId: physicianId, date: "2026-07-07", views: 30 },
        { clinicianId: "someone-else", date: "2026-07-07", views: 5 },
      ],
    });
    assert.equal(views.accepted, 3);
    assert.equal(views.rejected.length, 1);

    const o = await overview.overview(admin, clinicId, period);

    const range = { gte: new Date("2026-07-01T00:00:00.000Z"), lt: new Date("2026-08-01T00:00:00.000Z") };
    const kiorexSources = [BookingSource.KIOREX_MARKETPLACE, BookingSource.KIOREX_WHATSAPP, BookingSource.CLINIC_LINK];
    const appts = await prisma.appointment.findMany({
      where: { tenantId, clinicId, startsAt: range, bookingSource: { in: kiorexSources } },
    });
    const attended = appts.filter((a) => a.status === AppointmentStatus.CHECKED_IN || a.status === AppointmentStatus.COMPLETED);
    assert.equal(o.bookings, appts.length);
    assert.equal(o.bookings, 8);
    assert.deepEqual(o.bookingsByChannel, { marketplace: 6, whatsapp: 1, clinicLink: 1 });
    assert.equal(o.attended, attended.length);
    assert.equal(o.noShows, appts.filter((a) => a.status === AppointmentStatus.NO_SHOW).length);
    assert.equal(o.cancelled, appts.filter((a) => a.status === AppointmentStatus.CANCELLED).length);
    assert.equal(o.newPatients, attended.filter((a) => a.isNewPatientAtBooking).length);

    const chargeRows = await prisma.kiorexCommissionCharge.findMany({
      where: {
        tenantId,
        clinicId,
        attendedAt: range,
        status: { in: [CommissionChargeStatus.PENDING, CommissionChargeStatus.CONFIRMED, CommissionChargeStatus.DISPUTED, CommissionChargeStatus.BILLED] },
      },
    });
    assert.equal(o.commission.chargedVisits, chargeRows.length);
    assert.equal(o.commission.chargedVisits, 3);
    assert.equal(o.commission.amount, chargeRows.reduce((s, c) => s + Number(c.amount), 0));
    assert.equal(o.commission.confirmed, 120);
    assert.equal(o.commission.pending, 60);

    const preview = await settlement.previewForTenant(admin, tenantId, period);
    assert.ok(o.freeProgress, "free progress should be available");
    assert.equal(o.freeProgress.patientsAttended, preview.calculation.summary.kiorexPatientCount);
    assert.equal(o.freeProgress.patientsAttended, 2);
    assert.equal(o.creditOffset, Number(preview.calculation.summary.offsetAmount));

    assert.equal(o.profileViews, 70);
    assert.equal(o.daily.find((d) => d.date === "2026-07-07")!.views, 30);
    assert.equal(o.daily.reduce((s, d) => s + d.bookings, 0), o.bookings);
    assert.equal(o.daily.reduce((s, d) => s + d.attended, 0), o.attended);
  });

  it("overview rejects a bad period and non-managers", async () => {
    await assert.rejects(overview.overview(admin, clinicId, "2026-13"), { status: 400 });
    const physician: JwtUser = { userId: physicianId, tenantId, email: "x", role: UserRole.PHYSICIAN };
    await assert.rejects(overview.overview(physician, clinicId, period));
  });

  it("overview with clinicId=all (or omitted) returns organization scope across branches", async () => {
    const orgAll = await overview.overview(admin, "all", period);
    assert.equal(orgAll.scope, "organization");
    assert.equal(orgAll.clinicId, null);
    const orgOmit = await overview.overview(admin, undefined, period);
    assert.equal(orgOmit.scope, "organization");
    assert.equal(orgOmit.bookings, orgAll.bookings);
    const single = await overview.overview(admin, clinicId, period);
    assert.equal(single.scope, "clinic");
    assert.equal(single.clinicId, clinicId);
    assert.equal(orgAll.bookings, single.bookings);
  });
});
