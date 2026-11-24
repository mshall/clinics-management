import { Module } from "@nestjs/common";
import { CreditFeeDrawdownService } from "./credit-fee-drawdown.service";
import { CreditGrantsService } from "./credit-grants.service";
import { CreditPromotionHoldService } from "./credit-promotion-hold.service";
import { CreditReconcileService } from "./credit-reconcile.service";
import { CreditStatementService } from "./credit-statement.service";
import { CreditWalletScheduler } from "./credit-wallet.scheduler";
import { CreditWalletService } from "./credit-wallet.service";
import { CreditsController } from "./credits.controller";
import { UsageBundleService } from "./usage-bundles/usage-bundle.service";

@Module({
  controllers: [CreditsController],
  providers: [CreditWalletService, CreditWalletScheduler, CreditFeeDrawdownService, CreditGrantsService, CreditPromotionHoldService, CreditReconcileService, CreditStatementService, UsageBundleService],
  exports: [CreditWalletService, CreditFeeDrawdownService, CreditGrantsService, CreditPromotionHoldService, CreditStatementService, UsageBundleService],
})
export class CreditsModule {}
