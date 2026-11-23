/**
 * Local Kiorex integration seed (INTEGRATION.md): marketplace client, Kiorex webhook target documentation,
 * and three LIVE verified Kiorex-listed doctors in two clinics (Cairo / Giza) with 14+ days of bookable slots.
 * Idempotent: safe to run on every `db:seed`. Never runs in production (seed main() already blocks that).
 */
import {
  ClinicalSpecialty,
  ListingStatus,
  PrismaClient,
  UserRole,
  VerificationStatus,
} from "@prisma/client";
import * as bcrypt from "bcryptjs";

export const KX_DEV_CLIENT_KEY = "kx_dev_client";
export const KX_DEV_CLIENT_SECRET = "kx_dev_secret_change_me";
export const KX_DEV_WEBHOOK_URL = "http://localhost:4000/api/v1/webhooks/kiorly";
export const KX_DEV_WEBHOOK_SECRET = "kx_dev_webhook_secret";
export const KX_DEV_TENANT_NAME = "Kiorex Dev Marketplace Group";

type DevClinic = {
  key: string;
  nameEn: string;
  nameAr: string;
  city: string;
  addressEn: string;
  addressAr: string;
  lat: number;
  lng: number;
  phone: string;
  license: string;
};

type DevDoctor = {
  email: string;
  nameEn: string;
  nameAr: string;
  clinicKey: string;
  specialty: ClinicalSpecialty;
  titleEn: string;
  titleAr: string;
  bioEn: string;
  bioAr: string;
  fee: number;
  years: number;
  syndicate: string;
};

export const KX_DEV_CLINICS: DevClinic[] = [
  {
    key: "cairo",
    nameEn: "Nile Family Clinic — Zamalek",
    nameAr: "عيادة النيل العائلية — الزمالك",
    city: "Cairo",
    addressEn: "12 Brazil Street, Zamalek, Cairo",
    addressAr: "١٢ شارع البرازيل، الزمالك، القاهرة",
    lat: 30.0626,
    lng: 31.2197,
    phone: "201000000101",
    license: "EG-KXDEV-CAI-01",
  },
  {
    key: "giza",
    nameEn: "Pyramids Heart & Care Center — Dokki",
    nameAr: "مركز الأهرام للقلب والرعاية — الدقي",
    city: "Giza",
    addressEn: "27 Tahrir Street, Dokki, Giza",
    addressAr: "٢٧ شارع التحرير، الدقي، الجيزة",
    lat: 30.0384,
    lng: 31.2118,
    phone: "201000000102",
    license: "EG-KXDEV-GIZ-01",
  },
];

export const KX_DEV_DOCTORS: DevDoctor[] = [
  {
    email: "kxdev.mona.fahmy@kiorly.dev",
    nameEn: "Dr Mona Fahmy",
    nameAr: "د. منى فهمي",
    clinicKey: "cairo",
    specialty: ClinicalSpecialty.PEDIATRICS,
    titleEn: "Consultant Paediatrician",
    titleAr: "استشاري طب الأطفال",
    bioEn: "Paediatrician with fifteen years caring for newborns, toddlers and school-age children, including vaccination and growth follow-up.",
    bioAr: "طبيبة أطفال بخبرة خمسة عشر عامًا في رعاية حديثي الولادة والرضع وأطفال المدارس، تشمل التطعيمات ومتابعة النمو.",
    fee: 450,
    years: 15,
    syndicate: "KXDEV-PED-001",
  },
  {
    email: "kxdev.karim.adel@kiorly.dev",
    nameEn: "Dr Karim Adel",
    nameAr: "د. كريم عادل",
    clinicKey: "cairo",
    specialty: ClinicalSpecialty.DERMATOLOGY,
    titleEn: "Consultant Dermatologist",
    titleAr: "استشاري الأمراض الجلدية",
    bioEn: "Dermatologist treating acne, eczema, hair loss and skin allergies with evidence-based care and clear follow-up plans.",
    bioAr: "طبيب جلدية يعالج حب الشباب والإكزيما وتساقط الشعر وحساسية الجلد برعاية مبنية على الأدلة وخطط متابعة واضحة.",
    fee: 500,
    years: 12,
    syndicate: "KXDEV-DER-001",
  },
  {
    email: "kxdev.hesham.nabil@kiorly.dev",
    nameEn: "Dr Hesham Nabil",
    nameAr: "د. هشام نبيل",
    clinicKey: "giza",
    specialty: ClinicalSpecialty.CARDIOLOGY,
    titleEn: "Consultant Cardiologist",
    titleAr: "استشاري أمراض القلب",
    bioEn: "Cardiologist focused on hypertension, chest pain assessment, echocardiography and long-term heart health follow-up.",
    bioAr: "طبيب قلب يركز على ضغط الدم وتقييم ألم الصدر وإيكو القلب والمتابعة طويلة الأمد لصحة القلب.",
    fee: 600,
    years: 18,
    syndicate: "KXDEV-CAR-001",
  },
];

