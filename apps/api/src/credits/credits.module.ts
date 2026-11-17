import { Module } from "@nestjs/common";
import { CreditWalletScheduler } from "./credit-wallet.scheduler";
import { CreditWalletService } from "./credit-wallet.service";

@Module({
  providers: [CreditWalletService, CreditWalletScheduler],
  exports: [CreditWalletService],
})
export class CreditsModule {}