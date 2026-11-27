import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { MarketplaceAuthGuard } from "./marketplace-auth.guard";
import { MarketplaceClient } from "./marketplace-client.decorator";
import type { PlatformIntegrationPrincipal } from "./platform-integration-client.service";
import { MarketsService } from "../markets/markets.service";
import { LegalConfigService } from "../markets/legal-config.service";
import { CommercialConfigService } from "../markets/commercial-config.service";
import { actorFromSignedBody } from "../markets/market-actor";
import { MARKET_COUNTRY_DEFAULTS } from "../markets/market-country-defaults";

export const MARKET_ADMIN_SCOPE = "MARKET_ADMIN";

function assertMarketAdmin(client: PlatformIntegrationPrincipal) {
  if (!client.scopes.includes(MARKET_ADMIN_SCOPE)) {
    throw new ForbiddenException({ code: "MARKET_ADMIN_SCOPE_REQUIRED", message: "This client may not manage markets" });
  }
}

/** Fields of the signed body that are not part of the decision itself. */
function withoutActor(body: unknown): Record<string, unknown> {
  const { actor: _actor, ...rest } = (body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  return rest;
}

/**
 * Kiorly admin edition of the Ops console -> Clinic, over the SIGNED marketplace API (ADR-060). The Market table stays owned by the Clinic: this is
 * the only way the Kiorex platform reads or changes it. The Kiorex platform authenticates the Ops console user, enforces the role (super admin changes,
 * ops reads) and sends the actor; the Clinic records that actor in the append-only market audit trail. Needs the MARKET_ADMIN scope, which only the
 * configured Kiorex platform client receives (MarketplaceClientBootstrapService). No PHI.
 */
@ApiTags("marketplace")
@Controller("marketplace/v1/markets")
@UseGuards(MarketplaceAuthGuard)
export class KiorlyAdminMarketsController {
  constructor(
    private readonly markets: MarketsService,
    private readonly legal: LegalConfigService,
    private readonly commercial: CommercialConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Kiorly markets with state, operability and launch readiness" })
  list(@MarketplaceClient() c: PlatformIntegrationPrincipal) {
    assertMarketAdmin(c);
    return this.markets.listAll();
  }

  @Get("country-defaults")
  @ApiOperation({ summary: "Per-country starting values for the initiate-country-launch form" })
  defaults(@MarketplaceClient() c: PlatformIntegrationPrincipal) {
    assertMarketAdmin(c);
    return MARKET_COUNTRY_DEFAULTS;
  }

  @Get(":id")
  @ApiOperation({ summary: "One market with readiness, legal and commercial summaries" })
  async one(@MarketplaceClient() c: PlatformIntegrationPrincipal, @Param("id") id: string) {
    assertMarketAdmin(c);
    const [market, legal, commercial] = await Promise.all([this.markets.getOne(id), this.legal.read(id), this.commercial.read(id)]);
    return { market, legal, commercial: { source: commercial.source, config: commercial.config } };
  }

  @Get(":id/audit")
  audit(@MarketplaceClient() c: PlatformIntegrationPrincipal, @Param("id") id: string, @Query("limit") limit?: string, @Query("before") before?: string) {
    assertMarketAdmin(c);
    return this.markets.auditTrail(id, { limit: limit ? Number(limit) : undefined, before });
  }

  @Get(":id/change-requests")
  requests(@MarketplaceClient() c: PlatformIntegrationPrincipal, @Param("id") id: string, @Query("status") status?: string) {
    assertMarketAdmin(c);
    return this.markets.listChangeRequests(id, status);
  }

  @Post()
  @HttpCode(201)
  create(@MarketplaceClient() c: PlatformIntegrationPrincipal, @Body() body: unknown) {
    assertMarketAdmin(c);
    const actor = actorFromSignedBody((body as { actor?: unknown })?.actor);
    return this.markets.createAs(actor, withoutActor(body) as never);
  }

  @Post(":id/launch")
  @HttpCode(200)
  launch(@MarketplaceClient() c: PlatformIntegrationPrincipal, @Param("id") id: string, @Body() body: unknown) {
    assertMarketAdmin(c);
    return this.markets.transition(actorFromSignedBody((body as { actor?: unknown })?.actor), id, "LAUNCH", withoutActor(body));
  }

  @Post(":id/pause")
  @HttpCode(200)
  pause(@MarketplaceClient() c: PlatformIntegrationPrincipal, @Param("id") id: string, @Body() body: unknown) {
    assertMarketAdmin(c);
    return this.markets.transition(actorFromSignedBody((body as { actor?: unknown })?.actor), id, "PAUSE", withoutActor(body));
  }

  @Post(":id/disable")
  @HttpCode(200)
  disable(@MarketplaceClient() c: PlatformIntegrationPrincipal, @Param("id") id: string, @Body() body: unknown) {
    assertMarketAdmin(c);
    return this.markets.transition(actorFromSignedBody((body as { actor?: unknown })?.actor), id, "DISABLE", withoutActor(body));
  }

  @Post(":id/enable")
  @HttpCode(200)
  enable(@MarketplaceClient() c: PlatformIntegrationPrincipal, @Param("id") id: string, @Body() body: unknown) {
    assertMarketAdmin(c);
    return this.markets.transition(actorFromSignedBody((body as { actor?: unknown })?.actor), id, "ENABLE", withoutActor(body));
  }

  @Put(":id/legal-config")
  putLegal(@MarketplaceClient() c: PlatformIntegrationPrincipal, @Param("id") id: string, @Body() body: unknown) {
    assertMarketAdmin(c);
    return this.legal.updateAs(actorFromSignedBody((body as { actor?: unknown })?.actor), id, withoutActor(body));
  }

  @Put(":id/tax-pack")
  putTax(@MarketplaceClient() c: PlatformIntegrationPrincipal, @Param("id") id: string, @Body() body: unknown) {
    assertMarketAdmin(c);
    return this.markets.updateTaxPack(actorFromSignedBody((body as { actor?: unknown })?.actor), id, withoutActor(body));
  }

  @Patch(":id/second-approver")
  second(@MarketplaceClient() c: PlatformIntegrationPrincipal, @Param("id") id: string, @Body() body: unknown) {
    assertMarketAdmin(c);
    const rest = withoutActor(body);
    return this.markets.setSecondApprover(actorFromSignedBody((body as { actor?: unknown })?.actor), id, rest.requireSecondApprover, rest);
  }

  @Post(":id/change-requests/:requestId/approve")
  @HttpCode(200)
  approve(@MarketplaceClient() c: PlatformIntegrationPrincipal, @Param("id") id: string, @Param("requestId") rid: string, @Body() body: unknown) {
    assertMarketAdmin(c);
    return this.markets.approveRequest(actorFromSignedBody((body as { actor?: unknown })?.actor), id, rid, (withoutActor(body).note as string | undefined) ?? undefined);
  }

  @Post(":id/change-requests/:requestId/reject")
  @HttpCode(200)
  reject(@MarketplaceClient() c: PlatformIntegrationPrincipal, @Param("id") id: string, @Param("requestId") rid: string, @Body() body: unknown) {
    assertMarketAdmin(c);
    return this.markets.rejectRequest(actorFromSignedBody((body as { actor?: unknown })?.actor), id, rid, (withoutActor(body).note as string | undefined) ?? undefined);
  }
}
