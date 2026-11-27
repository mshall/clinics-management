/**
 * Throwaway test organisation for the live kx-test end-to-end suite (booking from the patient web, Clinic wiring).
 *
 * NOT part of the base seed: it only runs when the seed Lambda is invoked with {"kxE2eOrg":"ensure"|"retire"} (see infra/lambda/db-seed/run.mjs),
 * never on a normal deploy. The owner password comes from the invocation payload (generated, kept in AWS Secrets Manager /kx/test/e2e by the caller),
 * is hashed here and is never logged. Every row is tagged: tenant name prefix "[TEST]", licence prefix KXE2E-, e-mail domain kx-e2e.kiorly.test,
 * so `retire` (and a later super-admin clean-up) can find them. Idempotent. Real organisations are never touched.
 */
import { randomBytes } from "node:crypto";
import { ClinicalSpecialty, ListingStatus, PrismaClient, UserRole, VerificationStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";

export const KX_E2E_TENANT_NAME = "[TEST] KX E2E Clinic (removable)";
export const KX_E2E_EMAIL_DOMAIN = "kx-e2e.kiorly.test";
export const KX_E2E_OWNER_EMAIL = `owner@${KX_E2E_EMAIL_DOMAIN}`;
export const KX_E2E_DOCTOR_EMAIL = `doctor@${KX_E2E_EMAIL_DOMAIN}`;
const LICENSE = "KXE2E-EG-CAI-01";

function weekJson() {
  return {
    version: 1,
    timezone: "Africa/Cairo",
    days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      slots: weekday === 5 ? [] : [{ start: "09:00", end: "13:00" }, { start: "16:00", end: "20:00" }],
    })),
  };
}