/** Sat–Thu, two sessions a day, Friday off — gives bookable slots on at least 12 of any 14 days. */
function weekJson() {
  return {
    version: 1,
    timezone: "Africa/Cairo",
    days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      slots:
        weekday === 5
          ? []
          : [
              { start: "09:00", end: "13:00" },
              { start: "16:00", end: "20:00" },
            ],
    })),
  };
}

async function ensureMarketplaceClient(prisma: PrismaClient): Promise<void> {
  const existing = await prisma.platformIntegrationClient.findUnique({ where: { clientKey: KX_DEV_CLIENT_KEY } });
  if (existing) {
    const same = await bcrypt.compare(KX_DEV_CLIENT_SECRET, existing.secretHash);
    await prisma.platformIntegrationClient.update({
      where: { id: existing.id },
      data: {
        name: "Kiorex dev marketplace client",
        scopes: ["MARKETPLACE", "ONBOARDING_IMPORT"],
        deactivatedAt: null,
        ...(same ? {} : { secretHash: await bcrypt.hash(KX_DEV_CLIENT_SECRET, 12) }),
      },
    });
    return;
  }
  await prisma.platformIntegrationClient.create({
    data: {
      name: "Kiorex dev marketplace client",
      clientKey: KX_DEV_CLIENT_KEY,
      secretHash: await bcrypt.hash(KX_DEV_CLIENT_SECRET, 12),
      scopes: ["MARKETPLACE", "ONBOARDING_IMPORT"],
    },
  });
}

