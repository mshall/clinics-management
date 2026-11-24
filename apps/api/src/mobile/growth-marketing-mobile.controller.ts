import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { FeatureGuard, RequiresFeature } from "../feature-flags/feature-flags-public";
import { SlotCardBodyDto, SocialRenderBodyDto, SocialShareBodyDto, VerificationCreateBodyDto } from "../growth/provider-marketing/provider-marketing.dto";
import { GrowthMarketingMobileService } from "./growth-marketing-mobile.service";

/**
 * GRW-P2-C staff app: share templates, slot cards, statements, verification requests. `/mobile/*` is plan-gated by MobilePlanGuard (`mobile_staff_app`); the
 * Growth module scoping and the doctor-only-own-profile rule are enforced in the service. New actions need `growth.provider_marketing_v2`.
 */
@ApiTags("mobile")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, FeatureGuard)
@Controller("mobile/growth")
export class GrowthMarketingMobileController {
  constructor(private readonly svc: GrowthMarketingMobileService) {}

  @Get("templates") @ApiOperation({ summary: "Approved share templates (AR and EN)" })
  templates(@CurrentUser() u: JwtUser, @Query("locale") locale?: string, @Query("clinicId") clinicId?: string) { return this.svc.templates(u, { locale, clinicId }); }

  @RequiresFeature("growth.provider_marketing_v2")
  @Post("share/render") @HttpCode(200) @ApiOperation({ summary: "Render a share card and caption from an approved template" })
  render(@CurrentUser() u: JwtUser, @Body() b: SocialRenderBodyDto) { return this.svc.render(u, b ?? {}); }

  @RequiresFeature("growth.provider_marketing_v2")
  @Post("share/count") @HttpCode(200) @ApiOperation({ summary: "Count one share (template and channel only)" })
  count(@CurrentUser() u: JwtUser, @Body() b: SocialShareBodyDto) { return this.svc.count(u, b ?? {}); }

  @Get("slots") @ApiOperation({ summary: "Next free slots to share (a doctor sees only their own)" })
  slots(@CurrentUser() u: JwtUser, @Query("clinicId") clinicId?: string, @Query("clinicianId") clinicianId?: string, @Query("days") days?: string) { return this.svc.slots(u, { clinicId, clinicianId, days: days ? Number(days) : undefined }); }

  @RequiresFeature("growth.provider_marketing_v2")
  @Post("slots/card") @HttpCode(200) @ApiOperation({ summary: "Render a slot card (409 SLOT_NO_LONGER_AVAILABLE when a chosen time is gone)" })
  slotCard(@CurrentUser() u: JwtUser, @Body() b: SlotCardBodyDto) { return this.svc.slotCard(u, b ?? {}); }

  @Get("statements") @ApiOperation({ summary: "Months with Kiorex charges (admin only)" })
  months(@CurrentUser() u: JwtUser) { return this.svc.months(u); }

  @Get("statements/:month") @ApiOperation({ summary: "One month statement (admin only; never for a doctor)" })
  statement(@CurrentUser() u: JwtUser, @Param("month") month: string, @Query("clinicId") clinicId?: string) { return this.svc.statement(u, month, clinicId); }

  @Get("verification") @ApiOperation({ summary: "Verification update requests (admin)" })
  verification(@CurrentUser() u: JwtUser, @Query("clinicId") clinicId?: string) { return this.svc.verificationList(u, clinicId); }

  @RequiresFeature("growth.provider_marketing_v2")
  @Post("verification") @HttpCode(201) @ApiOperation({ summary: "Ask Kiorex to update a verified profile field (admin)" })
  verificationCreate(@CurrentUser() u: JwtUser, @Body() b: VerificationCreateBodyDto) { return this.svc.verificationCreate(u, b ?? {}); }
}
