import { Module } from "@nestjs/common";
import { FeatureFlagsModule } from "../../feature-flags/feature-flags.module";
import { SchedulingModule } from "../../scheduling/scheduling.module";
import { ProviderLinksModule } from "../provider-links/provider-links.module";
import { GrowthMarketingMobileController } from "../../mobile/growth-marketing-mobile.controller";
import { GrowthMarketingMobileService } from "../../mobile/growth-marketing-mobile.service";
import { ProviderMarketingController } from "./provider-marketing.controller";
import { PosterPdfService } from "./poster-pdf.service";
import { ShareableSlotsService } from "./shareable-slots.service";
import { SocialTemplatesService } from "./social-templates.service";
import { StatementsService } from "./statements.service";
import { VerificationCoreModule } from "./verification-core.module";

/** GRW-P2-C provider marketing portal completion. Separate from ProviderLinksModule so the links module stays small; reuses its services. */
@Module({
  imports: [FeatureFlagsModule, ProviderLinksModule, SchedulingModule, VerificationCoreModule],
  controllers: [ProviderMarketingController, GrowthMarketingMobileController],
  providers: [SocialTemplatesService, ShareableSlotsService, StatementsService, PosterPdfService, GrowthMarketingMobileService],
  exports: [SocialTemplatesService, ShareableSlotsService, StatementsService, VerificationCoreModule],
})
export class ProviderMarketingModule {}