export async function ensureKiorexDevIntegration(prisma: PrismaClient): Promise<void> {
  await ensureMarketplaceClient(prisma);

  const market = await prisma.market.findFirst({ where: { code: "EG" } });
  if (!market) {
    console.log("Kiorex dev seed: EG market missing — skipped dev doctors (marketplace client ensured).");
    return;
  }
  const passwordHash = bcrypt.hashSync("demo", 10);

  let tenant = await prisma.tenant.findFirst({ where: { name: KX_DEV_TENANT_NAME } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: KX_DEV_TENANT_NAME,
        nameAr: "مجموعة كيوريكس التجريبية للسوق",
        marketId: market.id,
        baseCurrency: "EGP",
        defaultLocale: "ar",
        deploymentCell: market.hostCell,
      },
    });
  }

  // Plan + subscription (ACTIVE, not read-only) so listings are not billing-blocked.
  const plan = await prisma.plan.findFirst({ where: { key: "PRO" } });
  if (plan && !(await prisma.subscription.findUnique({ where: { tenantId: tenant.id } }))) {
    await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        status: "ACTIVE",
        interval: "MONTHLY",
        clinicianSeats: 5,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 365 * 86_400_000),
      },
    });
  }

  const clinicIds = new Map<string, string>();
  for (const c of KX_DEV_CLINICS) {
    let clinic = await prisma.clinic.findFirst({ where: { tenantId: tenant.id, licenseNumber: c.license } });
    if (!clinic) {
      clinic = await prisma.clinic.create({
        data: {
          tenantId: tenant.id,
          nameEn: c.nameEn,
          nameAr: c.nameAr,
          country: "EG",
          city: c.city,
          addressEn: c.addressEn,
          addressAr: c.addressAr,
          locationUrl: `https://maps.google.com/?q=${c.lat},${c.lng}`,
          latitude: c.lat,
          longitude: c.lng,
          phone: c.phone,
          email: `kxdev.${c.key}@kiorly.dev`,
          licenseNumber: c.license,
          defaultCurrency: "EGP",
          defaultLanguage: "ar",
          clinicalSpecialty: ClinicalSpecialty.POLYCLINIC,
        },
      });
    }
    clinicIds.set(c.key, clinic.id);

    // Marketplace-bookable visit types (idempotent by name per clinic).
    for (const t of [
      { nameEn: "Consultation", nameAr: "كشف", durationMinutes: 30, feeFactor: 1 },
      { nameEn: "Follow-up", nameAr: "متابعة", durationMinutes: 15, feeFactor: 0.6 },
    ]) {
      const have = await prisma.appointmentType.findFirst({
        where: { tenantId: tenant.id, clinicId: clinic.id, nameEn: t.nameEn },
      });
      if (!have) {
        const baseFee = KX_DEV_DOCTORS.find((d) => d.clinicKey === c.key)?.fee ?? 400;
        await prisma.appointmentType.create({
          data: {
            tenantId: tenant.id,
            clinicId: clinic.id,
            nameEn: t.nameEn,
            nameAr: t.nameAr,
            durationMinutes: t.durationMinutes,
            feeAmount: Math.round(baseFee * t.feeFactor),
            marketplaceBookable: true,
            isActive: true,
          },
        });
      } else if (!have.marketplaceBookable || !have.isActive) {
        await prisma.appointmentType.update({ where: { id: have.id }, data: { marketplaceBookable: true, isActive: true } });
      }
    }
  }

  for (const d of KX_DEV_DOCTORS) {
    const clinicId = clinicIds.get(d.clinicKey)!;
    const user =
      (await prisma.user.findFirst({ where: { tenantId: tenant.id, email: d.email } })) ??
      (await prisma.user.create({
        data: { tenantId: tenant.id, email: d.email, passwordHash, displayName: d.nameEn, role: UserRole.PHYSICIAN },
      }));

    await prisma.clinicianVerification.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        tenantId: tenant.id,
        status: VerificationStatus.VERIFIED,
        specialty: d.specialty,
        verifiedSpecialty: d.specialty,
        syndicateNumber: d.syndicate,
        titleEn: d.titleEn,
        titleAr: d.titleAr,
        documentKeys: [],
        reviewedAt: new Date(),
      },
      update: { status: VerificationStatus.VERIFIED, specialty: d.specialty, verifiedSpecialty: d.specialty },
    });

    await prisma.clinicianAvailabilityTemplate.upsert({
      where: { tenantId_clinicId_clinicianId: { tenantId: tenant.id, clinicId, clinicianId: user.id } },
      create: { tenantId: tenant.id, clinicId, clinicianId: user.id, weekJson: weekJson(), blockedJson: [] },
      update: { weekJson: weekJson() },
    });

    const types = await prisma.appointmentType.findMany({ where: { tenantId: tenant.id, clinicId, marketplaceBookable: true } });
    const profileJson = {
      displayNameEn: d.nameEn,
      displayNameAr: d.nameAr,
      titleEn: d.titleEn,
      titleAr: d.titleAr,
      specialty: d.specialty,
      gender: "UNSPECIFIED",
      languages: ["ar", "en"],
      bioEn: d.bioEn,
      bioAr: d.bioAr,
      education: [{ degreeEn: "MBBCh, Cairo University", degreeAr: "بكالوريوس الطب والجراحة، جامعة القاهرة" }],
      yearsExperience: d.years,
      photoRelativePath: `kiorex-dev/${d.email.split("@")[0]}.jpg`,
      feesByAppointmentTypeId: Object.fromEntries(types.map((t) => [t.id, Number(t.feeAmount)])),
      amenities: ["wifi", "ac"],
      parking: true,
      wheelchairAccess: true,
    };
    const listing = await prisma.marketplaceListing.findUnique({
      where: { clinicId_clinicianId: { clinicId, clinicianId: user.id } },
    });
    if (!listing) {
      await prisma.marketplaceListing.create({
        data: {
          tenantId: tenant.id,
          clinicId,
          clinicianId: user.id,
          status: ListingStatus.LIVE,
          pausedReason: null,
          listedAt: new Date(),
          profileJson,
        },
      });
    } else {
      await prisma.marketplaceListing.update({
        where: { id: listing.id },
        data: {
          // Respect an owner pause made by a developer; otherwise keep the listing LIVE.
          ...(listing.pausedReason === "owner" ? {} : { status: ListingStatus.LIVE, pausedReason: null }),
          listedAt: listing.listedAt ?? new Date(),
          profileJson,
        },
      });
    }
  }

  console.log(
    `Kiorex dev seed OK — marketplace client ${KX_DEV_CLIENT_KEY}; tenant "${KX_DEV_TENANT_NAME}" with ${KX_DEV_DOCTORS.length} LIVE doctors in ${KX_DEV_CLINICS.length} clinics (login password: demo). ` +
      `Kiorly→Kiorex outbox target: set KIOREX_OUTBOX_WEBHOOK_URL=${KX_DEV_WEBHOOK_URL} KIOREX_OUTBOX_WEBHOOK_SECRET=${KX_DEV_WEBHOOK_SECRET}.`,
  );
}
