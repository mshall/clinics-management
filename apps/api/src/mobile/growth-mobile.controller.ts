import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { FeatureGuard, RequiresFeature } from "../feature-flags/feature-flags-public";
import type { CreateLinkBody, UpdateLinkBody } from "../growth/provider-links/provider-links.service";
import { GrowthMobileService } from "./growth-mobile.service";

/**
 * GRW-P1-L Kiorly staff app Growth tab. `/mobile/*` is plan-gated by MobilePlanGuard/MobileInterceptor (`mobile_staff_app`, 403 FEATURE_DISABLED) before
 * this runs; the module key `clinic.growth` and the Growth role matrix are enforced in the service. Creating a link also needs `growth.provider_links`.
 */
@ApiTags("mobile")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, FeatureGuard)
@Controller("mobile/growth")
export class GrowthMobileController {
  constructor(private readonly svc: GrowthMobileService) {}

  @Get() @ApiOperation({ summary: "Growth tab payload: profile link, links with 30-day counts, performance, recommendations, commission summary" })
  overview(@CurrentUser() u: JwtUser, @Query("clinicId") clinicId?: string) { return this.svc.overview(u, { clinicId }); }

  @Get("links") @ApiOperation({ summary: "My provider links with last-30-day counts" })
  async links(@CurrentUser() u: JwtUser, @Query("clinicId") clinicId?: string) { const o = await this.svc.overview(u, { clinicId }); return { items: o.links, can: o.can, plan: o.plan }; }

  @Get("qr") @ApiOperation({ summary: "QR (SVG) for a link, or for the public Kiorex profile when linkId is omitted" })
  qr(@CurrentUser() u: JwtUser, @Query("linkId") linkId?: string, @Query("clinicId") clinicId?: string) { return this.svc.qr(u, { linkId, clinicId }); }

  @RequiresFeature("growth.provider_links")
  @Post("links") @HttpCode(201) @ApiOperation({ summary: "Create a link (plan link limits apply)" })
  create(@CurrentUser() u: JwtUser, @Body() b: CreateLinkBody) { return this.svc.create(u, b ?? {}); }

  @Patch("links/:id") @ApiOperation({ summary: "Pause or resume a link" })
  update(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: UpdateLinkBody) { return this.svc.update(u, id, b ?? {}); }
}
