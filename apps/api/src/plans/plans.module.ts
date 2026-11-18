import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PlatformPlansController } from "./platform-plans.controller";
import { PublicPlansController } from "./public-plans.controller";
import { PlansService } from "./plans.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { PriceIndexationScheduler } from "./price-indexation.scheduler";
import { PriceIndexationService } from "./price-indexation.service";

@Module({
  imports: [AuthModule],
  controllers: [PublicPlansController, PlatformPlansController],
  providers: [PlansService, PriceIndexationService, PriceIndexationScheduler, OutboxEventService],
  exports: [PlansService, PriceIndexationService],
})
export class PlansModule {}