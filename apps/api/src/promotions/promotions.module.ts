import { Module } from "@nestjs/common";
import { CreditsModule } from "../credits/credits.module";
import { MessagingModule } from "../messaging/messaging.module";
import { PromotionBudgetService } from "./promotion-budget.service";
import { PromotionCompletionConsumer } from "./promotion-completion.consumer";
import { PromotionReconcileService } from "./promotion-reconcile.service";
import { PromotionScheduler } from "./promotion.scheduler";
import { PromotionService } from "./promotion.service";
import { PromotionsController } from "./promotions.controller";

/** GRW-P2-S. The marketplace command controller lives in MarketplaceModule (it needs the HMAC guard); both use these services. */
@Module({
  imports: [CreditsModule, MessagingModule],
  controllers: [PromotionsController],
  providers: [PromotionService, PromotionBudgetService, PromotionCompletionConsumer, PromotionReconcileService, PromotionScheduler],
  exports: [PromotionService, PromotionBudgetService, PromotionCompletionConsumer, PromotionReconcileService, PromotionScheduler],
})
export class PromotionsModule {}
