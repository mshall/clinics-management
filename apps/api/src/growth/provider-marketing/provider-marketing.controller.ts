import { Body, Controller, Get, Header, NotFoundException, Param, Post, Query, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../auth/current-user.decorator";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import type { JwtUser } from "../../auth/jwt-user";
import { FeatureGuard, RequiresFeature } from "../../feature-flags/feature-flags-public";
import { GrowthInsightsService } from "../provider-links/growth-insights.service";
import { PosterPdfService } from "./poster-pdf.service";
import { ShareableSlotsService } from "./shareable-slots.service";
import { SocialTemplatesService, type RenderBody } from "./social-templates.service";
import { StatementsService } from "./statements.service";
import { VerificationRequestsService } from "./verification-requests.service";

/**
 * GRW-P2-C provider marketing portal, web API. Reads keep working when `growth.provider_marketing_v2` is OFF; only the new actions (render, share, slot card,
 * verification requests) answer 403 FEATURE_DISABLED. Roles are the Growth matrix (admin and marketing create; reception only reads; doctors use the staff app).
 */
@ApiTags("growth")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, FeatureGuard)
@Controller()
export class ProviderMarketingController {
  constructor(
    private readonly social: SocialTemplatesService,
    private readonly slots: ShareableSlotsService,
    private readonly insights: GrowthInsightsService,
    private readonly verification: VerificationRequestsService,
    private readonly statements: StatementsService,
    private readonly posters: PosterPdfService,
  ) {}

  @Get("growth/social/templates")
  @ApiOperation({ summary: "Approved social content templates (AR and EN), with 30-day share counts" })
  templates(@CurrentUser() u: JwtUser, @Query("locale") locale?: string, @Query("kind") kind?: string, @Query("clinicId") clinicId?: string) {
    return this.social.list(u, { locale, kind, clinicId });
  }

  @RequiresFeature("growth.provider_marketing_v2")
  @Post("growth/social/render")
  @ApiOperation({ summary: "Render a share card (SVG, optional PNG) and caption from an approved template; content guard applies to the optional custom line; the footer is protected" })
  render(@CurrentUser() u: JwtUser, @Body() body: RenderBody) {
    return this.social.render(u, body ?? {});
  }

  @RequiresFeature("growth.provider_marketing_v2")
  @Post("growth/social/share")
  @ApiOperation({ summary: "Count one share (template, channel); no content, recipient or slot time is stored" })
  share(@CurrentUser() u: JwtUser, @Body() body: { templateId?: string; clinicId?: string; channel?: string }) {
    return this.social.recordShare(u, body ?? {});
  }

  @Get("growth/shareable-slots")
  @ApiOperation({ summary: "Up to 5 next free slots of a doctor from the canonical slot engine (no hold is created)" })
  shareableSlots(@CurrentUser() u: JwtUser, @Query("clinicId") clinicId?: string, @Query("clinicianId") clinicianId?: string, @Query("days") days?: string) {
    return this.slots.list(u, { clinicId, clinicianId, days: days ? Number(days) : undefined });
  }

  @RequiresFeature("growth.provider_marketing_v2")
  @Post("growth/shareable-slots/card")
  @ApiOperation({ summary: "Render a card for 1 to 5 chosen slots; each is re-checked at render time (409 SLOT_NO_LONGER_AVAILABLE when one is gone); the link is the provider's own so the booking is provider-led" })
  slotCard(@CurrentUser() u: JwtUser, @Body() body: { clinicId?: string; clinicianId?: string; startsAt?: unknown; linkId?: string; locale?: string; png?: boolean }) {
    return this.slots.card(u, body ?? {});
  }

  @RequiresFeature("growth.provider_marketing_v2")
  @Post("growth/recommendations/:id/state")
  @ApiOperation({ summary: "Dismiss, snooze (1 to 90 days), mark done or reopen one recommendation of a clinic" })
  recommendationState(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() body: { clinicId?: string; status?: string; snoozeDays?: number }) {
    return this.insights.setRecommendationState(u, id, body ?? {});
  }

