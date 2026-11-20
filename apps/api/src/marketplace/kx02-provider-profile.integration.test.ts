import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
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
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import path from "node:path";
import { LocalUploadBlobStorage } from "../storage/local-upload-blob.storage";
import { PROVIDER_PROFILE_UPDATED_TOPIC } from "./provider-profile-schema";
import { MarketplaceListingService } from "./marketplace-listing.service";
import { MarketplaceProviderProfileService } from "./marketplace-provider-profile.service";
import type { JwtUser } from "../auth/jwt-user";

const prisma = new PrismaClient();
const uploads = new LocalUploadBlobStorage(path.join(process.cwd(), "uploads"));
const audit = new AuditService(prisma as unknown as PrismaService);
const outbox = new OutboxEventService(prisma as unknown as PrismaService);
const listings = new MarketplaceListingService(prisma as unknown as PrismaService, outbox);
const profiles = new MarketplaceProviderProfileService(
  prisma as unknown as PrismaService,
  listings,
  outbox,
  audit,
  uploads,
);

// Re-export rich profile from test helper
const fullProfile = {
  displayNameEn: "Dr Ahmed",
  displayNameAr: "د. أحمد",
  specialty: "GENERAL_MEDICINE",
  bioEn: "Board-certified physician with focus on primary care and chronic disease management.",
  bioAr: "طبيب معتمد متخصص في الرعاية الأولية والأمراض المزمنة مع خبرة واسعة في المجال.",
  photoRelativePath: "t/c/p.jpg",
  languages: ["ar", "en"],
  yearsExperience: 12,
  education: [{ degreeEn: "MD", institutionEn: "Cairo University" }],
  amenities: ["wifi"],
  parking: true,
  wheelchairAccess: true,
};

describe("KX-02 provider profile", () => {
  let tenantId: string;
  let clinicId: string;
  let physicianId: string;
  let listingId: string;
  let admin: JwtUser;
  const suffix = `${Date.now()}`;

  before(async () => {
    await prisma.$connect();
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const plan = await prisma.plan.findFirstOrThrow({ where: { key: PlanKey.PRO } });
    const tenant = await prisma.tenant.create({
      data: {
        name: `Kx02 ${suffix}`,
        deploymentCell: "frankfurt",
        marketId: market.id,
        clinics: {
          create: {
            nameEn: "Branch",
            nameAr: "فرع",
            country: "EG",
            city: "Cairo",
            addressEn: "Street 1",
            addressAr: "شارع ١",
            locationUrl: "https://maps.example/x",
            latitude: 30.0444,
            longitude: 31.2357,
            phone: "201000000020",
            email: `kx02.${suffix}@example.com`,
            licenseNumber: "EG-KX02",
            defaultCurrency: "EGP",
          },
        },
      },
      include: { clinics: true },
    });
    tenantId = tenant.id;
    clinicId = tenant.clinics[0]!.id;
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
    const user = await prisma.user.create({
      data: {
        tenantId,
        email: `kx02.admin.${suffix}@example.com`,
        passwordHash: bcrypt.hashSync("demo", 10),
        displayName: "Admin",
        role: UserRole.GROUP_ADMIN,
      },
    });
    admin = { userId: user.id, tenantId, email: user.email, role: UserRole.GROUP_ADMIN, additionalRoles: [] };
    const physician = await prisma.user.create({
      data: {
        tenantId,
        email: `kx02.dr.${suffix}@example.com`,
        passwordHash: bcrypt.hashSync("demo", 10),
        displayName: "Dr Kx02",
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
        syndicateNumber: "SYND-KX02",
        documentKeys: [],
      },
    });
    await prisma.appointmentType.create({
      data: {
        tenantId,
        clinicId,
        nameEn: "Visit",
        nameAr: "كشف",
        durationMinutes: 15,
        feeAmount: 400,
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
    const listing = await prisma.marketplaceListing.create({
      data: {
        tenantId,
        clinicId,
        clinicianId: physicianId,
        profileJson: {},
      },
    });
    listingId = listing.id;
  });

  after(async () => {
    await prisma.outboxEvent.deleteMany({ where: { tenantId } }).catch(() => undefined);
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

  it("profile below 80% completeness cannot go LIVE", async () => {
    await profiles.putProfile(admin, listingId, {
      profile: { bioEn: "Too short for marketplace" },
    });
    const row = await listings.recomputeListing(listingId);
    assert.notEqual(row.status, ListingStatus.LIVE);
    assert.ok(row.blockers.includes("profile"));
  });

  it("emits PROVIDER_PROFILE_UPDATED and allows LIVE when profile is complete", async () => {
    await profiles.putProfile(admin, listingId, { profile: fullProfile });
    const evt = await prisma.outboxEvent.findFirst({
      where: { tenantId, type: PROVIDER_PROFILE_UPDATED_TOPIC },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(evt);
    await prisma.clinicianVerification.update({
      where: { userId: physicianId },
      data: { status: VerificationStatus.VERIFIED },
    });
    const row = await listings.recomputeListing(listingId);
    assert.equal(row.status, ListingStatus.LIVE);
  });

  it("Kiorex can fully resync via paged providers endpoint", async () => {
    // Page through everything (the DB may hold more providers than one page, e.g. after the demo seeds).
    const pageSize = 10;
    const first = await profiles.listProvidersForKiorex({ page: 1, pageSize });
    assert.ok(first.total >= 1);
    const seen = [...first.items];
    const pages = Math.ceil(first.total / pageSize);
    for (let page = 2; page <= pages; page++) {
      seen.push(...(await profiles.listProvidersForKiorex({ page, pageSize })).items);
    }
    assert.equal(seen.length, first.total, "every provider is returned exactly once across the pages");
    const beyond = await profiles.listProvidersForKiorex({ page: pages + 1, pageSize });
    assert.equal(beyond.items.length, 0);
  });
});