import { AppointmentStatus, BookingSource, FeeType, Gender, ListingStatus, PlanKey, SubscriptionStatus, BillingInterval, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { AuditService } from "../audit/audit.service";
import { CreditWalletService } from "../credits/credit-wallet.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { AttributionEvidenceService } from "../kiorex/attribution-evidence.service";
import { CommissionChargeService } from "../kiorex/commission-charge.service";
import { CommissionDecisionsService } from "../kiorex/commission-decisions.service";
import { CommissionDisputeService } from "../kiorex/commission-dispute.service";
import { KiorexCommissionService } from "../kiorex/kiorex-commission.service";
import { ClinicBookingPageService } from "../marketplace/clinic-booking-page.service";
import { MarketplaceAccessService } from "../marketplace/marketplace-access.service";
import { MarketplaceBookingService } from "../marketplace/marketplace-booking.service";
import type { MarketplaceListingService } from "../marketplace/marketplace-listing.service";
import { MarketplacePatientIntakeService } from "../marketplace/marketplace-patient-intake.service";
import { MarketplaceProviderProfileService } from "../marketplace/marketplace-provider-profile.service";
import type { PlatformIntegrationPrincipal } from "../marketplace/platform-integration-client.service";
import { AppointmentOutboxService } from "../messaging/appointment-outbox.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { NewPatientService } from "../patients/new-patient.service";
import { createPrismaClient } from "../prisma/create-prisma-client";
import type { PrismaService } from "../prisma/prisma.service";
import { SlotService } from "../scheduling/slot.service";
import type { AppointmentsService } from "../appointments/appointments.service";
import { ConsentPolicyService } from "../compliance/consent-policy.service";
import { GrowthInsightsService } from "./provider-links/growth-insights.service";
import { ProviderLinkCoreService } from "./provider-links/provider-link-core.service";
import { ProviderLinksService } from "./provider-links/provider-links.service";

/** Shared fixture for the GRW-P1-D1/D2 integration tests: one organisation (two clinics, two doctors), real Postgres, services wired by hand like the existing KX tests. */
export const prisma = createPrismaClient();
export const prismaSvc = prisma as unknown as PrismaService;

export async function createWorld(tag: string, opts: { plan?: PlanKey | null } = {}) {
  const suffix = `${tag}${Date.now()}${Math.floor(Math.random() * 1000)}`;
  await prisma.$connect();
  const audit = new AuditService(prismaSvc);
  const outbox = new OutboxEventService(prismaSvc);
  const slots = new SlotService(prismaSvc, outbox);
  const core = new ProviderLinkCoreService(prismaSvc);
  const entitlements = new EntitlementsService(prismaSvc);
  const evidence = new AttributionEvidenceService();
  const profiles = new MarketplaceProviderProfileService(prismaSvc, {} as never, outbox, audit, {} as never);
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
    undefined,
    undefined,
    undefined,
    core,
  );
  const pages = new ClinicBookingPageService(prismaSvc, { assertClinicManage() {} } as unknown as MarketplaceListingService, audit, core);
  const links = new ProviderLinksService(prismaSvc, audit, core, entitlements, profiles);
  const insights = new GrowthInsightsService(prismaSvc, links, entitlements, profiles);
  const charges = new CommissionChargeService(prismaSvc, new KiorexCommissionService(prismaSvc), outbox, new CreditWalletService(prismaSvc));
  const disputes = new CommissionDisputeService(prismaSvc, charges, new NewPatientService(prismaSvc), evidence);
  const decisions = new CommissionDecisionsService(prismaSvc, charges);

  const market = await prisma.market.create({
    data: { code: `G${suffix}`.slice(0, 12), nameEn: `Growth ${suffix}`, hostCell: "frankfurt", defaultCurrency: "EGP", defaultLocale: "en", defaultTimezone: "Africa/Cairo", weekendDays: [5, 6], enabledLanguages: ["en", "ar"], defaultPhoneRegion: "EG" },
  });
  const rate = await prisma.kiorexCommissionRate.create({ data: { marketId: market.id, feeType: FeeType.FLAT, amount: 40, validFrom: new Date("2020-01-01") } });
  const client = await prisma.platformIntegrationClient.create({ data: { name: `G ${suffix}`, clientKey: `plt_g_${suffix}`, secretHash: "x", scopes: ["MARKETPLACE"] } });

  const mkTenant = async (label: string) => {
    const tenant = await prisma.tenant.create({ data: { name: `${label} ${suffix}`, deploymentCell: "frankfurt", marketId: market.id, baseCurrency: "EGP" } });
    if (opts.plan !== null) {
      const plan = await prisma.plan.findFirstOrThrow({ where: { key: opts.plan ?? PlanKey.PRO } });
      await prisma.subscription.create({ data: { tenantId: tenant.id, planId: plan.id, status: SubscriptionStatus.ACTIVE, interval: BillingInterval.MONTHLY, clinicianSeats: 5, currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000) } });
    }
    const clinicData = (n: string) => ({ tenantId: tenant.id, nameEn: `Nile ${label} ${n} ${suffix}`, nameAr: `عيادة ${n}`, country: "EG", city: "Cairo", addressEn: "Street", addressAr: "شارع", locationUrl: "https://maps.example/g", timezone: "Africa/Cairo", phone: "201000000090", email: `g.${label}.${n}.${suffix}@example.com`, licenseNumber: "EG-G", defaultCurrency: "EGP", marketplaceBookingAutoConfirm: true });
    const clinic = await prisma.clinic.create({ data: clinicData("a") });
    const branch = await prisma.clinic.create({ data: { ...clinicData("b"), parentClinicId: clinic.id } });
    const user = (role: UserRole, name: string) =>
      prisma.user.create({ data: { tenantId: tenant.id, email: `g.${label}.${name}.${suffix}@example.com`, passwordHash: "x", displayName: `Dr ${name} ${label}`, role } });
    const [doc, doc2, adminU, mktU, recepU] = await Promise.all([user(UserRole.PHYSICIAN, "one"), user(UserRole.PHYSICIAN, "two"), user(UserRole.CLINIC_ADMIN, "admin"), user(UserRole.CLINIC_ASSISTANT, "mkt"), user(UserRole.RECEPTIONIST, "recep")]);
    const type = await prisma.appointmentType.create({ data: { tenantId: tenant.id, clinicId: clinic.id, nameEn: "Visit", nameAr: "كشف", durationMinutes: 30, feeAmount: 300, colorHex: "#3b82f6", marketplaceBookable: true, minNoticeMinutes: 0, maxDaysAhead: 365, isActive: true } });
    for (const d of [doc, doc2]) {
      await prisma.marketplaceListing.create({ data: { tenantId: tenant.id, clinicId: clinic.id, clinicianId: d.id, status: ListingStatus.LIVE, profileJson: { displayNameEn: `Dr ${d.displayName}`, displayNameAr: "د. أحمد", titleEn: "Cardiologist", titleAr: "قلب" } } });
    }
    const jwt = (u: { id: string }, role: UserRole): JwtUser => ({ userId: u.id, tenantId: tenant.id, email: `${role}@example.com`, role, additionalRoles: [] });
    return { tenantId: tenant.id, clinicId: clinic.id, branchId: branch.id, doc: doc.id, doc2: doc2.id, typeId: type.id, admin: jwt(adminU, UserRole.CLINIC_ADMIN), marketing: jwt(mktU, UserRole.CLINIC_ASSISTANT), recep: jwt(recepU, UserRole.RECEPTIONIST), physician: jwt(doc, UserRole.PHYSICIAN) };
  };
  const A = await mkTenant("A");
  const B = await mkTenant("B");
  const platformUser = await prisma.user.create({ data: { tenantId: null, email: `g.platform.${suffix}@example.com`, passwordHash: "x", displayName: "Platform", role: UserRole.PLATFORM_SUPER_ADMIN } });
  const platform: JwtUser = { userId: platformUser.id, tenantId: null, email: platformUser.email, role: UserRole.PLATFORM_SUPER_ADMIN, additionalRoles: [] };

  let seq = 0;
  const book = (w: { clinicId: string; doc: string; typeId: string }, startsAt: string, extra: Record<string, unknown> = {}, key = `G-${suffix}-${++seq}`) =>
    bookings.createBooking(client as PlatformIntegrationPrincipal, key, {
      clinicId: w.clinicId,
      clinicianId: w.doc,
      typeId: w.typeId,
      startsAt,
      patient: { phone: `+2010${String(Date.now() + seq * 7919).slice(-8)}`, firstNameEn: "New", lastNameEn: `Patient${seq}`, gender: Gender.M },
      marketplaceConsentGranted: true,
      ...extra,
    } as never);

  async function checkIn(tenantId: string, appointmentId: string, at: Date) {
    await prisma.$transaction(async (tx) => {
      await tx.appointment.update({ where: { id: appointmentId }, data: { status: AppointmentStatus.CHECKED_IN, checkedInAt: at } });
      await charges.onCheckIn(tx, tenantId, appointmentId, at);
    });
  }

  /** Appointment created directly (no marketplace call), for decision tests that need exact inputs. */
  async function appointmentRow(w: { tenantId: string; clinicId: string; doc: string }, data: { source: BookingSource; isNew: boolean; origin?: "PROVIDER_LED" | "MARKETPLACE" | "UNATTRIBUTED" | null; attributionJson?: object | null; at?: Date }) {
    const patient = await prisma.patient.create({ data: { tenantId: w.tenantId, mrn: `MRN-${suffix}-${++seq}`, firstNameEn: "Sam", lastNameEn: "New", gender: Gender.UNKNOWN, phone: `+2011${String(Date.now() + seq * 104729).slice(-8)}`, nationalId: `nat-${suffix}-${seq}` } });
    return prisma.appointment.create({
      data: { tenantId: w.tenantId, clinicId: w.clinicId, patientId: patient.id, clinicianId: w.doc, startsAt: data.at ?? new Date("2026-12-01T10:00:00Z"), feeAmount: 300, bookingSource: data.source, isNewPatientAtBooking: data.isNew, acquisitionOrigin: data.origin ?? null, attributionJson: (data.attributionJson ?? undefined) as never, status: AppointmentStatus.CONFIRMED },
    });
  }

  async function cleanup() {
    for (const t of [A.tenantId, B.tenantId]) {
      await prisma.kiorexCommissionCharge.deleteMany({ where: { tenantId: t } }).catch(() => undefined);
      await prisma.appointment.deleteMany({ where: { tenantId: t } }).catch(() => undefined);
      await prisma.tenant.delete({ where: { id: t } }).catch(() => undefined);
    }
    await prisma.user.delete({ where: { id: platformUser.id } }).catch(() => undefined);
    await prisma.kiorexCommissionRate.delete({ where: { id: rate.id } }).catch(() => undefined);
    await prisma.market.delete({ where: { id: market.id } }).catch(() => undefined);
    await prisma.platformIntegrationClient.delete({ where: { id: client.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }

  return { suffix, A, B, platform, marketId: market.id, rateId: rate.id, client, book, checkIn, appointmentRow, cleanup, svc: { audit, outbox, core, links, insights, pages, bookings, charges, disputes, decisions, profiles, entitlements } };
}
export type World = Awaited<ReturnType<typeof createWorld>>;
