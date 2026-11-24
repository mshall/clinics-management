import { Module } from "@nestjs/common";
import { FeatureFlagsModule } from "../../feature-flags/feature-flags.module";
import { KiorexModule } from "../../kiorex/kiorex.module";
import { GrowthMobileController } from "../../mobile/growth-mobile.controller";
import { GrowthMobileService } from "../../mobile/growth-mobile.service";
import { MarketplaceModule } from "../../marketplace/marketplace.module";
import { GrowthInsightsService } from "./growth-insights.service";
import { ProviderLinkCoreModule } from "./provider-link-core.module";
import { ProviderLinksController } from "./provider-links.controller";
import { ProviderLinksService } from "./provider-links.service";
import { PublicLinkController } from "./public-link.controller";

/** GRW-P1-D1 Growth & Marketing workspace API. Separate from GrowthModule (referrals) because BillingPlatformModule -> GrowthModule is imported by MarketplaceModule, and this module needs MarketplaceModule (profile republish). */
@Module({
  imports: [FeatureFlagsModule, MarketplaceModule, ProviderLinkCoreModule, KiorexModule],
  controllers: [ProviderLinksController, PublicLinkController, GrowthMobileController],
  providers: [ProviderLinksService, GrowthInsightsService, GrowthMobileService],
  exports: [ProviderLinksService, GrowthInsightsService, GrowthMobileService],
})
export class ProviderLinksModule {}
