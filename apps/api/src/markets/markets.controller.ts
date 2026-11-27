import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { PatchFeatureFlagDto } from "../admin/dto/patch-feature-flag.dto";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { CommercialConfigService } from "./commercial-config.service";
import { LegalConfigService } from "./legal-config.service";
import { MarketsService, type CreateMarketDto } from "./markets.service";
import { PatchMarketDto } from "./dto/patch-market.dto";
import { DecideChangeRequestDto, SecondApproverDto } from "./dto/market-decision.dto";
import { MARKET_COUNTRY_DEFAULTS } from "./market-country-defaults";
import { actorFromJwt } from "./market-actor";

@ApiTags("admin-platform-markets")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("admin/platform/markets")
export class MarketsController {
  constructor(
    private readonly markets: MarketsService,
    private readonly commercialConfig: CommercialConfigService,
    private readonly legalConfig: LegalConfigService,
  ) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.markets.list(user);
  }

  @Get("country-defaults")
  countryDefaults(@CurrentUser() user: JwtUser) {
    actorFromJwt(user);
    return MARKET_COUNTRY_DEFAULTS;
  }

  @Get("operable")
  listOperable(@CurrentUser() user: JwtUser) {
    return this.markets.listOperable(user);
  }

  @Get(":id/commercial-config")
  getCommercialConfig(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.commercialConfig.get(user, id);
  }

  @Put(":id/commercial-config")
  putCommercialConfig(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: unknown) {
    return this.commercialConfig.update(user, id, body);
  }

  @Post(":id/commercial-config/preview")
  previewCommercialConfig(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: unknown) {
    return this.commercialConfig.preview(user, id, body);
  }

  @Get(":id/legal-config")
  getLegalConfig(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.legalConfig.get(user, id);
  }

  @Put(":id/legal-config")
  putLegalConfig(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: unknown) {
    return this.legalConfig.update(user, id, body);
  }

  @Get(":id/audit")
  audit(@CurrentUser() user: JwtUser, @Param("id") id: string, @Query("limit") limit?: string, @Query("before") before?: string) {
    actorFromJwt(user);
    return this.markets.auditTrail(id, { limit: limit ? Number(limit) : undefined, before });
  }

  @Get(":id/change-requests")
  changeRequests(@CurrentUser() user: JwtUser, @Param("id") id: string, @Query("status") status?: string) {
    actorFromJwt(user);
    return this.markets.listChangeRequests(id, status);
  }

  @Post(":id/change-requests/:requestId/approve")
  approveRequest(@CurrentUser() user: JwtUser, @Param("id") id: string, @Param("requestId") requestId: string, @Body() body: DecideChangeRequestDto) {
    return this.markets.approveRequest(actorFromJwt(user), id, requestId, body?.note);
  }

  @Post(":id/change-requests/:requestId/reject")
  rejectRequest(@CurrentUser() user: JwtUser, @Param("id") id: string, @Param("requestId") requestId: string, @Body() body: DecideChangeRequestDto) {
    return this.markets.rejectRequest(actorFromJwt(user), id, requestId, body?.note);
  }

  @Put(":id/tax-pack")
  taxPack(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: unknown) {
    return this.markets.updateTaxPack(actorFromJwt(user), id, body);
  }

  @Patch(":id/second-approver")
  secondApprover(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: SecondApproverDto) {
    return this.markets.setSecondApprover(actorFromJwt(user), id, body?.requireSecondApprover, body);
  }

  @Get(":id")
  get(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.markets.get(user, id);
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() body: CreateMarketDto) {
    return this.markets.create(user, body);
  }

  @Patch(":id")
  patch(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: PatchMarketDto) {
    return this.markets.patch(user, id, body);
  }

  @Delete(":id")
  remove(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.markets.remove(user, id);
  }

  @Post(":id/launch")
  launch(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: unknown) {
    return this.markets.launch(user, id, body);
  }

  @Post(":id/pause")
  pause(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: unknown) {
    return this.markets.pause(user, id, body);
  }

  @Post(":id/disable")
  disable(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: unknown) {
    return this.markets.disable(user, id, body);
  }

  @Post(":id/enable")
  enable(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: unknown) {
    return this.markets.enable(user, id, body);
  }

  @Get(":id/feature-flags")
  featureFlags(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.markets.listFeatureFlags(user, id);
  }

  @Patch(":id/feature-flags/:key")
  patchFeatureFlag(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Param("key") key: string,
    @Body() body: PatchFeatureFlagDto,
  ) {
    return this.markets.patchFeatureFlag(user, id, key, body.enabled);
  }
}