  @Get("growth/verification-requests")
  @ApiOperation({ summary: "Verification update requests of the organisation, with the badge state (VERIFIED or UPDATE_UNDER_REVIEW)" })
  verificationList(@CurrentUser() u: JwtUser, @Query("clinicId") clinicId?: string) {
    return this.verification.list(u, { clinicId });
  }

  @RequiresFeature("growth.provider_marketing_v2")
  @Post("growth/verification-requests")
  @ApiOperation({ summary: "Ask Kiorex ops to update a verified profile field (licence number, specialty, address, display name, photo, document); the value is encrypted at rest" })
  verificationCreate(@CurrentUser() u: JwtUser, @Body() body: { clinicId?: string; field?: string; newValue?: string; oldRef?: string; evidenceFileRefs?: unknown }) {
    return this.verification.create(u, body ?? {});
  }

  @RequiresFeature("growth.provider_marketing_v2")
  @Post("growth/verification-requests/:id/withdraw")
  @ApiOperation({ summary: "Withdraw an open verification update request" })
  verificationWithdraw(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.verification.withdraw(u, id);
  }

  @RequiresFeature("growth.provider_marketing_v2")
  @Post("growth/verification-requests/:id/evidence")
  @ApiOperation({ summary: "Answer a NEEDS_INFO decision with more evidence files" })
  verificationEvidence(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() body: { evidenceFileRefs?: unknown }) {
    return this.verification.addEvidence(u, id, body ?? {});
  }

  @RequiresFeature("growth.provider_links")
  @Post("growth/links/:id/poster.pdf")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "QR poster as a server PDF (Arabic or English)" })
  async posterPdf(@CurrentUser() u: JwtUser, @Param("id") id: string, @Query("lang") lang?: string) {
    const { pdf, filename } = await this.posters.render(u, id, lang);
    return new StreamableFile(pdf, { type: "application/pdf", disposition: `attachment; filename="${filename}"` });
  }

  @Get("billing/kiorex/statements/exports")
  @ApiOperation({ summary: "History of statement exports (month, kind, checksum)" })
  exports(@CurrentUser() u: JwtUser, @Query("month") month?: string) {
    return this.statements.exports(u, month);
  }

  @Get("billing/kiorex/statements/months")
  @ApiOperation({ summary: "Months that have Kiorex charges" })
  months(@CurrentUser() u: JwtUser) {
    return this.statements.months(u);
  }

  @Get("billing/kiorex/statements")
  @ApiOperation({ summary: "Commission statement of a month (YYYY-MM): one line per appointment, totals equal the decision log and charge ledger" })
  statement(@CurrentUser() u: JwtUser, @Query("month") month?: string, @Query("clinicId") clinicId?: string) {
    return this.statements.statement(u, month, clinicId);
  }

  @Get("billing/kiorex/statements/:file")
  @ApiOperation({ summary: "Statement export: `<YYYY-MM>.csv` or `<YYYY-MM>.pdf` (AR and EN, RTL)" })
  async file(@CurrentUser() u: JwtUser, @Param("file") file: string, @Query("clinicId") clinicId?: string) {
    const m = /^(\d{4}-\d{2})\.(csv|pdf)$/.exec(file);
    if (!m) throw new NotFoundException("Use <YYYY-MM>.csv or <YYYY-MM>.pdf");
    if (m[2] === "csv") {
      const r = await this.statements.csv(u, m[1], clinicId);
      return new StreamableFile(Buffer.from(r.body, "utf8"), { type: "text/csv; charset=utf-8", disposition: `attachment; filename="${r.filename}"` });
    }
    const r = await this.statements.pdf(u, m[1], clinicId);
    return new StreamableFile(r.body, { type: "application/pdf", disposition: `attachment; filename="${r.filename}"` });
  }
}
