import { Module } from "@nestjs/common";
import { CreditsModule } from "../credits/credits.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { PatientMoneyController } from "./patient-money.controller";
import { PatientMoneyService } from "./patient-money.service";

@Module({
  imports: [SubscriptionsModule, CreditsModule],
  controllers: [BillingController, PatientMoneyController],
  providers: [BillingService, PatientMoneyService],
  exports: [BillingService, PatientMoneyService],
})
export class BillingModule {}
