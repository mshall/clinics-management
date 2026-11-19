import { FeatureFlagsService, requireFeature } from "../feature-flags/feature-flags-public";
import { Body, Controller, Get, Optional, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PaymentMethod } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { BillingInterval, PlanKey } from "@prisma/client";
import { DunningService } from "../subscriptions/dunning.service";
import { SubscriptionService } from "../subscriptions/subscription.service";
import { TrialEngineService } from "../subscriptions/trial-engine.service";
import { CreditWalletService } from "../credits/credit-wallet.service";
import { PrismaService } from "../prisma/prisma.service";
import { BillingService } from "./billing.service";
import { NoShowGuaranteeService } from "./no-show-guarantee.service";
import { SpecialtyPacksService } from "../clinical/specialty-packs.service";

@ApiTags("billing")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("billing")
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly subscriptions: SubscriptionService,
    private readonly dunning: DunningService,
    private readonly trialEngine: TrialEngineService,
    private readonly creditWallet: CreditWalletService,
    private readonly noShowGuarantee: NoShowGuaranteeService,
    private readonly specialtyPacks: SpecialtyPacksService,
    private readonly prisma: PrismaService,
    @Optional() private readonly featureFlags?: FeatureFlagsService,
  ) {}

  /** PL-08 — paywall view/conversion telemetry (feeds PA-05 later). */
  @Post("paywall-events")
  async recordPaywallEvent(
    @CurrentUser() user: JwtUser,
    @Body() body: { type: string; entitlement: string; requiredPlan: string; source?: string | null },
  ) {
    const tenantId = requireTenantId(user);
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: user.userId,
        action: body.type === "conversion_intent" ? "paywall.conversion_intent" : "paywall.view",
        resource: "Paywall",
        resourceId: body.entitlement,
        metadata: {
          entitlement: body.entitlement,
          requiredPlan: body.requiredPlan,
          source: body.source ?? null,
        },
      },
    });
    return { ok: true };
  }

  @Get("subscription")
  getSubscription(@CurrentUser() user: JwtUser) {
    return this.subscriptions.getForTenant(user, requireTenantId(user));
  }

  @Get("access-state")
  getAccessState(@CurrentUser() user: JwtUser) {
    return this.dunning.getAccessState(requireTenantId(user), user);
  }

  @Get("trial")
  getTrial(@CurrentUser() user: JwtUser) {
    return this.trialEngine.getTrialStatus(user, requireTenantId(user));
  }

  @Get("wallet")
  getCreditWallet(
    @CurrentUser() user: JwtUser,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.creditWallet.getWalletForTenant(
      user,
      requireTenantId(user),
      page ? Number(page) : undefined,
      pageSize ? Number(pageSize) : undefined,
    );
  }

  /** CR-10 — no-show guarantee tracker (off by default via market commercialConfig). */
  @Get("guarantee")
  getNoShowGuarantee(@CurrentUser() user: JwtUser) {
    return this.noShowGuarantee.getForTenant(user, requireTenantId(user));
  }

  /** CL-07 — specialty pack add-ons (dental / aesthetics / physio). */
  @Get("addons")
  listSpecialtyAddons() {
    return this.specialtyPacks.listAddons();
  }

  @Post("addons/purchase")
  purchaseSpecialtyAddon(
    @CurrentUser() user: JwtUser,
    @Body() body: { entitlementKey: string },
  ) {
    return this.specialtyPacks.purchaseAddon(requireTenantId(user), user.userId, body.entitlementKey);
  }

  @Post("subscription/preview-change")
  previewChange(
    @CurrentUser() user: JwtUser,
    @Body()
    body: {
      planKey: PlanKey;
      interval: BillingInterval;
      seats: number;
      timing?: "IMMEDIATE" | "PERIOD_END";
    },
  ) {
    return this.subscriptions.previewPlanChange(user, requireTenantId(user), body);
  }

  @Post("subscription/change-plan")
  changePlan(
    @CurrentUser() user: JwtUser,
    @Body()
    body: {
      planKey: PlanKey;
      interval: BillingInterval;
      seats: number;
      confirm?: boolean;
      timing?: "IMMEDIATE" | "PERIOD_END";
      activeClinicianUserIds?: string[];
    },
  ) {
    return this.subscriptions.changePlan(user, requireTenantId(user), body);
  }

  @Post("subscription/seats")
  changeSeats(
    @CurrentUser() user: JwtUser,
    @Body()
    body: { seats: number; confirm?: boolean; activeClinicianUserIds?: string[] },
  ) {
    return this.subscriptions.changeSeats(user, requireTenantId(user), body);
  }

  @Post("subscription/preview-seats")
  previewSeats(@CurrentUser() user: JwtUser, @Body() body: { seats: number }) {
    return this.subscriptions.previewSeatsChange(user, requireTenantId(user), body.seats);
  }

  @Post("subscription/cancel")
  cancelSubscription(
    @CurrentUser() user: JwtUser,
    @Body() body: { atPeriodEnd?: boolean },
  ) {
    return this.subscriptions.requestCancelAtPeriodEnd(user, requireTenantId(user), body.atPeriodEnd !== false);
  }

  @Get("catalog")
  listCatalog(@CurrentUser() user: JwtUser, @Query("q") q?: string) {
    return this.billing.listCatalog(requireTenantId(user), q);
  }

  @Post("catalog")
  createCatalog(
    @CurrentUser() user: JwtUser,
    @Body() body: { code: string; nameEn: string; nameAr?: string; category?: string; amount: number; currency?: string },
  ) {
    return this.billing.createCatalogItem(requireTenantId(user), user, body);
  }

  @Post("payments")
  async recordPayment(
    @CurrentUser() user: JwtUser,
    @Body()
    body: {
      clinicId: string;
      patientId: string;
      invoiceId?: string;
      currency?: string;
      allocations: { method: PaymentMethod; amount: number }[];
      submitEta?: boolean;
    },
  ) {
    const tenantId = requireTenantId(user);
    // card_payments OFF: card allocation hidden/blocked at cashier; cash and other methods remain.
    if (this.featureFlags && body.allocations?.some((a) => a.method === "CARD")) {
      await requireFeature(this.featureFlags, tenantId, "card_payments");
    }
    return this.billing.recordPayment(tenantId, user, body);
  }

  @Post("cash-close")
  cashClose(
    @CurrentUser() user: JwtUser,
    @Body()
    body: { clinicId: string; shiftDate: string; countedCash: number; countedCard: number; notes?: string },
  ) {
    return this.billing.closeCashierShift(requireTenantId(user), user, body);
  }
}
