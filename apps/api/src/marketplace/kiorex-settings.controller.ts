import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { KiorexReviewsService } from "./kiorex-reviews.service";
import { KiorexSettingsService, type PutKiorexSettingsBody } from "./kiorex-settings.service";

@ApiTags("kiorex")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("kiorex")
export class KiorexSettingsController {
  constructor(
    private readonly settings: KiorexSettingsService,
    private readonly reviews: KiorexReviewsService,
  ) {}

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

  @Get("ratings")
  @ApiOperation({ summary: "Kiorex ratings per doctor and recent verified reviews (KX-08)" })
  ratings(@CurrentUser() user: JwtUser, @Query("clinicId") clinicId: string) {
    return this.reviews.listForClinic(user, clinicId);
  }

  @Post("reviews/:id/reply")
  @ApiOperation({ summary: "Reply to a Kiorex review; Kiorex publishes and moderates it (KX-08)" })
  reply(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: { text: string }) {
    return this.reviews.reply(user, id, body?.text);
  }
}
