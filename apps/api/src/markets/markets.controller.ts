import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { PatchFeatureFlagDto } from "../admin/dto/patch-feature-flag.dto";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { CommercialConfigService } from "./commercial-config.service";
import { MarketsService, type CreateMarketDto } from "./markets.service";
import { PatchMarketDto, PauseMarketDto } from "./dto/patch-market.dto";

@ApiTags("admin-platform-markets")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("admin/platform/markets")
export class MarketsController {
  constructor(
    private readonly markets: MarketsService,
    private readonly commercialConfig: CommercialConfigService,
  ) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.markets.list(user);
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
  launch(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.markets.launch(user, id);
  }

  @Post(":id/pause")
  pause(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: PauseMarketDto) {
    return this.markets.pause(user, id, body.days ?? 7);
  }

  @Post(":id/disable")
  disable(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.markets.disable(user, id);
  }

  @Post(":id/enable")
  enable(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.markets.enable(user, id);
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