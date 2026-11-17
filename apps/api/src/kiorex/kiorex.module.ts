import { Module } from "@nestjs/common";
import { CreditsModule } from "../credits/credits.module";
import { MessagingModule } from "../messaging/messaging.module";
import { CommissionChargeScheduler } from "./commission-charge.scheduler";
import { CommissionChargeService } from "./commission-charge.service";
import { KiorexBillingChargesController } from "./kiorex-billing-charges.controller";
import { KiorexCommissionService } from "./kiorex-commission.service";
import { PlatformKiorexRatesController } from "./platform-kiorex-rates.controller";
import { PublicKiorexFeesController } from "./public-kiorex-fees.controller";

@Module({
  imports: [CreditsModule, MessagingModule],
  controllers: [PlatformKiorexRatesController, PublicKiorexFeesController, KiorexBillingChargesController],
  providers: [KiorexCommissionService, CommissionChargeService, CommissionChargeScheduler],
  exports: [KiorexCommissionService, CommissionChargeService],
})
export class KiorexModule {}