export async function ensureKxE2eOrg(prisma: PrismaClient, ownerPassword: string): Promise<void> {
  if (!ownerPassword || ownerPassword.length < 16) throw new Error("kx-e2e-org: owner password (>= 16 characters) is required");
  const market = await prisma.market.findFirst({ where: { code: "EG" } });
  if (!market) throw new Error("kx-e2e-org: EG market missing");

  let tenant = await prisma.tenant.findFirst({ where: { name: KX_E2E_TENANT_NAME } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { name: KX_E2E_TENANT_NAME, nameAr: "[تجريبي] عيادة الاختبار الآلي (قابلة للحذف)", marketId: market.id, baseCurrency: "EGP", defaultLocale: "en", deploymentCell: market.hostCell },
    });
  }
  const plan = await prisma.plan.findFirst({ where: { key: "PRO" } });
  if (plan && !(await prisma.subscription.findUnique({ where: { tenantId: tenant.id } }))) {
    await prisma.subscription.create({
      data: { tenantId: tenant.id, planId: plan.id, status: "ACTIVE", interval: "MONTHLY", clinicianSeats: 3, currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 365 * 86_400_000) },
    });
  }

  let clinic = await prisma.clinic.findFirst({ where: { tenantId: tenant.id, licenseNumber: LICENSE } });
  if (!clinic) {
    clinic = await prisma.clinic.create({
      data: {
        tenantId: tenant.id, nameEn: "[TEST] KX E2E Clinic", nameAr: "[تجريبي] عيادة الاختبار الآلي", country: "EG", city: "Cairo",
        addressEn: "Test address, Cairo (throwaway)", addressAr: "عنوان تجريبي، القاهرة", locationUrl: "https://maps.google.com/?q=30.0444,31.2357",
        latitude: 30.0444, longitude: 31.2357, phone: "201000000199", email: `clinic@${KX_E2E_EMAIL_DOMAIN}`, licenseNumber: LICENSE,
        defaultCurrency: "EGP", defaultLanguage: "en", clinicalSpecialty: ClinicalSpecialty.POLYCLINIC,
      },
    });
  }

  const types: { id: string; fee: number }[] = [];
  for (const t of [{ nameEn: "Consultation", nameAr: "كشف", durationMinutes: 30, fee: 100 }, { nameEn: "Follow-up", nameAr: "متابعة", durationMinutes: 15, fee: 60 }]) {
    let at = await prisma.appointmentType.findFirst({ where: { tenantId: tenant.id, clinicId: clinic.id, nameEn: t.nameEn } });
    if (!at) {
      at = await prisma.appointmentType.create({
        data: { tenantId: tenant.id, clinicId: clinic.id, nameEn: t.nameEn, nameAr: t.nameAr, durationMinutes: t.durationMinutes, feeAmount: t.fee, marketplaceBookable: true, isActive: true },
      });
    } else if (!at.marketplaceBookable || !at.isActive) {
      at = await prisma.appointmentType.update({ where: { id: at.id }, data: { marketplaceBookable: true, isActive: true } });
    }
    types.push({ id: at.id, fee: t.fee });
  }

  // Owner: the login the e2e suite uses. The password is (re)set on every ensure so the secret store stays the single source of truth.
  const ownerHash = await bcrypt.hash(ownerPassword, 10);
  const owner = await prisma.user.findFirst({ where: { tenantId: tenant.id, email: KX_E2E_OWNER_EMAIL } });
  if (owner) {
    await prisma.user.update({ where: { id: owner.id }, data: { passwordHash: ownerHash, isTenantOwner: true } });
  } else {
    await prisma.user.create({
      data: { tenantId: tenant.id, email: KX_E2E_OWNER_EMAIL, passwordHash: ownerHash, displayName: "[TEST] KX E2E Owner", role: UserRole.GROUP_ADMIN, isTenantOwner: true },
    });
  }

  // Provider: nobody signs in as the doctor (random unknown password).
  const doctor =
    (await prisma.user.findFirst({ where: { tenantId: tenant.id, email: KX_E2E_DOCTOR_EMAIL } })) ??
    (await prisma.user.create({
      data: { tenantId: tenant.id, email: KX_E2E_DOCTOR_EMAIL, passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 10), displayName: "Dr KX E2E Test", role: UserRole.PHYSICIAN },
    }));
  await prisma.clinicianVerification.upsert({
    where: { userId: doctor.id },
    create: { userId: doctor.id, tenantId: tenant.id, status: VerificationStatus.VERIFIED, specialty: ClinicalSpecialty.GENERAL_MEDICINE, verifiedSpecialty: ClinicalSpecialty.GENERAL_MEDICINE, syndicateNumber: "KXE2E-TEST-001", titleEn: "Test general practitioner", titleAr: "ممارس عام تجريبي", documentKeys: [], reviewedAt: new Date() },
    update: { status: VerificationStatus.VERIFIED },
  });
  await prisma.clinicianAvailabilityTemplate.upsert({
    where: { tenantId_clinicId_clinicianId: { tenantId: tenant.id, clinicId: clinic.id, clinicianId: doctor.id } },
    create: { tenantId: tenant.id, clinicId: clinic.id, clinicianId: doctor.id, weekJson: weekJson(), blockedJson: [] },
    update: { weekJson: weekJson() },
  });
  const profileJson = {
    displayNameEn: "Dr KX E2E Test", displayNameAr: "د. اختبار آلي", titleEn: "Test general practitioner (throwaway)", titleAr: "ممارس عام تجريبي (مؤقت)",
    specialty: ClinicalSpecialty.GENERAL_MEDICINE, gender: "UNSPECIFIED", languages: ["ar", "en"],
    bioEn: "Throwaway test provider of the kx-test end-to-end suite. Not a real doctor; bookings made here are test bookings and are cancelled after the run.",
    bioAr: "مقدم خدمة تجريبي مؤقت لاختبارات النظام. ليس طبيبًا حقيقيًا؛ الحجوزات هنا تجريبية وتُلغى بعد التشغيل.",
    education: [{ degreeEn: "Test degree", degreeAr: "شهادة تجريبية" }], yearsExperience: 5, photoRelativePath: "kiorex-dev/kxdev.mona.fahmy.jpg",
    feesByAppointmentTypeId: Object.fromEntries(types.map((t) => [t.id, t.fee])), amenities: ["wifi"], parking: false, wheelchairAccess: true,
  };
  const listing = await prisma.marketplaceListing.findUnique({ where: { clinicId_clinicianId: { clinicId: clinic.id, clinicianId: doctor.id } } });
  if (!listing) {
    await prisma.marketplaceListing.create({ data: { tenantId: tenant.id, clinicId: clinic.id, clinicianId: doctor.id, status: ListingStatus.LIVE, pausedReason: null, listedAt: new Date(), profileJson } });
  } else {
    await prisma.marketplaceListing.update({ where: { id: listing.id }, data: { status: ListingStatus.LIVE, pausedReason: null, listedAt: listing.listedAt ?? new Date(), profileJson } });
  }
  console.log(`kx-e2e-org: ensured tenant ${tenant.id}, clinic ${clinic.id}, provider listing LIVE (owner password set from the invocation payload).`);
}

/** Removal on request: pauses every listing of the tagged organisation, so the next platform sync delists it, and deactivates its users. Rows stay (audit and booking history are append-only). */
export async function retireKxE2eOrg(prisma: PrismaClient): Promise<void> {
  const tenant = await prisma.tenant.findFirst({ where: { name: KX_E2E_TENANT_NAME } });
  if (!tenant) { console.log("kx-e2e-org: nothing to retire."); return; }
  const paused = await prisma.marketplaceListing.updateMany({ where: { tenantId: tenant.id }, data: { status: ListingStatus.PAUSED, pausedReason: "owner" } });
  const users = await prisma.user.updateMany({ where: { tenantId: tenant.id, deactivatedAt: null }, data: { deactivatedAt: new Date() } });
  console.log(`kx-e2e-org: retired tenant ${tenant.id}: ${paused.count} listing(s) paused, ${users.count} user(s) deactivated.`);
}
