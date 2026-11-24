import { Module } from "@nestjs/common";
import { FeatureFlagsModule } from "../../feature-flags/feature-flags.module";
import { MarketplaceModule } from "../../marketplace/marketplace.module";
import { GrowthInsightsService } from "./growth-insights.service";
import { ProviderLinkCoreModule } from "./provider-link-core.module";
import { ProviderLinksController } from "./provider-links.controller";
import { ProviderLinksService } from "./provider-links.service";
import { PublicLinkController } from "./public-link.controller";

/** GRW-P1-D1 Growth & Marketing workspace API. Separate from GrowthModule (referrals) because BillingPlatformModule -> GrowthModule is imported by MarketplaceModule, and this module needs MarketplaceModule (profile republish). */
@Module({
  imports: [FeatureFlagsModule, MarketplaceModule, ProviderLinkCoreModule],
  controllers: [ProviderLinksController, PublicLinkController],
  providers: [ProviderLinksService, GrowthInsightsService],
  exports: [ProviderLinksService],
})
export class ProviderLinksModule {}
