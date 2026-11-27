import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { MarketplaceAuthGuard } from "./marketplace-auth.guard";
import { MarketplaceClient } from "./marketplace-client.decorator";
import type { PlatformIntegrationPrincipal } from "./platform-integration-client.service";
import { MARKET_ADMIN_SCOPE } from "./kiorly-admin-markets.controller";
import { actorFromSignedBody } from "../markets/market-actor";
import { PlansService } from "../plans/plans.service";
import { PrismaService } from "../prisma/prisma.service";
import { KiorlyAdminCreatePriceBodyDto, KiorlyAdminPatchPlanBodyDto } from "../plans/platform-plans.controller.dto";

function assertAdmin(client: PlatformIntegrationPrincipal) {
  if (!client.scopes.includes(MARKET_ADMIN_SCOPE)) {
    throw new ForbiddenException({ code: "MARKET_ADMIN_SCOPE_REQUIRED", message: "This client may not manage plans" });
  }
}

/**
 * Kiorly admin edition of the Ops console -> Clinic plan catalogue, over the SIGNED marketplace API (same pattern and scope as Market launch, ADR-060). The Clinic stays the
 * only owner of Plan, PlanEntitlement and the effective-dated PlanPrice rows; the Kiorex platform authenticates the console user, enforces the role (super admin changes,
 * ops reads) and sends the actor, which lands on the existing `plan.price.published` audit row. Only the metadata and price routes of the Clinic web are exposed:
 * entitlements, plan creation and the SB-06 migrations stay in the Clinic's own platform console. No PHI.
 */
@ApiTags("marketplace")
@Controller("marketplace/v1/plans")
@UseGuards(MarketplaceAuthGuard)
export class KiorlyAdminPlansController {
  constructor(
    private readonly plans: PlansService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Every plan with its entitlements and every price version, plus the Kiorly markets (id, code, currency)" })
  async list(@MarketplaceClient() c: PlatformIntegrationPrincipal) {
    assertAdmin(c);
    const [plans, markets] = await Promise.all([
      this.plans.listAllPlansUnchecked(),
      this.prisma.market.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, nameEn: true, defaultCurrency: true } }),
    ]);
    return { markets, plans };
  }

  @Patch(":planId")
  @ApiOperation({ summary: "Change a plan's names, public flag or order" })
  patch(@MarketplaceClient() c: PlatformIntegrationPrincipal, @Param("planId") planId: string, @Body() body: KiorlyAdminPatchPlanBodyDto) {
    assertAdmin(c);
    actorFromSignedBody(body.actor);
    const { actor: _actor, ...rest } = body;
    return this.plans.patchPlanUnchecked(planId, rest);
  }

  @Post(":planId/prices")
  @HttpCode(200)
  @ApiOperation({ summary: "Publish an effective-dated price version, or `preview: true` for the impact on subscribers without publishing" })
  price(@MarketplaceClient() c: PlatformIntegrationPrincipal, @Param("planId") planId: string, @Body() body: KiorlyAdminCreatePriceBodyDto) {
    assertAdmin(c);
    const actor = actorFromSignedBody(body.actor);
    const { actor: _actor, ...rest } = body;
    return this.plans.createPlanPriceAs({ userId: null, source: "KIORLY_ADMIN", ref: actor.id }, planId, rest);
  }
}
