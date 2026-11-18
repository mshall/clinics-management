import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { BillingInterval, PlanKey, PriceUnit } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { PlansService } from "./plans.service";
import { PriceIndexationService } from "./price-indexation.service";

@ApiTags("admin-platform")
@ApiBearerAuth("bearer")
@Controller("admin/platform/plans")
@UseGuards(JwtAuthGuard)
export class PlatformPlansController {
  constructor(
    private readonly plans: PlansService,
    private readonly indexation: PriceIndexationService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List all plans, entitlements, and price history (platform super admin)" })
  list(@CurrentUser() user: JwtUser) {
    return this.plans.listAllPlans(user);
  }

  @Get("price-migrations")
  @ApiOperation({ summary: "SB-06 report: which subscriptions move to which price version, and when" })
  priceMigrations(
    @CurrentUser() user: JwtUser,
    @Query("status") status?: string,
    @Query("planId") planId?: string,
  ) {
    return this.indexation.report(user, { status, planId });
  }

  @Post()
  @ApiOperation({ summary: "Create a plan definition (platform super admin)" })
  create(
    @CurrentUser() user: JwtUser,
    @Body()
    body: {
      key: PlanKey;
      nameEn: string;
      nameAr?: string;
      isPublic?: boolean;
      sortOrder?: number;
    },
  ) {
    return this.plans.createPlan(user, body);
  }

  @Patch(":planId")
  @ApiOperation({ summary: "Update plan metadata (platform super admin)" })
  patch(
    @CurrentUser() user: JwtUser,
    @Param("planId") planId: string,
    @Body() body: Partial<{ nameEn: string; nameAr: string; isPublic: boolean; sortOrder: number }>,
  ) {
    return this.plans.patchPlan(user, planId, body);
  }

  @Get(":planId/prices")
  @ApiOperation({ summary: "List prices for a plan (platform super admin)" })
  listPrices(
    @CurrentUser() user: JwtUser,
    @Param("planId") planId: string,
    @Query("marketId") marketId?: string,
  ) {
    return this.plans.listPlanPrices(user, planId, marketId);
  }

  @Post(":planId/prices")
  @ApiOperation({
    summary:
      "Create a price row or new price version (platform super admin). `preview: true` returns impact (tenants affected, MRR delta) without publishing.",
  })
  createPrice(
    @CurrentUser() user: JwtUser,
    @Param("planId") planId: string,
    @Body()
    body: {
      marketId: string;
      currency: string;
      interval: BillingInterval;
      unit: PriceUnit;
      amount: number | string;
      includedClinicians?: number;
      extraClinicianAmount?: number | string | null;
      cohortKey?: string | null;
      validFrom?: string;
      newVersion?: boolean;
      preview?: boolean;
    },
  ) {
    return this.plans.createPlanPrice(user, planId, body);
  }
}