import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { PatchFeatureFlagDto } from "../admin/dto/patch-feature-flag.dto";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { MarketsService, type CreateMarketDto } from "./markets.service";

@ApiTags("admin-platform-markets")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("admin/platform/markets")
export class MarketsController {
  constructor(private readonly markets: MarketsService) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.markets.list(user);
  }

  @Get(":id")
  get(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.markets.get(user, id);
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() body: CreateMarketDto) {
    return this.markets.create(user, body);
  }

  @Post(":id/launch")
  launch(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.markets.launch(user, id);
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