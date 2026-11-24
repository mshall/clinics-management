import { Body, Controller, Get, Header, Param, Patch, Post, Put, Query, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../auth/current-user.decorator";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import type { JwtUser } from "../../auth/jwt-user";
import { FeatureGuard, RequiresFeature } from "../../feature-flags/feature-flags-public";
import { GrowthInsightsService } from "./growth-insights.service";
import { ProviderLinksService, type CreateLinkBody, type PutWidgetBody, type UpdateLinkBody } from "./provider-links.service";

/** Growth & Marketing workspace API (GRW-P1-D1). Links work standalone: no Kiorex connection or `clinic.kiorex_listing` entitlement is required. */
@ApiTags("growth")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, FeatureGuard)
@Controller("growth")
export class ProviderLinksController {
  constructor(
    private readonly links: ProviderLinksService,
    private readonly insights: GrowthInsightsService,
  ) {}

  @Get("access")
  @ApiOperation({ summary: "What the signed-in user can do in Growth & Marketing, plus plan limits" })
  access(@CurrentUser() user: JwtUser) {
    return this.links.access(user);
  }

  @Get("links")
  @ApiOperation({ summary: "List provider referral links with last-30-day counters (counts only)" })
  list(@CurrentUser() user: JwtUser, @Query("clinicId") clinicId?: string, @Query("status") status?: string) {
    return this.links.list(user, { clinicId, status });
  }

  @RequiresFeature("growth.provider_links")
  @Post("links")
  @ApiOperation({ summary: "Create a referral link (ORG, CLINIC, BRANCH, DOCTOR or DESK scope); 8-character code, audited" })
  create(@CurrentUser() user: JwtUser, @Body() body: CreateLinkBody) {
    return this.links.create(user, body ?? {});
  }

  @Patch("links/:id")
  @ApiOperation({ summary: "Rename, retag, pause, resume or revoke a link (revoke is permanent)" })
  update(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: UpdateLinkBody) {
    return this.links.update(user, id, body ?? {});
  }

  @RequiresFeature("growth.provider_links")
  @Get("links/:id/qr.svg")
  @Header("Content-Type", "image/svg+xml; charset=utf-8")
  @Header("Cache-Control", "private, max-age=300")
  @ApiOperation({ summary: "QR code (SVG, error correction M, 4-module quiet zone) for the short link" })
  qrSvg(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.links.qrSvgFor(user, id);
  }

  @RequiresFeature("growth.provider_links")
  @Get("links/:id/qr.png")
  @Header("Content-Type", "image/png")
  @Header("Cache-Control", "private, max-age=300")
  @ApiOperation({ summary: "QR code (PNG)" })
  async qrPng(@CurrentUser() user: JwtUser, @Param("id") id: string, @Query("width") width?: string) {
    return new StreamableFile(await this.links.qrPngFor(user, id, width ? Number(width) : undefined));
  }

  @RequiresFeature("growth.provider_links")
  @Get("links/:id/poster")
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Printable HTML: poster A4/A5, reception desk card or doctor card sheet, Arabic or English (print or Save as PDF)" })
  poster(@CurrentUser() user: JwtUser, @Param("id") id: string, @Query("lang") lang?: string, @Query("size") size?: string, @Query("kind") kind?: string, @Query("print") print?: string) {
    return this.links.posterHtml(user, id, { lang, size, kind, print: print === "1" });
  }

  @Get("links/:id/vcard")
  @Header("Content-Type", "text/vcard; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="doctor.vcf"')
  @ApiOperation({ summary: "Digital business card (vCard 3.0) for a doctor link" })
  vcard(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.links.vcard(user, id);
  }

  @Get("summary")
  @ApiOperation({ summary: "Visits, bookings and attended through your links (counts only, no patient data)" })
  summary(@CurrentUser() user: JwtUser, @Query("clinicId") clinicId?: string, @Query("days") days?: string) {
    return this.links.summary(user, { clinicId, days: days ? Number(days) : undefined });
  }

  @Get("performance")
  @ApiOperation({ summary: "Acquisition performance: provider-originated vs marketplace-originated bookings, conversion, commission and incremental revenue, weekly trend" })
  performance(@CurrentUser() user: JwtUser, @Query("clinicId") clinicId?: string, @Query("days") days?: string) {
    return this.insights.performance(user, { clinicId, days: days ? Number(days) : undefined });
  }

  @Get("recommendations")
  @ApiOperation({ summary: "Actionable recommendations from a closed catalogue (availability, profile, response time, cancellations)" })
  recommendations(@CurrentUser() user: JwtUser, @Query("clinicId") clinicId?: string) {
    return this.insights.recommendations(user, { clinicId });
  }

  @Get("profile-preview")
  @ApiOperation({ summary: "Public profile preview: the booking page as patients see it" })
  profilePreview(@CurrentUser() user: JwtUser, @Query("clinicId") clinicId: string) {
    return this.links.profilePreview(user, clinicId);
  }

  @Get("widget")
  @ApiOperation({ summary: "Widget settings, allowed origins and embed snippets for a clinic" })
  getWidget(@CurrentUser() user: JwtUser, @Query("clinicId") clinicId: string) {
    return this.links.getWidget(user, clinicId);
  }

  @Put("widget")
  @ApiOperation({ summary: "Save widget settings: https exact origins only, no wildcard, at most 10; audited as growth.widget.updated and projected to Kiorex as PROVIDER_PROFILE_UPDATED.widgetOrigins" })
  putWidget(@CurrentUser() user: JwtUser, @Body() body: PutWidgetBody) {
    return this.links.putWidget(user, body ?? {});
  }
}
