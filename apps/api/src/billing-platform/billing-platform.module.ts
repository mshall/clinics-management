import { Module } from "@nestjs/common";
import { CreditsModule } from "../credits/credits.module";
import { GrowthModule } from "../growth/growth.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { KiorlyBillingPaymentsController } from "./kiorly-billing-payments.controller";
import { KiorlyInvoicesController } from "./kiorly-invoices.controller";
import { KiorlyInvoicesService } from "./kiorly-invoices.service";
import { KiorlyPaymentMethodsService } from "./kiorly-payment-methods.service";
import { KiorlyPaymentScheduler } from "./kiorly-payment.scheduler";
import { KiorlyPaymentService } from "./kiorly-payment.service";
import { KiorlyPaymentsWebhookController } from "./kiorly-payments-webhook.controller";
import { PaymentGatewayRegistry } from "./payment-gateways/payment-gateway.registry";
import { KiorexProgressController } from "./kiorex-progress.controller";
import { KiorexProgressService } from "./kiorex-progress.service";
import { SettlementController } from "./settlement.controller";
import { SettlementScheduler } from "./settlement.scheduler";
import { SettlementService } from "./settlement.service";

@Module({
  imports: [CreditsModule, SubscriptionsModule, GrowthModule],
  controllers: [
    KiorlyInvoicesController,
    KiorlyBillingPaymentsController,
    KiorlyPaymentsWebhookController,
    SettlementController,
    KiorexProgressController,
  ],
  providers: [
    PaymentGatewayRegistry,
    KiorlyPaymentMethodsService,
    KiorlyPaymentService,
    KiorlyPaymentScheduler,
    KiorlyInvoicesService,
    SettlementService,
    SettlementScheduler,
    KiorexProgressService,
  ],
  exports: [KiorlyInvoicesService, KiorlyPaymentService, SettlementService, KiorexProgressService],
})
export class BillingPlatformModule {}