import { Module } from "@nestjs/common";
import { CreditsModule } from "../credits/credits.module";
import { MessagingModule } from "../messaging/messaging.module";
import { PatientsModule } from "../patients/patients.module";
import { CommissionChargeScheduler } from "./commission-charge.scheduler";
import { CommissionChargeService } from "./commission-charge.service";
import { CommissionDisputeService } from "./commission-dispute.service";
import { KiorexBillingChargesController } from "./kiorex-billing-charges.controller";
import { KiorexCommissionService } from "./kiorex-commission.service";
import { PlatformCommissionDisputesController } from "./platform-commission-disputes.controller";
import { PlatformKiorexRatesController } from "./platform-kiorex-rates.controller";
import { PublicKiorexFeesController } from "./public-kiorex-fees.controller";

@Module({
  imports: [CreditsModule, MessagingModule, PatientsModule],
  controllers: [
    PlatformKiorexRatesController,
    PlatformCommissionDisputesController,
    PublicKiorexFeesController,
    KiorexBillingChargesController,
  ],
  providers: [KiorexCommissionService, CommissionChargeService, CommissionDisputeService, CommissionChargeScheduler],
  exports: [KiorexCommissionService, CommissionChargeService, CommissionDisputeService],
})
export class KiorexModule {}