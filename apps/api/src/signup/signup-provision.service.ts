import { BadRequestException, Injectable } from "@nestjs/common";
import {
  BillingInterval,
  ClinicalSpecialty,
  EmploymentType,
  MessageChannel,
  PlanKey,
  Prisma,
  SubscriptionStatus,
  UserRole,
} from "@prisma/client";
import * as bcrypt from "bcryptjs";
import {
  DEFAULT_CLINIC_CLOSING_TIME,
  DEFAULT_CLINIC_OPENING_TIME,
  assertValidClinicHours,
  normalizeClinicTime,
} from "../common/clinic-hours";
import { isBaseCurrency } from "../common/base-currencies";
import { defaultCurrencyForCountry } from "../common/country-default-currency";
import { isClinicalSpecialty } from "../common/clinical-specialties";
import { PLAN_NAV_TAB_PRESETS } from "../entitlements/plans-matrix";
import { MarketsService } from "../markets/markets.service";
import { clinicInvoiceDefaultsFromTenant, tenantCreateDefaultsFromMarket } from "../markets/market-tax-pack";
import { assertTenantDeploymentCellMatchesMarket } from "../markets/data-cells";
import { mergeProviderBlock } from "../providers/provider-settings";
import { PrismaService } from "../prisma/prisma.service";
import { addBillingPeriod } from "../subscriptions/subscription-period";
import { TrialEngineService } from "../subscriptions/trial-engine.service";
import { defaultAppointmentTypesForSpecialty } from "./signup-appointment-types";
import { availabilityWeekFromClinicHours } from "./signup-availability";
import { isDisposableEmail } from "./signup-disposable-email";
import { ensureOnboardingProgress } from "../onboarding/onboarding-progress.provision";
import { LegalAcceptanceService } from "../legal/legal-acceptance.service";

const MESSAGE_TEMPLATE_SEEDS: { key: string; channel: MessageChannel; bodyEn: string; bodyAr: string }[] = [
  {
    key: "appointment_confirm",
    channel: MessageChannel.WHATSAPP,
    bodyEn: "Hello {{name}}, your appointment at {{clinic}} is confirmed for {{time}}.",
    bodyAr: "مرحباً {{name}}، تم تأكيد موعدك في {{clinic}} الساعة {{time}}.",
  },
  {
    key: "appointment_reminder_24h",
    channel: MessageChannel.SMS,
    bodyEn: "Reminder: appointment tomorrow at {{time}}. Reply CONFIRM or CANCEL.",
    bodyAr: "تذكير: موعدكم غداً {{time}}. أرسل تأكيد أو إلغاء.",
  },
  {
    key: "appointment_reminder_whatsapp",
    channel: MessageChannel.WHATSAPP,
    bodyEn: "Hello {{name}}, this is a reminder from {{clinic}}: your appointment is on {{time}}.",
    bodyAr: "مرحباً {{name}}، تذكير من {{clinic}}: موعدكم {{time}}.",
  },
];

export type SignupProvisionResult = {
  userId: string;
  tenantId: string;
  clinicId: string;
  planKey: PlanKey;
  marketCode: string;
  specialty: ClinicalSpecialty;
  phone: string;
  salesRepCode: string | null;
  referralCode: string | null;
};

export type SignupProvisionInput = {
  phone: string;
  marketId: string;
  profile: { displayName: string; email: string; password: string };
  specialty: string;
  clinic: {
    nameEn: string;
    nameAr?: string;
    city: string;
    addressEn?: string;
    addressAr?: string;
    locationUrl?: string;
  };
  planKey: string;
  salesRepCode?: string;
  referralCode?: string;
  legalAcceptances?: { document: string; version: string }[];
};

