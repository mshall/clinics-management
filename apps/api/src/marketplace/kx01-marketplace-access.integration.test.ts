import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import {
  BillingInterval,
  ListingStatus,
  PlanKey,
  PrismaClient,
  SubscriptionStatus,
  UserRole,
  VerificationStatus,
} from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { MarketplaceAccessService } from "./marketplace-access.service";
import { MarketplaceListingService } from "./marketplace-listing.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { PrismaService } from "../prisma/prisma.service";

const prisma = new PrismaClient();
const access = new MarketplaceAccessService(prisma as never);
const outbox = new OutboxEventService(prisma as unknown as PrismaService);
const listings = new MarketplaceListingService(prisma as unknown as PrismaService, outbox);

describe("KX-01 marketplace access", () => {
  let tenantId: string;
  let clinicId: string;
  let physicianId: string;
  let clinicNoListingId: string;
  const suffix = `${Date.now()}`;

  before(async () => {
    await prisma.$connect();
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const plan = await prisma.plan.findFirstOrThrow({ where: { key: PlanKey.PRO } });
    const tenant = await prisma.tenant.create({
      data: {
        name: `Kx01 ${suffix}`,
        deploymentCell: "frankfurt",
        marketId: market.id,
        clinics: {
          create: [
            {
              nameEn: "Listed",
              nameAr: "معروض",
              country: "EG",
              city: "Cairo",
              addressEn: "A",
              addressAr: "أ",
              locationUrl: "https://maps.example/l",
              phone: "201000000010",
              email: `kx01.${suffix}@example.com`,
              licenseNumber: "EG-KX01",
              defaultCurrency: "EGP",
            },
            {
              nameEn: "No listing",
              nameAr: "بدون",
              country: "EG",
              city: "Cairo",
              addressEn: "B",
              addressAr: "ب",
              locationUrl: "https://maps.example/n",
              phone: "201000000011",
              email: `kx01b.${suffix}@example.com`,
              licenseNumber: "EG-KX01B",
              defaultCurrency: "EGP",
            },
          ],
        },
      },
      include: { clinics: true },
    });
    tenantId = tenant.id;
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
    clinicId = tenant.clinics[0]!.id;
    clinicNoListingId = tenant.clinics[1]!.id;
    const user = await prisma.user.create({
      data: {
        tenantId,
        email: `kx01.dr.${suffix}@example.com`,
        passwordHash: bcrypt.hashSync("demo", 10),
        displayName: "Dr Kx01",
        role: UserRole.PHYSICIAN,
      },
    });
    physicianId = user.id;
    await prisma.clinicianVerification.create({
      data: {
        userId: physicianId,
        tenantId,
        status: VerificationStatus.VERIFIED,
        verifiedSpecialty: "GENERAL_MEDICINE",
        specialty: "GENERAL_MEDICINE",
        syndicateNumber: "SYND-KX01",
        documentKeys: [],
      },
    });
    await prisma.appointmentType.create({
      data: {
        tenantId,
        clinicId,
        nameEn: "Consult",
        nameAr: "كشف",
        durationMinutes: 15,
        feeAmount: 300,
        colorHex: "#3b82f6",
        marketplaceBookable: true,
        isActive: true,
      },
    });
    await prisma.clinicianAvailabilityTemplate.create({
      data: {
        tenantId,
        clinicId,
        clinicianId: physicianId,
        weekJson: {
          version: 1,
          timezone: "Africa/Cairo",
          days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
            weekday,
            slots: weekday === 1 ? [{ start: "09:00", end: "12:00" }] : [],
          })),
        },
        blockedJson: [],
      },
    });
    await prisma.clinic.update({
      where: { id: clinicId },
      data: { latitude: 30.04, longitude: 31.24 },
    });
    const listing = await prisma.marketplaceListing.create({
      data: {
        tenantId,
        clinicId,
        clinicianId: physicianId,
        status: ListingStatus.DRAFT,
        profileJson: {
          displayNameEn: "Dr Pa03",
          displayNameAr: "د. با03",
          specialty: "GENERAL_MEDICINE",
          bioEn: "Board-certified physician with focus on primary care and chronic disease management.",
          bioAr: "طبيب معتمد متخصص في الرعاية الأولية والأمراض المزمنة مع خبرة واسعة في المجال.",
          photoRelativePath: "photo.jpg",
          languages: ["ar", "en"],
          yearsExperience: 10,
          education: [{ degreeEn: "MD" }],
          amenities: ["parking"],
        },
      },
    });
    await listings.recomputeListing(listing.id);
  });

  after(async () => {
    await prisma.marketplaceListing.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.clinicianAvailabilityTemplate.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.appointmentType.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.clinicianVerification.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.subscription.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.clinic.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("allows resolve when clinic has LIVE listing", async () => {
    const row = await prisma.marketplaceListing.findFirstOrThrow({
      where: { clinicId, clinicianId: physicianId },
    });
    assert.equal(row.status, ListingStatus.LIVE);
    const tenant = await access.resolveTenantForMarketplaceClinic(clinicId);
    assert.equal(tenant, tenantId);
  });

  it("denies clinic data without LIVE or PAUSED listing", async () => {
    await assert.rejects(
      () => access.resolveTenantForMarketplaceClinic(clinicNoListingId),
      (e: unknown) => e instanceof ForbiddenException,
    );
  });
});