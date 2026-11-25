import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { DecideSubscriptionPolicyBodyDto, PlatformForceAutoRenewBodyDto, PlatformForceDowngradeBodyDto, ProposeSubscriptionPolicyBodyDto } from "./platform-subscriptions.controller.dto";
import { PlatformSubscriptionsService } from "./platform-subscriptions.service";
import { SubscriptionPolicyService } from "./subscription-policy.service";
import { SubscriptionRenewalService } from "./subscription-renewal.service";

@ApiTags("admin-platform")
@ApiBearerAuth("bearer")
@Controller("admin/platform/subscriptions")
@UseGuards(JwtAuthGuard)
export class PlatformSubscriptionsController {
  constructor(
    private readonly ops: PlatformSubscriptionsService,
    private readonly renewal: SubscriptionRenewalService,
    private readonly policy: SubscriptionPolicyService,
  ) {}

  @Get()
  @ApiOperation({ summary: "SUB-01 subscriptions list (platform super admin)" })
  list(
    @CurrentUser() user: JwtUser,
    @Query("status") status?: string,
    @Query("planKey") planKey?: string,
    @Query("autoRenew") autoRenew?: string,
    @Query("q") q?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.ops.list(user, { status, planKey, autoRenew, q, page: page ? Number(page) : undefined, pageSize: pageSize ? Number(pageSize) : undefined });
  }

  @Get("metrics")
  @ApiOperation({ summary: "MRR, churn-lite, downgrade counts" })
  metrics(@CurrentUser() user: JwtUser, @Query("windowDays") windowDays?: string) {
    return this.ops.metrics(user, windowDays ? Number(windowDays) : 30);
  }

  @Post(":tenantId/force-auto-renew")
  @ApiOperation({ summary: "Force auto-renew ON/OFF (or null to release); reason mandatory, audited" })
  forceAutoRenew(@CurrentUser() user: JwtUser, @Param("tenantId") tenantId: string, @Body() body: PlatformForceAutoRenewBodyDto) {
    return this.renewal.platformForceAutoRenew(user, tenantId, body.force ?? null, body.reason);
  }

  @Post(":tenantId/force-downgrade")
  @ApiOperation({ summary: "Move a tenant to Lite; reason mandatory, audited" })
  forceDowngrade(@CurrentUser() user: JwtUser, @Param("tenantId") tenantId: string, @Body() body: PlatformForceDowngradeBodyDto) {
    return this.renewal.platformForceDowngrade(user, tenantId, body.reason);
  }

  @Get("policy/:marketId")
  @ApiOperation({ summary: "Market subscription policy + pending maker-checker proposals" })
  getPolicy(@CurrentUser() user: JwtUser, @Param("marketId") marketId: string) {
    return this.policy.get(user, marketId);
  }

  @Get("policy/:marketId/history")
  policyHistory(@CurrentUser() user: JwtUser, @Param("marketId") marketId: string) {
    return this.policy.history(user, marketId);
  }

  @Put("policy/:marketId/proposals")
  @ApiOperation({ summary: "Maker: propose a subscription policy change (needs a second admin to approve)" })
  propose(@CurrentUser() user: JwtUser, @Param("marketId") marketId: string, @Body() body: ProposeSubscriptionPolicyBodyDto) {
    return this.policy.propose(user, marketId, body);
  }

  @Post("policy/proposals/:changeId/decision")
  @ApiOperation({ summary: "Checker: approve or reject (must not be the maker)" })
  decide(@CurrentUser() user: JwtUser, @Param("changeId") changeId: string, @Body() body: DecideSubscriptionPolicyBodyDto) {
    return this.policy.decide(user, changeId, body);
  }
}