@Injectable()
export class SignupProvisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly markets: MarketsService,
    private readonly legal: LegalAcceptanceService,
  ) {}

  async provision(input: SignupProvisionInput): Promise<SignupProvisionResult> {
    const email = input.profile.email.normalize("NFKC").trim().toLowerCase();
    if (!email.includes("@")) throw new BadRequestException("Valid email is required");
    if (isDisposableEmail(email)) throw new BadRequestException("Disposable email addresses are not allowed");
    const password = input.profile.password;
    if (!password || password.length < 8) throw new BadRequestException("Password must be at least 8 characters");
    const displayName = input.profile.displayName?.trim();
    if (!displayName) throw new BadRequestException("Name is required");
    if (!isClinicalSpecialty(input.specialty)) throw new BadRequestException("Invalid specialty");
    const specialty = input.specialty as ClinicalSpecialty;

    const planRaw = input.planKey?.trim().toUpperCase();
    const planKey = planRaw === PlanKey.PRO || planRaw === PlanKey.LITE ? (planRaw as PlanKey) : null;
    if (!planKey) throw new BadRequestException("planKey must be LITE or PRO");

    this.legal.assertSignupLegal(planKey, input.legalAcceptances);

    const market = await this.markets.assertMarketForNewTenant(input.marketId);
    const packDefaults = tenantCreateDefaultsFromMarket(market);
    assertTenantDeploymentCellMatchesMarket({ deploymentCell: packDefaults.deploymentCell }, market);

    const clinicNameEn = input.clinic.nameEn.trim();
    const clinicNameAr = input.clinic.nameAr?.trim() || clinicNameEn;
    const city = input.clinic.city.trim();
    if (!clinicNameEn || !city) throw new BadRequestException("Clinic name and city are required");

    const tenantName = clinicNameEn;
    const tenantNameAr = clinicNameAr;

    const openingTime = normalizeClinicTime(undefined, DEFAULT_CLINIC_OPENING_TIME);
    const closingTime = normalizeClinicTime(undefined, DEFAULT_CLINIC_CLOSING_TIME);
    assertValidClinicHours(openingTime, closingTime);

    const weekendDays = Array.isArray(market.weekendDays)
      ? (market.weekendDays as number[]).filter((n) => Number.isInteger(n))
      : [5, 6];
    const timezone = market.defaultTimezone?.trim() || "Africa/Cairo";
    const country = market.defaultPhoneRegion?.trim() || market.code;
    const defaultCurrency =
      isBaseCurrency(market.defaultCurrency?.trim() ?? "")
        ? market.defaultCurrency.trim()
        : defaultCurrencyForCountry(country) || "EGP";

    const result = await this.prisma.$transaction(async (tx) => {
      const clash = await tx.user.findFirst({ where: { email } });
      if (clash) throw new BadRequestException("Email already in use");

      const etaOptOutDefault =
        market.code === "EG"
          ? (mergeProviderBlock(null, "eta-egypt", {
              platformEtaIntegrationEnabled: false,
              physicalReportingOptOut: true,
            }) as object)
          : undefined;

      const tenant = await tx.tenant.create({
        data: {
          name: tenantName,
          nameAr: tenantNameAr,
          marketId: market.id,
          deploymentCell: packDefaults.deploymentCell,
          baseCurrency: market.defaultCurrency?.trim() || defaultCurrency,
          defaultLocale: market.defaultLocale || "ar",
          defaultVisitFee: packDefaults.defaultVisitFee,
          defaultInvoiceVatPercent: packDefaults.defaultInvoiceVatPercent,
          defaultTaxRegistrationNumber: packDefaults.defaultTaxRegistrationNumber,
          ...(etaOptOutDefault ? { providerSettings: etaOptOutDefault } : {}),
          salesRepCode: input.salesRepCode?.trim() || null,
          referralCode: input.referralCode?.trim() || null,
        },
      });

      const passwordHash = bcrypt.hashSync(password, 10);
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email,
          displayName,
          passwordHash,
          role: UserRole.PHYSICIAN,
          additionalRoles: [UserRole.GROUP_ADMIN],
          isTenantOwner: true,
        },
      });

      const clinicTax = clinicInvoiceDefaultsFromTenant(market, tenant);
      const addressEn = input.clinic.addressEn?.trim() || city;
      const addressAr = input.clinic.addressAr?.trim() || city;
      const locationUrl = input.clinic.locationUrl?.trim() || "https://maps.google.com/";
      const openedAt = new Date();
      openedAt.setHours(0, 0, 0, 0);

      const clinic = await tx.clinic.create({
        data: {
          tenantId: tenant.id,
          nameEn: clinicNameEn,
          nameAr: clinicNameAr,
          country,
          city,
          addressEn,
          addressAr,
          locationUrl,
          phone: input.phone,
          email,
          licenseNumber: "SELF-SERVE-PENDING",
          defaultCurrency,
          clinicalSpecialty: specialty,
          taxRegistrationNumber: clinicTax.taxRegistrationNumber,
          invoiceVatPercent: clinicTax.invoiceVatPercent,
          openingTime,
          closingTime,
          timezone,
          weekendDays: weekendDays as unknown as Prisma.InputJsonValue,
          operatingPeriods: { create: { startDate: openedAt } },
        },
      });

      await tx.employee.create({
        data: {
          tenantId: tenant.id,
          clinicId: clinic.id,
          employeeNumber: "OWNER-001",
          firstNameEn: displayName.split(/\s+/)[0] ?? displayName,
          lastNameEn: displayName.split(/\s+/).slice(1).join(" ") || "Owner",
          firstNameAr: displayName,
          lastNameAr: displayName,
          email,
          phone: input.phone,
          jobTitle: "Physician",
          employmentType: EmploymentType.FULL_TIME,
          clinicalSpecialty: specialty,
          hireDate: openedAt,
          salaryBase: 0,
          salaryCurrency: tenant.baseCurrency,
          userId: user.id,
        },
      });

      await tx.creditWallet.create({
        data: { tenantId: tenant.id, balance: 0, currency: tenant.baseCurrency, version: 0 },
      });

      const plan = await tx.plan.findUnique({ where: { key: planKey } });
      if (!plan) throw new BadRequestException("Plan not available in this environment");

      const interval = BillingInterval.MONTHLY;
      const price = await tx.planPrice.findFirst({
        where: { planId: plan.id, marketId: market.id, interval, validTo: null },
        orderBy: { priceVersion: "desc" },
      });

      const now = new Date();
      const periodEnd = addBillingPeriod(now, interval);
      const paidTrial = planKey === PlanKey.PRO || planKey === PlanKey.CLINIC;
      const trialPlan =
        paidTrial ? await tx.plan.findUnique({ where: { key: planKey === PlanKey.CLINIC ? PlanKey.CLINIC : PlanKey.PRO } }) : null;

      let status: SubscriptionStatus = SubscriptionStatus.ACTIVE;
      let trialStartsAt: Date | null = null;
      let trialEndsAt: Date | null = null;
      let trialPlanId: string | null = null;
      if (paidTrial && trialPlan) {
        status = SubscriptionStatus.TRIALING;
        trialStartsAt = now;
        trialEndsAt = TrialEngineService.trialEndsAtForNewSignup(now, market.featureDefaults, null);
        trialPlanId = trialPlan.id;
      }

      const sub = await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          planPriceId: price?.id ?? null,
          status,
          interval,
          clinicianSeats: 1,
          trialStartsAt,
          trialEndsAt,
          trialPlanId,
          activatedAt: status === SubscriptionStatus.ACTIVE ? now : null,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });
      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: sub.id,
          type: "created",
          toJson: { status, planKey, interval, source: "public_signup" } as Prisma.InputJsonValue,
        },
      });

      const visitFee = Number(tenant.defaultVisitFee);
      const typeSeeds = defaultAppointmentTypesForSpecialty(specialty);
      for (const seed of typeSeeds) {
        await tx.appointmentType.create({
          data: {
            tenantId: tenant.id,
            clinicId: clinic.id,
            nameEn: seed.nameEn,
            nameAr: seed.nameAr,
            durationMinutes: seed.durationMinutes,
            feeAmount: seed.feeUsesTenantDefault ? visitFee : 0,
          },
        });
      }

      const weekJson = availabilityWeekFromClinicHours(openingTime, closingTime, weekendDays, timezone);
      await tx.clinicianAvailabilityTemplate.create({
        data: {
          tenantId: tenant.id,
          clinicId: clinic.id,
          clinicianId: user.id,
          weekJson,
          blockedJson: [],
        },
      });

      for (const t of MESSAGE_TEMPLATE_SEEDS) {
        await tx.messageTemplate.upsert({
          where: { tenantId_key_channel: { tenantId: tenant.id, key: t.key, channel: t.channel } },
          create: {
            tenantId: tenant.id,
            key: t.key,
            channel: t.channel,
            bodyEn: t.bodyEn,
            bodyAr: t.bodyAr,
          },
          update: {},
        });
      }

      const navPreset = PLAN_NAV_TAB_PRESETS[planKey];
      for (const role of [UserRole.GROUP_ADMIN, UserRole.PHYSICIAN]) {
        await tx.tenantRoleNavTabGrant.create({
          data: {
            tenantId: tenant.id,
            role,
            tabKeys: [...navPreset] as unknown as Prisma.InputJsonValue,
          },
        });
      }
      await tx.userNavTabGrant.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          tabKeys: [...navPreset] as unknown as Prisma.InputJsonValue,
        },
      });

      await ensureOnboardingProgress(tx, tenant.id);

      return {
        userId: user.id,
        tenantId: tenant.id,
        clinicId: clinic.id,
        planKey,
        marketCode: market.code,
        specialty,
        phone: input.phone,
        salesRepCode: tenant.salesRepCode,
        referralCode: tenant.referralCode,
      };
    });
    if (input.legalAcceptances?.length) {
      await this.legal.recordMany(result.tenantId, result.userId, input.legalAcceptances);
    }
    return result;
  }
}