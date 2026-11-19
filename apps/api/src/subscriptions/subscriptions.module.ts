import { Module } from "@nestjs/common";
import { LegalModule } from "../legal/legal.module";
import { MarketplaceListingService } from "../marketplace/marketplace-listing.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { DunningScheduler } from "./dunning.scheduler";
import { DunningService } from "./dunning.service";
import { SubscriptionAccessGuard } from "./subscription-access.guard";
import { SubscriptionLifecycleScheduler } from "./subscription-lifecycle.scheduler";
import { SubscriptionLifecycleService } from "./subscription-lifecycle.service";
import { BillingSeatService } from "./billing-seat.service";
import { SubscriptionService } from "./subscription.service";
import { TrialEngineService } from "./trial-engine.service";

@Module({
  imports: [LegalModule],
  providers: [
    BillingSeatService,
    SubscriptionService,
    SubscriptionLifecycleService,
    SubscriptionLifecycleScheduler,
    TrialEngineService,
    DunningService,
    DunningScheduler,
    SubscriptionAccessGuard,
    OutboxEventService,
    MarketplaceListingService,
  ],
  exports: [
    BillingSeatService,
    SubscriptionService,
    SubscriptionLifecycleService,
    TrialEngineService,
    DunningService,
    SubscriptionAccessGuard,
  ],
})
export class SubscriptionsModule {}