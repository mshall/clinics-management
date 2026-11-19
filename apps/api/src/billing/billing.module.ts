import { Module } from "@nestjs/common";
import { CreditsModule } from "../credits/credits.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { DepositSettlementService } from "./deposit-settlement.service";
import { KiorexDepositsService } from "./kiorex-deposits.service";
import { PatientMoneyController } from "./patient-money.controller";
import { PatientMoneyService } from "./patient-money.service";

@Module({
  imports: [SubscriptionsModule, CreditsModule],
  controllers: [BillingController, PatientMoneyController],
  providers: [BillingService, PatientMoneyService, DepositSettlementService, KiorexDepositsService],
  exports: [BillingService, PatientMoneyService, DepositSettlementService, KiorexDepositsService],
})
export class BillingModule {}
