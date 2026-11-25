import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LegalModule } from "../legal/legal.module";
import { PlatformSubscriptionsController } from "./platform-subscriptions.controller";
import { PlatformSubscriptionsService } from "./platform-subscriptions.service";
import { SubscriptionPolicyService } from "./subscription-policy.service";
import { MarketplaceListingService } from "../marketplace/marketplace-listing.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { DunningScheduler } from "./dunning.scheduler";
import { DunningService } from "./dunning.service";
import { SubscriptionAccessGuard } from "./subscription-access.guard";
import { SubscriptionLifecycleScheduler } from "./subscription-lifecycle.scheduler";
import { SubscriptionLifecycleService } from "./subscription-lifecycle.service";
import { BillingSeatService } from "./billing-seat.service";
import { SubscriptionService } from "./subscription.service";
import { PlanComparisonService } from "./plan-comparison.service";
import { SubscriptionRenewalService } from "./subscription-renewal.service";
import { TrialEngineService } from "./trial-engine.service";

@Module({
  imports: [LegalModule, AuthModule],
  controllers: [PlatformSubscriptionsController],
  providers: [
    BillingSeatService,
    SubscriptionService,
    SubscriptionRenewalService,
    PlatformSubscriptionsService,
    SubscriptionPolicyService,
    PlanComparisonService,
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
    SubscriptionRenewalService,
    PlanComparisonService,
    SubscriptionLifecycleService,
    TrialEngineService,
    DunningService,
    SubscriptionAccessGuard,
  ],
})
export class SubscriptionsModule {}