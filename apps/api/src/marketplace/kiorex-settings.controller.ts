import { Body, Controller, Get, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { KiorexSettingsService, type PutKiorexSettingsBody } from "./kiorex-settings.service";

@ApiTags("kiorex")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("kiorex")
export class KiorexSettingsController {
  constructor(private readonly settings: KiorexSettingsService) {}

  @Get("settings")
  @ApiOperation({ summary: "Kiorex tab settings for a clinic (KX-06 / KX-10)" })
  get(@CurrentUser() user: JwtUser, @Query("clinicId") clinicId: string) {
    return this.settings.get(user, clinicId);
  }

  @Put("settings")
  @ApiOperation({ summary: "Update Kiorex tab settings for a clinic (KX-06 / KX-10)" })
  put(@CurrentUser() user: JwtUser, @Body() body: PutKiorexSettingsBody) {
    return this.settings.put(user, body);
  }
}
