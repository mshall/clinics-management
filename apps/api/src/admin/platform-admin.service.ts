import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { BillingInterval, PlanKey, SubscriptionStatus, UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import type { JwtUser } from "../auth/jwt-user";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { isBaseCurrency } from "../common/base-currencies";
import { syncInheritedClinicCurrencies } from "../common/sync-inherited-clinic-currencies";
import { ClinicsService } from "../clinics/clinics.service";
import type { ClinicKind } from "../clinics/clinic-kind";
import { resolveClinicKind } from "../clinics/clinic-kind";
import type { CreateClinicDto } from "../clinics/dto/create-clinic.dto";
import type { PatchClinicDto } from "../clinics/dto/patch-clinic.dto";
import { paginate, parsePageParams } from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";
import { AdminService } from "./admin.service";
import type { CreateTenantDto } from "./dto/create-tenant.dto";
import type { CreateTenantUserDto } from "./dto/create-tenant-user.dto";
import type { PlatformPatchTenantDto } from "./dto/platform-patch-tenant.dto";
import type { PlatformPatchTenantUserDto } from "./dto/platform-patch-tenant-user.dto";
import type { DeactivateTenantUserDto } from "./dto/deactivate-tenant-user.dto";
import type { ReactivateTenantUserDto } from "./dto/reactivate-tenant-user.dto";
import { MarketsService } from "../markets/markets.service";
import { tenantCreateDefaultsFromMarket } from "../markets/market-tax-pack";
import { normalizeOrgTaxRegistrationNumber } from "../common/sync-clinic-invoice-tax";
import { ensureTenantSubscription } from "../subscriptions/subscription-provision";
import { TrialEngineService } from "../subscriptions/trial-engine.service";
import { CreditWalletService } from "../credits/credit-wallet.service";
import { CreditReason } from "@prisma/client";
import { KiorlyPaymentService } from "../billing-platform/kiorly-payment.service";
import type { TrialConfigOverride } from "../subscriptions/trial-config";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { hasAnyRole, hasAnyRoleInSet, hasRole } from "../common/effective-roles";
import { assertTenantDeploymentCellMatchesMarket } from "../markets/data-cells";
import { ACTIVE_PRICE_WHERE } from "../plans/plans-active-prices";
import { BillingSeatService } from "../subscriptions/billing-seat.service";
import { addBillingPeriod } from "../subscriptions/subscription-period";

@Injectable()
export class PlatformAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: AdminService,
    private readonly clinics: ClinicsService,
    private readonly markets: MarketsService,
    private readonly entitlements: EntitlementsService,
    private readonly trialEngine: TrialEngineService,
    private readonly creditWallet: CreditWalletService,
    private readonly kiorlyPayments: KiorlyPaymentService,
    private readonly billingSeats: BillingSeatService,
  ) {}

  verifyKiorlyPayment(user: JwtUser, paymentId: string, body: { approved: boolean }) {
    this.assertPlatform(user);
    return this.kiorlyPayments.verifyManualPayment(user, paymentId, body.approved);
  }

  grantTenantCredits(
    user: JwtUser,
    tenantId: string,
    body: {
      amount: number;
      reason: CreditReason;
      expiresAt?: string | null;
      note?: string;
      secondApproverUserId?: string;
    },
  ) {
    return this.creditWallet.grantManual(user, tenantId, body);
  }

  extendTenantTrial(
    user: JwtUser,
    tenantId: string,
    body: { days: number; reason: string; trialConfigOverride?: TrialConfigOverride },
  ) {
    this.assertPlatform(user);
    return this.trialEngine.extendTrial(tenantId, body.days, body.reason.trim(), user.userId).then(async (r) => {
      if (body.trialConfigOverride) {
        await this.trialEngine.patchTrialConfigOverride(
          tenantId,
          body.trialConfigOverride,
          body.reason.trim(),
          user.userId,
        );
      }
      return r;
    });
  }

  async putTenantEntitlementOverride(
    user: JwtUser,
    tenantId: string,
    key: string,
    body: { valueJson: unknown; reason: string; expiresAt?: string | null },
  ) {
    this.assertPlatform(user);
    const id = tenantId.trim();
    const trimmedKey = key.trim();
    const row = await this.entitlements.setTenantOverride(
      id,
      trimmedKey,
      body.valueJson,
      body.reason.trim(),
      user.userId,
      body.expiresAt ? new Date(body.expiresAt) : null,
    );
    await this.prisma.auditLog.create({
      data: {
        tenantId: id,
        actorId: user.userId,
        action: "entitlement.override_set",
        resource: "TenantEntitlementOverride",
        resourceId: `${id}:${trimmedKey}`,
        metadata: {
          key: trimmedKey,
          reason: body.reason.trim(),
          expiresAt: body.expiresAt ?? null,
          overrideId: row.id,
        },
      },
    });
    return row;
  }

  /**
   * Ops force-assign a catalog plan on an organization (immediate; skips owner self-serve billing flow).
   * Use for demo/support — not a substitute for paid checkout in production.
   */
  async setTenantPlan(
    user: JwtUser,
    tenantId: string,
    body: {
      planKey: PlanKey;
      reason: string;
      interval?: BillingInterval;
      clinicianSeats?: number;
      status?: "ACTIVE" | "TRIALING";
    },
  ) {
    this.assertPlatform(user);
    const id = this.normalizeTenantId(tenantId);
    const reason = body.reason?.trim() ?? "";
    if (reason.length < 3) throw new BadRequestException("Reason is required (min 3 characters)");
    if (!Object.values(PlanKey).includes(body.planKey)) {
      throw new BadRequestException("Unknown planKey");
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true, marketId: true, name: true },
    });
    if (!tenant) throw new NotFoundException("Organization not found");
    const marketId = tenant.marketId;
    if (!marketId) throw new BadRequestException("Organization has no market — cannot price a plan");

    await ensureTenantSubscription(this.prisma, id, {
      planKey: body.planKey,
      clinicianSeats: body.clinicianSeats ?? 5,
    });

    const plan = await this.prisma.plan.findUnique({ where: { key: body.planKey } });
    if (!plan) throw new BadRequestException("Unknown plan");

    const requestedInterval =
      body.interval === BillingInterval.ANNUAL ? BillingInterval.ANNUAL : BillingInterval.MONTHLY;
    const findPrice = (interval: BillingInterval) =>
      this.prisma.planPrice.findFirst({
        where: {
          planId: plan.id,
          marketId,
          interval,
          ...ACTIVE_PRICE_WHERE(),
        },
        orderBy: { priceVersion: "desc" },
      });
    // Prefer a price matching the requested interval. If Annual is missing, fall back to
    // Monthly pricing for invoicing — but still store/period using the requested interval so
    // ops "Annual" always advances currentPeriodEnd by ~1 year (not another month).
    let price = await findPrice(requestedInterval);
    if (!price && requestedInterval === BillingInterval.ANNUAL) {
      price = await findPrice(BillingInterval.MONTHLY);
    }
    if (!price) {
      throw new BadRequestException(
        `No active ${requestedInterval} (or MONTHLY) price for ${body.planKey} in this market`,
      );
    }
    const interval = requestedInterval;

    const existing = await this.prisma.subscription.findUnique({
      where: { tenantId: id },
      include: { plan: true },
    });
    if (!existing) throw new NotFoundException("Subscription not found");

    const seats = Math.max(1, body.clinicianSeats ?? existing.clinicianSeats);
    const status =
      body.status === "TRIALING"
        ? SubscriptionStatus.TRIALING
        : body.status === "ACTIVE"
          ? SubscriptionStatus.ACTIVE
          : existing.status === SubscriptionStatus.TRIALING
            ? SubscriptionStatus.ACTIVE
            : existing.status;

    // Reset billing window so Annual shows ~1 year and Monthly ~1 month from now.
    const periodStart = new Date();
    const periodEnd = addBillingPeriod(periodStart, interval);

    const updated = await this.prisma.subscription.update({
      where: { id: existing.id },
      data: {
        planId: plan.id,
        planPriceId: price.id,
        interval,
        clinicianSeats: seats,
        status,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        activatedAt:
          status === SubscriptionStatus.ACTIVE ? (existing.activatedAt ?? new Date()) : existing.activatedAt,
        scheduledPlanId: null,
        scheduledPlanPriceId: null,
        scheduledInterval: null,
        scheduledClinicianSeats: null,
        scheduledEffectiveAt: null,
      },
      include: { plan: true },
    });

    await this.prisma.subscriptionEvent.create({
      data: {
        subscriptionId: updated.id,
        type: "ops_plan_set",
        fromJson: {
          planKey: existing.plan.key,
          planId: existing.planId,
          planPriceId: existing.planPriceId,
          clinicianSeats: existing.clinicianSeats,
          status: existing.status,
        },
        toJson: {
          planKey: updated.plan.key,
          planId: updated.planId,
          planPriceId: updated.planPriceId,
          clinicianSeats: updated.clinicianSeats,
          status: updated.status,
          interval: updated.interval,
          reason,
        },
        actorUserId: user.userId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: id,
        actorId: user.userId,
        action: "subscription.ops_plan_set",
        resource: "Subscription",
        resourceId: updated.id,
        metadata: {
          fromPlanKey: existing.plan.key,
          toPlanKey: updated.plan.key,
          clinicianSeats: seats,
          status: updated.status,
          reason,
        },
      },
    });

    await this.billingSeats.reconcileToSeatCap(id, seats);

    return {
      tenantId: id,
      tenantName: tenant.name,
      planKey: updated.plan.key,
      planNameEn: updated.plan.nameEn,
      status: updated.status,
      clinicianSeats: updated.clinicianSeats,
      interval: updated.interval,
      currentPeriodStart: updated.currentPeriodStart.toISOString(),
      currentPeriodEnd: updated.currentPeriodEnd.toISOString(),
    };
  }

  private assertPlatform(user: JwtUser): void {
    if (!isPlatformSuperAdmin(user)) {
      throw new ForbiddenException("Only platform super administrators can use this API");
    }
  }

  private async assertTenant(tenantId: string) {
    const id = tenantId.trim();
    if (!id) throw new NotFoundException("Organization not found");
    const row = await this.prisma.tenant.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Organization not found");
    return row;
  }

  private normalizeTenantId(tenantId: string): string {
    return tenantId.trim();
  }

  async getOverview(user: JwtUser) {
    this.assertPlatform(user);
    const [tenantCount, userCount, clinicCount, patientCount, encounterCount] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.user.count({ where: { tenantId: { not: null } } }),
      this.prisma.clinic.count(),
      this.prisma.patient.count(),
      this.prisma.encounter.count(),
    ]);
    const recentTenants = await this.prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: { select: { users: true, clinics: true } },
      },
    });
    return {
      tenantCount,
      userCount,
      clinicCount,
      patientCount,
      encounterCount,
      recentTenants: recentTenants.map((t) => ({
        id: t.id,
        name: t.name,
        createdAt: t.createdAt.toISOString(),
        userCount: t._count.users,
        clinicCount: t._count.clinics,
      })),
    };
  }

  listTenants(
    user: JwtUser,
    pageStr?: string,
    pageSizeStr?: string,
    sortByStr?: string,
    sortOrderStr?: string,
    q?: string,
  ) {
    this.assertPlatform(user);
    return this.admin.listTenants(pageStr, pageSizeStr, sortByStr, sortOrderStr, q);
  }

  async getTenant(user: JwtUser, tenantId: string) {
    this.assertPlatform(user);
    const id = this.normalizeTenantId(tenantId);
    const row = await this.prisma.tenant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        nameAr: true,
        status: true,
        baseCurrency: true,
        defaultLocale: true,
        defaultVisitFee: true,
        createdAt: true,
        salesRepCode: true,
        createdBySalesRepId: true,
        providerSettings: true,
        market: { select: { code: true, nameEn: true } },
        subscription: {
          select: {
            id: true,
            status: true,
            interval: true,
            plan: { select: { key: true, nameEn: true, nameAr: true } },
            currentPeriodStart: true,
            currentPeriodEnd: true,
            trialEndsAt: true,
            clinicianSeats: true,
            priceLockUntil: true,
          },
        },
        onboardingProgress: { select: { activatedAt: true, completedAt: true, stepsJson: true } },
        creditWallet: { select: { balance: true, currency: true } },
        entitlementOverrides: { select: { key: true, valueJson: true, reason: true, createdAt: true } },
        marketplaceListings: {
          select: { id: true, status: true, clinicianId: true, clinicId: true },
          take: 50,
        },
        clinicianVerifications: {
          select: { id: true, status: true, userId: true, specialty: true },
          take: 50,
        },
        kiorlyInvoices: {
          select: { id: true, status: true, total: true, currency: true, periodKey: true, issuedAt: true },
          orderBy: { issuedAt: "desc" },
          take: 12,
        },
        _count: { select: { users: true, clinics: true, patients: true } },
      },
    });
    if (!row) throw new NotFoundException("Organization not found");

    const auditEvents = await this.prisma.auditLog.findMany({
      where: {
        tenantId: id,
        action: {
          in: [
            "subscription.trial_extended",
            "credit.grant",
            "entitlement.override_set",
            "kiorly_invoice.issued",
            "kiorly_payment.verified",
            "marketplace.booking.created",
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, action: true, resource: true, resourceId: true, createdAt: true, actorId: true },
    });

    const steps = (row.onboardingProgress?.stepsJson ?? {}) as Record<string, unknown>;
    const stepValues = Object.values(steps);
    const doneSteps = stepValues.filter((s) => {
      if (s && typeof s === "object" && "status" in s) return (s as { status?: string }).status === "done";
      return false;
    }).length;
    const activationScore =
      row.onboardingProgress?.activatedAt != null
        ? 100
        : stepValues.length === 0
          ? 0
          : Math.round((doneSteps / Math.max(stepValues.length, 1)) * 100);

    return {
      id: row.id,
      name: row.name,
      nameAr: row.nameAr,
      status: row.status,
      baseCurrency: row.baseCurrency,
      defaultLocale: row.defaultLocale,
      defaultVisitFee: Number(row.defaultVisitFee),
      createdAt: row.createdAt.toISOString(),
      marketCode: row.market?.code ?? null,
      marketNameEn: row.market?.nameEn ?? null,
      salesRepCode: row.salesRepCode,
      createdBySalesRepId: row.createdBySalesRepId,
      counts: row._count,
      subscription: row.subscription
        ? {
            id: row.subscription.id,
            status: row.subscription.status,
            interval: row.subscription.interval,
            planKey: row.subscription.plan.key,
            planNameEn: row.subscription.plan.nameEn,
            planNameAr: row.subscription.plan.nameAr,
            currentPeriodStart: row.subscription.currentPeriodStart?.toISOString() ?? null,
            currentPeriodEnd: row.subscription.currentPeriodEnd?.toISOString() ?? null,
            trialEndsAt: row.subscription.trialEndsAt?.toISOString() ?? null,
            clinicianSeats: row.subscription.clinicianSeats,
            priceLockUntil: row.subscription.priceLockUntil?.toISOString() ?? null,
          }
        : null,
      trial: {
        endsAt: row.subscription?.trialEndsAt?.toISOString() ?? null,
        activatedAt: row.onboardingProgress?.activatedAt?.toISOString() ?? null,
        onboardingCompletedAt: row.onboardingProgress?.completedAt?.toISOString() ?? null,
      },
      wallet: row.creditWallet
        ? { balance: Number(row.creditWallet.balance), currency: row.creditWallet.currency }
        : { balance: 0, currency: row.baseCurrency },
      entitlementOverrides: row.entitlementOverrides.map((o) => ({
        key: o.key,
        valueJson: o.valueJson,
        reason: o.reason,
        createdAt: o.createdAt.toISOString(),
      })),
      kiorexListings: row.marketplaceListings,
      verifications: row.clinicianVerifications,
      invoices: row.kiorlyInvoices.map((inv) => ({
        id: inv.id,
        status: inv.status,
        total: Number(inv.total),
        currency: inv.currency,
        periodKey: inv.periodKey,
        issuedAt: inv.issuedAt?.toISOString() ?? null,
      })),
      activationScore,
      events: auditEvents.map((e) => ({
        id: e.id,
        action: e.action,
        resource: e.resource,
        resourceId: e.resourceId,
        actorId: e.actorId,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }

  async createTenant(user: JwtUser, dto: CreateTenantDto) {
    this.assertPlatform(user);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException("name is required");
    const nameAr = dto.nameAr.trim();
    if (!nameAr) throw new BadRequestException("nameAr is required");

    const ga = dto.groupAdmin;
    if (ga) {
      if (!ga.email?.trim() || !ga.password || !ga.displayName?.trim()) {
        throw new BadRequestException("groupAdmin requires email, password, and displayName");
      }
    }

    const ic = dto.initialClinic;
    const hasInitialClinic = Boolean(
      ic &&
        (ic.nameEn?.trim() ||
          ic.nameAr?.trim() ||
          ic.city?.trim() ||
          ic.addressEn?.trim() ||
          ic.addressAr?.trim() ||
          ic.locationUrl?.trim()),
    );
    if (hasInitialClinic && ic) {
      if (!ic.nameEn?.trim() || !ic.nameAr?.trim() || !ic.city?.trim()) {
        throw new BadRequestException("initialClinic requires nameEn, nameAr, and city");
      }
      if (!ic.addressEn?.trim() || !ic.addressAr?.trim() || !ic.locationUrl?.trim()) {
        throw new BadRequestException("initialClinic requires addressEn, addressAr, and locationUrl");
      }
    }

    const market = dto.marketId?.trim()
      ? await this.markets.assertMarketForNewTenant(dto.marketId.trim())
      : await this.prisma.market.findFirst({ where: { code: "EG", status: "LIVE" } }).then(async (m) => {
          if (!m) return null;
          return this.markets.assertMarketForNewTenant(m.id);
        });
    if (!market) {
      throw new BadRequestException("Select a live country market before creating an organization");
    }
    const packDefaults = tenantCreateDefaultsFromMarket(market);
    const deploymentCell = dto.deploymentCell?.trim() || packDefaults.deploymentCell;
    assertTenantDeploymentCellMatchesMarket({ deploymentCell }, market);
    const baseCurrency = dto.baseCurrency?.trim() || market?.defaultCurrency?.trim();
    if (!baseCurrency) {
      throw new BadRequestException("baseCurrency is required (or set defaultCurrency on the market pack)");
    }
    const defaultLocale = dto.defaultLocale?.trim() || market?.defaultLocale || "en";

    const result = await this.prisma.$transaction(async (tx) => {
      const row = await tx.tenant.create({
        data: {
          name,
          nameAr,
          marketId: market.id,
          deploymentCell,
          baseCurrency,
          defaultLocale,
          defaultVisitFee: packDefaults.defaultVisitFee,
          defaultInvoiceVatPercent: packDefaults.defaultInvoiceVatPercent,
          defaultTaxRegistrationNumber: dto.defaultTaxRegistrationNumber?.trim()
            ? normalizeOrgTaxRegistrationNumber(dto.defaultTaxRegistrationNumber)
            : packDefaults.defaultTaxRegistrationNumber,
          ...(dto.defaultLicenseNumber?.trim() ? { defaultLicenseNumber: dto.defaultLicenseNumber.trim() } : {}),
        },
      });

      let groupAdmin: { id: string; email: string; displayName: string; role: UserRole } | null = null;
      if (ga) {
        const email = ga.email.toLowerCase().trim();
        const clash = await tx.user.findFirst({ where: { email } });
        if (clash) throw new BadRequestException("Email already in use on the platform");
        const u = await tx.user.create({
          data: {
            tenantId: row.id,
            email,
            displayName: ga.displayName.trim(),
            passwordHash: bcrypt.hashSync(ga.password, 10),
            role: UserRole.GROUP_ADMIN,
            isTenantOwner: true,
          },
        });
        groupAdmin = { id: u.id, email: u.email, displayName: u.displayName, role: u.role };
      }

      return { row, groupAdmin };
    });

    await ensureTenantSubscription(this.prisma, result.row.id, {
      planKey: PlanKey.LITE,
      trialDays: 14,
      trialPlanKey: PlanKey.PRO,
    });

    let initialClinic: { id: string; nameEn: string; kind: ClinicKind } | null = null;
    if (hasInitialClinic && ic) {
      const license =
        ic.licenseNumber?.trim() || result.row.defaultLicenseNumber?.trim() || undefined;
      const created = await this.clinics.create(result.row.id, {
        ...ic,
        parentClinicId: undefined,
        licenseNumber: license,
        country: ic.country?.trim() || market.code,
      });
      initialClinic = { id: created.id, nameEn: created.nameEn, kind: created.kind };
    }

    return {
      id: result.row.id,
      name: result.row.name,
      nameAr: result.row.nameAr,
      baseCurrency: result.row.baseCurrency,
      defaultLocale: result.row.defaultLocale,
      createdAt: result.row.createdAt.toISOString(),
      groupAdmin: result.groupAdmin,
      initialClinic,
      counts: {
        users: result.groupAdmin ? 1 : 0,
        clinics: initialClinic ? 1 : 0,
        patients: 0,
      },
    };
  }

  async patchTenant(user: JwtUser, tenantId: string, dto: PlatformPatchTenantDto) {
    this.assertPlatform(user);
    const id = this.normalizeTenantId(tenantId);
    const existing = await this.assertTenant(id);
    const data: {
      name?: string;
      nameAr?: string;
      baseCurrency?: string;
      defaultLocale?: string;
      defaultVisitFee?: number;
    } = {};
    if (dto.name !== undefined) {
      const n = dto.name.trim();
      if (!n) throw new BadRequestException("name cannot be empty");
      data.name = n;
    }
    if (dto.nameAr !== undefined) {
      data.nameAr = dto.nameAr.trim();
    }
    if (dto.baseCurrency !== undefined) {
      const next = dto.baseCurrency.trim();
      if (!isBaseCurrency(next)) throw new BadRequestException("Invalid base currency");
      data.baseCurrency = next;
    }
    if (dto.defaultLocale !== undefined) data.defaultLocale = dto.defaultLocale.trim();
    if (dto.defaultVisitFee !== undefined) data.defaultVisitFee = dto.defaultVisitFee;
    if (!Object.keys(data).length) throw new BadRequestException("No supported fields to update");

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.tenant.update({ where: { id }, data });
      if (data.baseCurrency && data.baseCurrency !== existing.baseCurrency) {
        await syncInheritedClinicCurrencies(tx, id, existing.baseCurrency, data.baseCurrency);
      }
      return updated;
    });

    return {
      id: row.id,
      name: row.name,
      nameAr: row.nameAr,
      baseCurrency: row.baseCurrency,
      defaultLocale: row.defaultLocale,
      defaultVisitFee: Number(row.defaultVisitFee),
    };
  }

  listUsers(
    user: JwtUser,
    tenantId: string,
    pageStr?: string,
    pageSizeStr?: string,
    archivedRaw?: string,
  ) {
    this.assertPlatform(user);
    return this.admin.listTenantUsers(tenantId, pageStr, pageSizeStr, undefined, undefined, archivedRaw);
  }

  async listAllUsers(
    user: JwtUser,
    pageStr?: string,
    pageSizeStr?: string,
    tenantIdFilter?: string,
    archivedRaw?: string,
  ) {
    this.assertPlatform(user);
    const archived = archivedRaw === "true" || archivedRaw === "1";
    const tenantId = tenantIdFilter?.trim();
    if (tenantId) {
      const page = await this.admin.listTenantUsers(
        tenantId,
        pageStr,
        pageSizeStr,
        undefined,
        undefined,
        archivedRaw,
      );
      const tenant = await this.assertTenant(tenantId);
      return {
        ...page,
        items: page.items.map((item) => ({
          ...item,
          tenantId,
          tenantName: tenant.name,
        })),
      };
    }

    const { page, pageSize, skip } = parsePageParams(pageStr, pageSizeStr);
    const where = {
      NOT: { tenantId: null },
      ...(archived
        ? { OR: [{ deletedAt: { not: null } }, { deactivatedAt: { not: null } }] }
        : { deletedAt: null, deactivatedAt: null }),
    };
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ tenant: { name: "asc" } }, { email: "asc" }],
        skip,
        take: pageSize,
        include: {
          tenant: { select: { id: true, name: true } },
          clinicAdminScopes: { include: { clinic: { select: { id: true, nameEn: true } } } },
          employee: { include: { clinic: { select: { id: true, nameEn: true } } } },
        },
      }),
    ]);
    const items = rows.map((r) => {
      const byId = new Map<string, { id: string; nameEn: string }>();
      for (const s of r.clinicAdminScopes) byId.set(s.clinic.id, s.clinic);
      if (r.employee?.clinic && !byId.has(r.employee.clinic.id)) {
        byId.set(r.employee.clinic.id, r.employee.clinic);
      }
      const clinics = [...byId.values()];
      return {
        id: r.id,
        tenantId: r.tenantId,
        tenantName: r.tenant?.name ?? "—",
        email: r.email,
        displayName: r.displayName,
        role: r.role,
        createdAt: r.createdAt.toISOString(),
        deactivatedAt: r.deactivatedAt?.toISOString() ?? null,
        deletedAt: r.deletedAt?.toISOString() ?? null,
        archived: Boolean(r.deletedAt || r.deactivatedAt),
        clinicIds: clinics.map((c) => c.id),
        clinics,
      };
    });
    return paginate(items, total, page, pageSize);
  }

  getUser(user: JwtUser, tenantId: string, userId: string) {
    this.assertPlatform(user);
    return this.admin.getTenantUser(tenantId, userId);
  }

  patchUser(user: JwtUser, tenantId: string, userId: string, dto: PlatformPatchTenantUserDto) {
    this.assertPlatform(user);
    return this.admin.updateTenantUser(tenantId, userId, dto, user);
  }

  deleteUser(user: JwtUser, tenantId: string, userId: string) {
    this.assertPlatform(user);
    return this.admin.deleteTenantUser(tenantId, userId, user);
  }

  deactivateUser(user: JwtUser, tenantId: string, userId: string, dto: DeactivateTenantUserDto) {
    this.assertPlatform(user);
    return this.admin.deactivateTenantUser(tenantId, userId, dto, user);
  }

  reactivateUser(user: JwtUser, tenantId: string, userId: string, dto: ReactivateTenantUserDto) {
    this.assertPlatform(user);
    return this.admin.reactivateTenantUser(tenantId, userId, dto);
  }

  restoreUser(user: JwtUser, tenantId: string, userId: string, dto: ReactivateTenantUserDto) {
    this.assertPlatform(user);
    return this.admin.restoreTenantUserAccount(tenantId, userId, dto);
  }

  async listAllClinics(user: JwtUser, tenantIdFilter?: string) {
    this.assertPlatform(user);
    const rows = await this.prisma.clinic.findMany({
      where: tenantIdFilter?.trim() ? { tenantId: tenantIdFilter.trim() } : undefined,
      orderBy: [{ tenant: { name: "asc" } }, { parentClinicId: "asc" }, { nameEn: "asc" }],
      include: {
        tenant: { select: { id: true, name: true } },
        parent: { select: { nameEn: true } },
        _count: { select: { branches: true } },
      },
    });
    return rows.map((c) => ({
      id: c.id,
      tenantId: c.tenantId,
      tenantName: c.tenant.name,
      parentClinicId: c.parentClinicId,
      parentNameEn: c.parent?.nameEn ?? null,
      nameEn: c.nameEn,
      nameAr: c.nameAr,
      city: c.city,
      country: c.country,
      kind: resolveClinicKind(c.parentClinicId, c._count.branches),
      phone: c.phone,
      email: c.email,
    }));
  }

  async listClinics(user: JwtUser, tenantId: string) {
    this.assertPlatform(user);
    await this.assertTenant(tenantId);
    const rows = await this.prisma.clinic.findMany({
      where: { tenantId },
      orderBy: [{ parentClinicId: "asc" }, { nameEn: "asc" }],
      include: { parent: { select: { nameEn: true } }, _count: { select: { branches: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      parentClinicId: c.parentClinicId,
      parentNameEn: c.parent?.nameEn ?? null,
      nameEn: c.nameEn,
      nameAr: c.nameAr,
      city: c.city,
      country: c.country,
      kind: resolveClinicKind(c.parentClinicId, c._count.branches),
    }));
  }

  async createClinic(user: JwtUser, tenantId: string, dto: CreateClinicDto) {
    this.assertPlatform(user);
    await this.assertTenant(tenantId);
    return this.clinics.create(tenantId, dto);
  }

  async getClinic(user: JwtUser, tenantId: string, clinicId: string) {
    this.assertPlatform(user);
    await this.assertTenant(tenantId);
    const row = await this.prisma.clinic.findFirst({
      where: { id: clinicId, tenantId },
      include: {
        tenant: { select: { name: true } },
        parent: { select: { nameEn: true, nameAr: true } },
        _count: { select: { branches: true } },
      },
    });
    if (!row) throw new NotFoundException("Clinic not found");
    return {
      id: row.id,
      tenantId: row.tenantId,
      tenantName: row.tenant.name,
      parentClinicId: row.parentClinicId,
      parentNameEn: row.parent?.nameEn ?? null,
      parentNameAr: row.parent?.nameAr ?? null,
      nameEn: row.nameEn,
      nameAr: row.nameAr,
      city: row.city,
      country: row.country,
      kind: resolveClinicKind(row.parentClinicId, row._count.branches),
      logoUrl: row.logoUrl ?? null,
      addressEn: row.addressEn,
      addressAr: row.addressAr,
      locationUrl: row.locationUrl,
      phone: row.phone,
      email: row.email,
      licenseNumber: row.licenseNumber,
      defaultLanguage: row.defaultLanguage,
    };
  }

  async patchClinic(user: JwtUser, tenantId: string, clinicId: string, dto: PatchClinicDto) {
    this.assertPlatform(user);
    await this.assertTenant(tenantId);
    return this.clinics.update(tenantId, clinicId, dto);
  }

  async createUser(user: JwtUser, tenantId: string, dto: CreateTenantUserDto) {
    this.assertPlatform(user);
    await this.assertTenant(tenantId);
    if (hasRole(dto, UserRole.PLATFORM_SUPER_ADMIN)) {
      throw new BadRequestException("Cannot assign PLATFORM_SUPER_ADMIN through organization user creation");
    }
    return this.admin.createTenantUser(tenantId, dto, user);
  }

  listFeatureFlags(user: JwtUser) {
    this.assertPlatform(user);
    return this.admin.listFeatureFlags();
  }

  setFeatureFlag(user: JwtUser, key: string, enabled: boolean) {
    this.assertPlatform(user);
    return this.admin.setFeatureFlag(key, enabled);
  }

  getHierarchy(user: JwtUser, tenantId?: string) {
    this.assertPlatform(user);
    return this.admin.getPlatformHierarchy(tenantId);
  }
}
