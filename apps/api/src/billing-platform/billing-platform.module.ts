import { Module } from "@nestjs/common";
import { CreditsModule } from "../credits/credits.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { KiorlyBillingPaymentsController } from "./kiorly-billing-payments.controller";
import { KiorlyInvoicesController } from "./kiorly-invoices.controller";
import { KiorlyInvoicesService } from "./kiorly-invoices.service";
import { KiorlyPaymentMethodsService } from "./kiorly-payment-methods.service";
import { KiorlyPaymentScheduler } from "./kiorly-payment.scheduler";
import { KiorlyPaymentService } from "./kiorly-payment.service";
import { KiorlyPaymentsWebhookController } from "./kiorly-payments-webhook.controller";
import { PaymentGatewayRegistry } from "./payment-gateways/payment-gateway.registry";
import { SettlementController } from "./settlement.controller";
import { SettlementScheduler } from "./settlement.scheduler";
import { SettlementService } from "./settlement.service";

@Module({
  imports: [CreditsModule, SubscriptionsModule],
  controllers: [
    KiorlyInvoicesController,
    KiorlyBillingPaymentsController,
    KiorlyPaymentsWebhookController,
    SettlementController,
  ],
  providers: [
    PaymentGatewayRegistry,
    KiorlyPaymentMethodsService,
    KiorlyPaymentService,
    KiorlyPaymentScheduler,
    KiorlyInvoicesService,
    SettlementService,
    SettlementScheduler,
  ],
  exports: [KiorlyInvoicesService, KiorlyPaymentService, SettlementService],
})
export class BillingPlatformModule {}