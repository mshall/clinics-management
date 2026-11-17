import { Module } from "@nestjs/common";
import { LegalModule } from "../legal/legal.module";
import { DunningScheduler } from "./dunning.scheduler";
import { DunningService } from "./dunning.service";
import { SubscriptionAccessGuard } from "./subscription-access.guard";
import { SubscriptionLifecycleScheduler } from "./subscription-lifecycle.scheduler";
import { SubscriptionLifecycleService } from "./subscription-lifecycle.service";
import { SubscriptionService } from "./subscription.service";
import { TrialEngineService } from "./trial-engine.service";

@Module({
  imports: [LegalModule],
  providers: [
    SubscriptionService,
    SubscriptionLifecycleService,
    SubscriptionLifecycleScheduler,
    TrialEngineService,
    DunningService,
    DunningScheduler,
    SubscriptionAccessGuard,
  ],
  exports: [
    SubscriptionService,
    SubscriptionLifecycleService,
    TrialEngineService,
    DunningService,
    SubscriptionAccessGuard,
  ],
})
export class SubscriptionsModule {}