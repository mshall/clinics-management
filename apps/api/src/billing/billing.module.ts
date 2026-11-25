import { Module } from "@nestjs/common";
import { ClinicalModule } from "../clinical/clinical.module";
import { CreditsModule } from "../credits/credits.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { CashierShiftService } from "./cashier-shift.service";
import { CashierShiftsController } from "./cashier-shifts.controller";
import { ClaimsController } from "./claims.controller";
import { ClaimsService } from "./claims.service";
import { SplitPaymentService } from "./split-payment.service";
import { SplitPaymentsController } from "./split-payments.controller";
import { DepositSettlementService } from "./deposit-settlement.service";
import { KiorexDepositsService } from "./kiorex-deposits.service";
import { NoShowGuaranteeScheduler } from "./no-show-guarantee.scheduler";
import { NoShowGuaranteeService } from "./no-show-guarantee.service";
import { PatientMoneyController } from "./patient-money.controller";
import { PayCollectionsController, PayLinkPublicController } from "./pay/pay-collections.controller";
import { PayCollectionsService } from "./pay/pay-collections.service";
import { PatientMoneyService } from "./patient-money.service";

@Module({
  imports: [SubscriptionsModule, CreditsModule, ClinicalModule],
  controllers: [
    BillingController,
    PatientMoneyController,
    CashierShiftsController,
    SplitPaymentsController,
    ClaimsController,
    PayCollectionsController,
    PayLinkPublicController,
  ],
  providers: [
    BillingService,
    CashierShiftService,
    SplitPaymentService,
    PatientMoneyService,
    DepositSettlementService,
    KiorexDepositsService,
    NoShowGuaranteeService,
    NoShowGuaranteeScheduler,
    ClaimsService,
    PayCollectionsService,
  ],
  exports: [
    BillingService,
    CashierShiftService,
    SplitPaymentService,
    PatientMoneyService,
    DepositSettlementService,
    KiorexDepositsService,
    NoShowGuaranteeService,
    ClaimsService,
  ],
})
export class BillingModule {}
