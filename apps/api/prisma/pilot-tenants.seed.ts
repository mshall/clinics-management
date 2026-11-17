import {
  BillingInterval,
  Locale,
  PlanKey,
  SubscriptionStatus,
  UserRole,
  type PrismaClient,
} from "@prisma/client";
import { PILOT_TENANT_SPECS, PILOT_TIERS, type PilotTier } from "../src/staging/pilot-tenant-catalog";
import { seedPilotDemoPatients } from "../src/staging/pilot-demo-patients";

async function assignPilotPlan(prisma: PrismaClient, tenantId: string, planKey: PlanKey, clinicianSeats: number) {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { key: planKey } });
  const existing = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!existing) {
    await prisma.subscription.create({
      data: {
        tenantId,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        interval: BillingInterval.MONTHLY,
        clinicianSeats,
        activatedAt: new Date(),
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    return;
  }
  await prisma.subscription.update({
    where: { tenantId },
    data: {
      planId: plan.id,
      status: SubscriptionStatus.ACTIVE,
      trialPlanId: null,
      trialEndsAt: null,
      clinicianSeats,
    },
  });
}

export async function ensurePilotTenant(
  prisma: PrismaClient,
  passwordHash: string,
  tier: PilotTier,
  opts: { replacePatients?: boolean } = {},
): Promise<{ tenantId: string }> {
  const spec = PILOT_TENANT_SPECS[tier];
  const egMarket = await prisma.market.findFirst({ where: { code: "EG" } });

  let tenant = await prisma.tenant.findFirst({ where: { name: spec.nameEn } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: spec.nameEn,
        nameAr: spec.nameAr,
        marketId: egMarket?.id ?? null,
        deploymentCell: "frankfurt",
        baseCurrency: "EGP",
        defaultLocale: Locale.en,
        whatsAppRemindersEnabled: spec.whatsAppReminders,
      },
    });
  } else {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        whatsAppRemindersEnabled: spec.whatsAppReminders,
        marketId: tenant.marketId ?? egMarket?.id ?? null,
      },
    });
  }

  let clinic = await prisma.clinic.findFirst({
    where: { tenantId: tenant.id, licenseNumber: spec.licenseNumber },
  });
  if (!clinic) {
    clinic = await prisma.clinic.create({
      data: {
        tenantId: tenant.id,
        nameEn: `${spec.nameEn} — Cairo`,
        nameAr: `${spec.nameAr} — القاهرة`,
        country: "EG",
        city: "Cairo",
        addressEn: "Pilot clinic — staging only",
        addressAr: "عيادة تجريبية",
        locationUrl: "https://maps.google.com/?q=Cairo",
        phone: "+20105551234",
        email: spec.adminEmail.replace("@", "+clinic@"),
        licenseNumber: spec.licenseNumber,
        defaultLanguage: Locale.en,
        taxRegistrationNumber: "707597870",
      },
    });
  }

  const admin = await prisma.user.upsert({
    where: {
      tenantId_email: { tenantId: tenant.id, email: spec.adminEmail },
    },
    create: {
      tenantId: tenant.id,
      email: spec.adminEmail,
      passwordHash,
      displayName: `${spec.nameEn} Admin`,
      role: UserRole.GROUP_ADMIN,
      isTenantOwner: true,
    },
    update: { passwordHash, deactivatedAt: null, deletedAt: null },
  });

  const physicianEmail = spec.adminEmail.replace("@", "+physician@");
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: physicianEmail } },
    create: {
      tenantId: tenant.id,
      email: physicianEmail,
      passwordHash,
      displayName: "Pilot Physician",
      role: UserRole.PHYSICIAN,
    },
    update: { passwordHash },
  });

  const receptionEmail = spec.adminEmail.replace("@", "+reception@");
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: receptionEmail } },
    create: {
      tenantId: tenant.id,
      email: receptionEmail,
      passwordHash,
      displayName: "Pilot Reception",
      role: UserRole.RECEPTIONIST,
    },
    update: { passwordHash },
  });

  void admin;

  await assignPilotPlan(prisma, tenant.id, spec.planKey, spec.clinicianSeats);

  if (spec.whatsAppReminders) {
    await prisma.tenantFeatureFlag.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key: "whatsapp_reminders" } },
      create: { tenantId: tenant.id, key: "whatsapp_reminders", enabled: true },
      update: { enabled: true },
    });
  }

  if (opts.replacePatients) {
    await seedPilotDemoPatients(prisma, tenant.id, clinic.id);
  } else {
    const count = await prisma.patient.count({ where: { tenantId: tenant.id } });
    if (count === 0) {
      await seedPilotDemoPatients(prisma, tenant.id, clinic.id);
    }
  }

  return { tenantId: tenant.id };
}

export async function ensureAllPilotTenants(prisma: PrismaClient, passwordHash: string): Promise<void> {
  for (const tier of PILOT_TIERS) {
    await ensurePilotTenant(prisma, passwordHash, tier);
  }
  console.log(
    "Pilot tenants ensured (Lite / Pro / Clinic) — password: demo —",
    PILOT_TIERS.map((t) => PILOT_TENANT_SPECS[t].adminEmail).join(", "),
  );
}

export function pilotSeedEnabled(): boolean {
  return (
    process.env.SEED_PILOT_TENANTS === "true" ||
    (process.env.KIORLY_ENV ?? "").trim().toLowerCase() === "staging"
  );
}