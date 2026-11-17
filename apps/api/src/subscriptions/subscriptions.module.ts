import { Module } from "@nestjs/common";
import { LegalModule } from "../legal/legal.module";
import { SubscriptionLifecycleScheduler } from "./subscription-lifecycle.scheduler";
import { SubscriptionLifecycleService } from "./subscription-lifecycle.service";
import { SubscriptionService } from "./subscription.service";

@Module({
  imports: [LegalModule],
  providers: [SubscriptionService, SubscriptionLifecycleService, SubscriptionLifecycleScheduler],
  exports: [SubscriptionService, SubscriptionLifecycleService],
})
export class SubscriptionsModule {}